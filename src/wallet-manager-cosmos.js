'use strict'

import WalletManager, {
  AssertionError,
  DisposalError,
  ProviderRequiredError,
} from '@tetherto/wdk-wallet'
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
/** @typedef {import('@tetherto/wdk-wallet').InvalidSignerError} InvalidSignerError */
/** @typedef {import('@tetherto/wdk-wallet').NoSuchElementError} NoSuchElementError */
/** @typedef {import('@tetherto/wdk-wallet').UnsupportedOperationError} UnsupportedOperationError */
/** @typedef {import('./signers/seed-signer-cosmos.js').ISignerCosmos} ISignerCosmos */
/** @typedef {import('./wallet-account-cosmos.js').CosmosWalletConfig} CosmosWalletConfig */

/**
 * @typedef {Object.<string, WalletAccountCosmos>} CosmosAccountsMap
 */

/** @extends {WalletManager<ISignerCosmos>} */
export default class WalletManagerCosmos extends WalletManager {
  /**
   * Creates a new wallet manager for Cosmos blockchains.
   *
   * Accepts a BIP-39 seed phrase, raw seed bytes, or a derivable Cosmos signer.
   *
   * @param {string | Uint8Array | ISignerCosmos} seedOrSigner - The seed or default Cosmos signer.
   * @param {CosmosWalletConfig} [config] - The configuration object.
   * @throws {InvalidSignerError} If the given signer doesn't support account derivation.
   */
  constructor(seedOrSigner, config = {}) {
    const ownedSigner =
      typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array
        ? new SeedSignerCosmos(seedOrSigner, config)
        : undefined

    super(ownedSigner ?? /** @type {ISignerCosmos} */ (seedOrSigner), config)

    /**
     * The default signer created from the seed, owned and disposed by this manager.
     *
     * @private
     * @type {SeedSignerCosmos | undefined}
     */
    this._ownedSigner = ownedSigner

    /**
     * The Cosmos wallet configuration.
     *
     * @override
     * @protected
     * @type {CosmosWalletConfig}
     */
    this._config = config

    /**
     * The accounts derived so far, keyed by signer name and derivation path.
     *
     * @override
     * @protected
     * @type {CosmosAccountsMap}
     */
    this._accounts = {}
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
   * @throws {DisposalError} If the manager has been disposed.
   */
  _assertNotDisposed() {
    if (this.disposed) {
      throw new DisposalError('The wallet manager has been disposed.')
    }
  }

  /**
   * Returns the wallet account at a specific index (see BIP-44).
   *
   * @overload
   * @param {number} [index] - The index of the account to get (default: 0).
   * @param {{ signerName?: string }} [options] - Account options.
   * @returns {Promise<WalletAccountCosmos>} The account.
   * @throws {NoSuchElementError} If the signer is not registered.
   * @throws {UnsupportedOperationError} If the signer cannot derive accounts.
   */

  /**
   * Returns the account wrapping a named signer exactly as registered, without derivation.
   *
   * For a non-derivable signer that is its single account; for a derivable signer it is the
   * account at the signer's own path. Use `getAccount(index, { signerName })` or
   * `getAccountByPath(path, { signerName })` to derive from a named signer. Disposing the
   * returned account leaves the registered signer untouched.
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
        return this._accounts[key]
      }

      const signer = /** @type {ISignerCosmos} */ (
        this.getSigner(indexOrSignerName)
      )
      const account = await WalletAccountCosmos.fromSigner(signer, this._config)
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
   * @throws {NoSuchElementError} If the signer is not registered.
   * @throws {UnsupportedOperationError} If the signer cannot derive accounts.
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
        this._config,
        { shouldWipeSignerOnDisposal: true }
      )
      this._accounts[key] = account
    }

    return this._accounts[key]
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
      throw new ProviderRequiredError(
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
      throw new AssertionError(
        'Unable to derive fee rates from available gas price data.'
      )
    }

    return {
      normal: normalFeeRate,
      fast: fastFeeRate,
    }
  }

  /**
   * Disposes all the wallet accounts, securely erasing their sensitive data from memory.
   * After calling this method, the manager can no longer be used. Only the signer the manager
   * created from a seed is disposed; given signers remain the responsibility of whoever created them.
   */
  dispose() {
    if (this.disposed) {
      return
    }

    // Dispose every account, including accounts backed by signers that do not
    // expose private keys. The base implementation only disposes local-key accounts.
    for (const account of Object.values(this._accounts)) {
      account.dispose()
    }
    this._accounts = {}
    this._ownedSigner?.dispose()

    super.dispose()
  }
}
