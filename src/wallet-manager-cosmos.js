'use strict'

import WalletManager from '@tetherto/wdk-wallet'
import WalletAccountCosmos from './wallet-account-cosmos.js'
import { resolveChainConfig } from './chain-config-resolver.js'
import {
  DEFAULT_GAS_PRICE_STEP,
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
  extractGasPrice,
} from './gas-fee-utils.js'
import SecureBuffer from './memory-safe/secure-buffer.js'

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('./wallet-account-cosmos.js').CosmosWalletConfig} CosmosWalletConfig */

/**
 * @typedef {Object.<string, WalletAccountCosmos>} CosmosAccountsMap
 */

export default class WalletManagerCosmos extends WalletManager {
  /**
   * Creates a new wallet manager for Cosmos blockchains.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
   * @param {CosmosWalletConfig} [config] - The configuration object.
   */
  constructor(seed, config = {}) {
    super(seed, config)

    /**
     * The Cosmos wallet configuration.
     *
     * @override
     * @protected
     * @type {CosmosWalletConfig}
     */
    this._config = config

    /**
     * Whether this manager has been disposed.
     *
     * @protected
     * @type {boolean}
     */
    this._disposed = false
  }

  /**
   * Returns the Cosmos wallet configuration.
   *
   * @protected
   * @returns {CosmosWalletConfig} The configuration.
   */
  get _cosmosConfig() {
    return /** @type {CosmosWalletConfig} */ (this._config)
  }

  /**
   * Throws an error if this manager has been disposed.
   *
   * @protected
   * @throws {Error} If the manager has been disposed.
   */
  _assertNotDisposed() {
    if (this._disposed) {
      throw new Error('Cannot use disposed wallet manager')
    }
  }

  /**
   * Returns the wallet account at a specific index (see BIP-44).
   *
   * @example
   * // Returns the account with derivation path m/44'/118'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {Promise<WalletAccountCosmos>} The account.
   */
  async getAccount(index = 0) {
    this._assertNotDisposed()
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/118'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountCosmos>} The account.
   */
  async getAccountByPath(path) {
    this._assertNotDisposed()

    if (!this._accounts[path]) {
      const account = await WalletAccountCosmos.create(
        this.seed,
        path,
        this._config
      )

      // @ts-ignore - Cosmos uses chain-specific transaction types
      this._accounts[path] = account
    }

    // @ts-ignore - Cosmos uses chain-specific transaction types
    return this._accounts[path]
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<FeeRates>} The fee rates (in uatom).
   */
  async getFeeRates() {
    this._assertNotDisposed()

    const resolvedConfig = resolveChainConfig(this._cosmosConfig)

    if (
      !resolvedConfig.rpcEndpoints ||
      resolvedConfig.rpcEndpoints.length === 0
    ) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to get fee rates.'
      )
    }

    let normalFeeRate
    let fastFeeRate

    if (resolvedConfig.gasPriceStep) {
      normalFeeRate = calculateFeeAmountFromGasPrice(
        resolvedConfig.gasPriceStep.average,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      fastFeeRate = calculateFeeAmountFromGasPrice(
        resolvedConfig.gasPriceStep.high,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
    }

    if (normalFeeRate === undefined || fastFeeRate === undefined) {
      const fallbackGasPrice = extractGasPrice(resolvedConfig.gasPrice)
      const fallbackFeeRate =
        fallbackGasPrice !== undefined
          ? calculateFeeAmountFromGasPrice(
              fallbackGasPrice.gasPriceAmount,
              DEFAULT_TRANSFER_GAS_LIMIT
            )
          : undefined

      normalFeeRate = fallbackFeeRate
      fastFeeRate = fallbackFeeRate
    }

    if (normalFeeRate === undefined || fastFeeRate === undefined) {
      normalFeeRate = calculateFeeAmountFromGasPrice(
        DEFAULT_GAS_PRICE_STEP.average,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      fastFeeRate = calculateFeeAmountFromGasPrice(
        DEFAULT_GAS_PRICE_STEP.high,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
    }

    if (normalFeeRate === undefined || fastFeeRate === undefined) {
      throw new Error(
        'Unable to derive fee rates from available gas price data.'
      )
    }

    return {
      normal: normalFeeRate,
      fast: fastFeeRate,
    }
  }

  /**
   * Whether this manager has been disposed.
   *
   * @type {boolean}
   */
  get isDisposed() {
    return this._disposed
  }

  /**
   * Disposes the wallet manager and all its accounts, securely erasing all sensitive data from memory.
   * After calling this method, the manager can no longer be used.
   */
  dispose() {
    if (this._disposed) {
      return
    }

    // Dispose all accounts first
    for (const account of Object.values(this._accounts)) {
      if (account && typeof account.dispose === 'function') {
        account.dispose()
      }
    }
    this._accounts = {}

    // Securely zero the seed if it's a Uint8Array
    if (this.seed instanceof Uint8Array) {
      SecureBuffer.zero(this.seed)
    }

    this._disposed = true
  }
}
