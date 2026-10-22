import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountCosmos from './wallet-account-cosmos.js';
export type FeeRates = import('@tetherto/wdk-wallet').FeeRates;
export type InvalidSignerError = import('@tetherto/wdk-wallet').InvalidSignerError;
export type NoSuchElementError = import('@tetherto/wdk-wallet').NoSuchElementError;
export type UnsupportedOperationError = import('@tetherto/wdk-wallet').UnsupportedOperationError;
export type ISignerCosmos = import('./signers/seed-signer-cosmos.js').ISignerCosmos;
export type CosmosWalletConfig = import('./wallet-account-cosmos.js').CosmosWalletConfig;
export type CosmosAccountsMap = Object<string, WalletAccountCosmos>;
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
export default class WalletManagerCosmos extends WalletManager<ISignerCosmos> {
    /**
     * The default signer created from the seed, owned and disposed by this manager.
     *
     * @private
     * @type {SeedSignerCosmos | undefined}
     */
    _ownedSigner;
    /**
     * The Cosmos wallet configuration.
     *
     * @override
     * @protected
     * @type {CosmosWalletConfig}
     */
    _config: CosmosWalletConfig;
    /**
     * The accounts derived so far, keyed by signer name and derivation path.
     *
     * @override
     * @protected
     * @type {CosmosAccountsMap}
     */
    _accounts: CosmosAccountsMap;
    /**
     * Creates a new wallet manager for Cosmos blockchains.
     *
     * Accepts a BIP-39 seed phrase, raw seed bytes, or a derivable Cosmos signer.
     *
     * @param {string | Uint8Array | ISignerCosmos} seedOrSigner - The seed or default Cosmos signer.
     * @param {CosmosWalletConfig} [config] - The configuration object.
     * @throws {InvalidSignerError} If the given signer doesn't support account derivation.
     */
    constructor(seedOrSigner: string | Uint8Array | ISignerCosmos, config?: CosmosWalletConfig);
    /**
     * Returns the Cosmos wallet configuration.
     *
     * @protected
     * @returns {CosmosWalletConfig} The configuration.
     */
    protected get _cosmosConfig(): CosmosWalletConfig;
    /**
     * Throws an error if this manager has been disposed.
     *
     * @protected
     * @throws {DisposalError} If the manager has been disposed.
     */
    protected _assertNotDisposed(): void;
    getAccount(index?: number, options?: {
        signerName?: string;
    }): Promise<WalletAccountCosmos>;
    getAccount(signerName: string): Promise<WalletAccountCosmos>;
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
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountCosmos>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in uatom).
     */
    getFeeRates(): Promise<FeeRates>;
    /**
     * Disposes all the wallet accounts, securely erasing their sensitive data from memory.
     * After calling this method, the manager can no longer be used. Only the signer the manager
     * created from a seed is disposed; given signers remain the responsibility of whoever created them.
     */
    dispose(): void;
}
