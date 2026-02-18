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
    constructor(seed: string | Uint8Array, config?: CosmosWalletConfig);
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
     * @example
     * // Returns the account with derivation path m/44'/118'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WalletAccountCosmos>} The account.
     */
    getAccount(index?: number): Promise<WalletAccountCosmos>;
    /**
     * Returns the wallet account at a specific BIP-44 derivation path.
     *
     * @example
     * // Returns the account with derivation path m/44'/118'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @returns {Promise<WalletAccountCosmos>} The account.
     */
    getAccountByPath(path: string): Promise<WalletAccountCosmos>;
    /**
     * Whether this manager has been disposed.
     *
     * @type {boolean}
     */
    get isDisposed(): boolean;
}
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type CosmosWalletConfig = import("./wallet-account-cosmos.js").CosmosWalletConfig;
export type CosmosAccountsMap = {
    [x: string]: WalletAccountCosmos;
};
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountCosmos from './wallet-account-cosmos.js';
