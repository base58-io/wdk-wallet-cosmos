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
    constructor(seedOrSigner: string | Uint8Array | ISignerCosmos, config?: CosmosWalletConfig);
    /**
     * Whether this manager has been disposed.
     *
     * @protected
     * @type {boolean}
     */
    protected _disposed: boolean;
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
     * @throws {Error} If the manager has been disposed.
     */
    protected _assertNotDisposed(): void;
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
    getAccount(index?: number | undefined, options?: {
        signerName?: string;
    } | undefined): Promise<WalletAccountCosmos>;
    /**
     * Returns the account associated with a named signer.
     *
     * @overload
     * @param {string} signerName - The registered signer name.
     * @returns {Promise<WalletAccountCosmos>} The account.
     */
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
     * @throws {Error} If the signer is not registered.
     * @throws {SignerError} If the signer cannot derive accounts.
     */
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountCosmos>;
    /**
     * Whether this manager has been disposed.
     *
     * @type {boolean}
     */
    get isDisposed(): boolean;
}
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type SignerError = import("@tetherto/wdk-wallet").SignerError;
export type ISignerCosmos = import("./signers/seed-signer-cosmos.js").ISignerCosmos;
export type CosmosWalletConfig = import("./wallet-account-cosmos.js").CosmosWalletConfig;
export type CosmosAccountsMap = {
    [x: string]: WalletAccountCosmos;
};
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountCosmos from './wallet-account-cosmos.js';
