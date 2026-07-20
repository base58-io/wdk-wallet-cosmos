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
import SeedSignerCosmos from './signers/seed-signer-cosmos.js'

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet').SignerError} SignerError */
/** @typedef {import('./signers/seed-signer-cosmos.js').ISignerCosmos} ISignerCosmos */
/** @typedef {import('./wallet-account-cosmos.js').CosmosWalletConfig} CosmosWalletConfig */

/**
 * @typedef {Object.<string, WalletAccountCosmos>} CosmosAccountsMap
 */

export default class WalletManagerCosmos extends WalletManager {
  /**
   * Creates a new wallet manager for Cosmos blockchains.
   *
   * Accepts a BIP-39 seed for backwards compatibility or a derivable Cosmos signer.
   *
   * @param {string | Uint8Array | ISignerCosmos} seedOrSigner - The seed or default Cosmos signer.
   * @param {CosmosWalletConfig} [config] - The configuration object.
   */
  constructor(seedOrSigner, config = {}) {
    const signer =
      typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array
        ? new SeedSignerCosmos(seedOrSigner, config)
        : /** @type {ISignerCosmos} */ (seedOrSigner)

    if (!signer || !signer.isDerivable) {
      throw new Error(
        'The default Cosmos signer must support account derivation.'
      )
    }

    super(signer, config)

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
   * @overload
   * @param {number} [index] - The index of the account to get (default: 0).
   * @param {{ signerName?: string }} [options] - Account options.
   * @returns {Promise<WalletAccountCosmos>} The account.
   * @throws {Error} If the signer is not registered.
   * @throws {SignerError} If the signer cannot derive accounts.
   */

  /**
   * Returns the account associated with a named signer.
   *
   * @overload
   * @param {string} signerName - The registered signer name.
   * @returns {Promise<WalletAccountCosmos>} The account.
   */

  /**
   * @param {number | string} [indexOrSignerName] - Account index or signer name.
   * @param {{ signerName?: string }} [options] - Account options.
   * @returns {Promise<WalletAccountCosmos>} The account.
   */
  async getAccount(indexOrSignerName = 0, options = {}) {
    this._assertNotDisposed()

    if (typeof indexOrSignerName === 'string') {
      const key = `${indexOrSignerName}#self`
      if (this._accounts[key]) {
        return /** @type {WalletAccountCosmos} */ (this._accounts[key])
      }

      const signer = /** @type {ISignerCosmos} */ (
        this.getSigner(indexOrSignerName)
      )
      const accountSigner = signer.isDerivable
        ? await signer.derive(
            signer.path
              ? signer.path.split('/').slice(-3).join('/')
              : "0'/0/0"
          )
        : signer
      const account = await WalletAccountCosmos.fromSigner(
        accountSigner,
        this._config
      )
      this._accounts[key] = account
      return account
    }

    return await this.getAccountByPath(`0'/0/${indexOrSignerName}`, options)
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/118'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @param {{ signerName?: string }} [options] - Account options.
   * @returns {Promise<WalletAccountCosmos>} The account.
   * @throws {Error} If the signer is not registered.
   * @throws {SignerError} If the signer cannot derive accounts.
   */
  async getAccountByPath(path, options = {}) {
    this._assertNotDisposed()

    const { signerName } = options
    const key = `${signerName ?? ''}:${path}`
    if (!this._accounts[key]) {
      const signer = /** @type {ISignerCosmos} */ (this.getSigner(signerName))
      const childSigner = await signer.derive(path)
      const account = await WalletAccountCosmos.fromSigner(
        childSigner,
        this._config
      )
      this._accounts[key] = account
    }

    return /** @type {WalletAccountCosmos} */ (this._accounts[key])
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

    // Dispose every account, including accounts backed by signers that do not
    // expose private keys. The base implementation only disposes local-key accounts.
    for (const account of Object.values(this._accounts)) {
      account?.dispose()
    }
    this._accounts = {}

    // The base implementation disposes the default and named signers.
    super.dispose()
    this._disposed = true
  }
}
