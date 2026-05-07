/** @implements {IWalletAccount} */
export default class WalletAccountCosmos implements IWalletAccount {
    /**
     * Creates a new Cosmos wallet account.
     *
     * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
     * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
     * @param {CosmosWalletConfig} [config] - The configuration object.
     * @returns {Promise<WalletAccountCosmos>} The wallet account instance.
     */
    static create(seed: string | Uint8Array, path: string, config?: CosmosWalletConfig): Promise<WalletAccountCosmos>;
    /**
     * Use WalletAccountCosmos.create() instead of constructor.
     *
     * @param {DirectSecp256k1Wallet} wallet - The initialized wallet.
     * @param {SecureBuffer} privateKey - The private key in secure buffer.
     * @param {Uint8Array} publicKey - The public key.
     * @param {string} address - The account address.
     * @param {string} path - The full derivation path.
     * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
     */
    constructor(wallet: DirectSecp256k1Wallet, privateKey: SecureBuffer, publicKey: Uint8Array, address: string, path: string, resolvedConfig: ResolvedChainConfig);
    /**
     * The resolved wallet configuration.
     *
     * @protected
     * @type {ResolvedChainConfig}
     */
    protected _config: ResolvedChainConfig;
    /**
     * The full derivation path.
     *
     * @protected
     * @type {string}
     */
    protected _path: string;
    /**
     * The address prefix for Bech32 encoding.
     *
     * @protected
     * @type {string}
     */
    protected _prefix: string;
    /**
     * The wallet instance.
     *
     * @protected
     * @type {DirectSecp256k1Wallet}
     */
    protected _wallet: DirectSecp256k1Wallet;
    /**
     * The derived private key in a memory-safe buffer.
     *
     * @protected
     * @type {SecureBuffer}
     */
    protected _privateKey: SecureBuffer;
    /**
     * The public key.
     *
     * @protected
     * @type {Uint8Array}
     */
    protected _publicKey: Uint8Array;
    /**
     * The account address.
     *
     * @protected
     * @type {string}
     */
    protected _address: string;
    /**
     * Whether this account has been disposed.
     *
     * @protected
     * @type {boolean}
     */
    protected _disposed: boolean;
    /**
     * Throws an error if this account has been disposed.
     *
     * @protected
     * @throws {Error} If the account has been disposed.
     */
    protected _assertNotDisposed(): void;
    /**
     * Returns the account's address.
     *
     * @returns {Promise<string>} The address.
     */
    getAddress(): Promise<string>;
    /**
     * Returns the account's balance.
     *
     * @param {string} [denom] - The denomination to check (defaults to chain's native denom).
     * @returns {Promise<bigint>} The balance in base units.
     */
    getBalance(denom?: string): Promise<bigint>;
    /**
     * Parses the gas price from config into denom and amount.
     *
     * @protected
     * @returns {{gasDenom: string, gasAmount: string}} The parsed gas price.
     */
    protected _parseGasPrice(): {
        gasDenom: string;
        gasAmount: string;
    };
    /**
     * Extracts Bech32 prefix from an address.
     *
     * @param {string} address - The Bech32 address.
     * @returns {string} The Bech32 prefix.
     */
    _getBech32Prefix(address: string): string;
    /**
     * Returns IBC channel config for a destination Bech32 prefix.
     *
     * @param {string} prefix - The destination Bech32 prefix.
     * @returns {{ sourceChannel: string }} The IBC channel configuration.
     */
    _getIbcChannelConfigForPrefix(prefix: string): {
        sourceChannel: string;
    };
    /**
     * Returns the account balance for a specific token.
     *
     * @param {string} denom - The token denomination.
     * @returns {Promise<bigint>} The token balance in base units.
     */
    getTokenBalance(denom: string): Promise<bigint>;
    /**
     * Returns the account balances for a list of tokens.
     *
     * @param {string[]} denoms - The token denominations.
     * @returns {Promise<Record<string, bigint>>} The token balances (in base unit).
     */
    getTokenBalances(denoms: string[]): Promise<Record<string, bigint>>;
    /**
     * Transfers tokens to another address.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     */
    transfer(options: TransferOptions): Promise<TransferResult>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, "hash">>;
    /**
     * The account's key pair.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Signs a message.
     *
     * Uses ADR-36, the arbitrary message signing format.
     * The returned string is a JSON-encoded StdSignature.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The JSON-encoded Cosmos StdSignature.
     */
    sign(message: string): Promise<string>;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The JSON-encoded Cosmos StdSignature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Signs a transaction without broadcasting it.
     *
     * @param {Transaction} transaction - The transaction to sign.
     * @returns {Promise<unknown>} The signed Cosmos TxRaw transaction.
     */
    signTransaction(transaction: Transaction): Promise<unknown>;
    /**
     * Sends a transaction.
     *
     * @param {Transaction} transaction - The transaction to send (use CosmosTransaction format).
     * @returns {Promise<TransactionResult>} The transaction's result.
     */
    sendTransaction(transaction: Transaction): Promise<TransactionResult>;
    /**
     * Converts a generic transaction to a Cosmos transaction.
     *
     * @param {Transaction} transaction - The transaction to convert.
     * @returns {CosmosTransaction} The converted transaction.
     */
    _toCosmosTransaction(transaction: Transaction): CosmosTransaction;
    /**
     * Returns a read-only copy of the account.
     *
     * @returns {Promise<IWalletAccountReadOnly>} The read-only account.
     * @throws {Error} Not implemented for Cosmos.
     */
    toReadOnlyAccount(): Promise<IWalletAccountReadOnly>;
    /**
     * Quotes the cost of sending a transaction.
     *
     * @param {Transaction} _transaction - The transaction to quote (use CosmosTransaction format).
     * @returns {Promise<{fee: bigint}>} The estimated fee.
     */
    quoteSendTransaction(_transaction: Transaction): Promise<{
        fee: bigint;
    }>;
    /**
     * Returns the transaction receipt for a given transaction hash.
     *
     * @param {string} hash - The transaction hash.
     * @returns {Promise<object>} The transaction receipt.
     */
    getTransactionReceipt(hash: string): Promise<object>;
    /**
     * The derivation path's index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account (see BIP-44).
     *
     * @type {string}
     */
    get path(): string;
    /**
     * Whether this account has been disposed.
     *
     * @type {boolean}
     */
    get isDisposed(): boolean;
    /**
     * Disposes the wallet account, securely erasing all sensitive data from memory.
     * After calling this method, the account can no longer be used.
     */
    dispose(): void;
}
export type StdSignDoc = import("@cosmjs/amino").StdSignDoc;
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type Transaction = import("@tetherto/wdk-wallet").Transaction;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type CosmosTransaction = {
    /**
     * - The recipient address.
     */
    to: string;
    /**
     * - The amount to send.
     */
    amount: Array<{
        denom: string;
        amount: string;
    }>;
    /**
     * - Optional transaction memo.
     */
    memo?: string | undefined;
};
export type CosmosWalletConfig = {
    /**
     * - The chain name from chain-registry (e.g. 'juno', 'osmosis').
     */
    chainName?: string | undefined;
    /**
     * - Array of RPC endpoint URLs for fallback.
     */
    rpcEndpoints?: string[] | undefined;
    /**
     * - Max retry rounds for RPC fallback (default: 3).
     */
    retryCount?: number | undefined;
    /**
     * - Base delay in ms for exponential backoff (default: 150).
     */
    retryDelay?: number | undefined;
    /**
     * - The Bech32 address prefix (overrides registry, default: 'cosmos').
     */
    addressPrefix?: string | undefined;
    /**
     * - The native token denomination (overrides registry, default: 'uatom').
     */
    nativeDenom?: string | undefined;
    /**
     * - The BIP-44 coin type (overrides registry, default: 118).
     */
    coinType?: number | undefined;
    /**
     * - The gas price with denom (e.g. '0.025uatom').
     */
    gasPrice?: string | undefined;
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint | undefined;
    /**
     * - Optional IBC channel map keyed by destination Bech32 prefix.
     */
    ibcChannels?: Record<string, {
        sourceChannel: string;
    }> | undefined;
};
export type ResolvedChainConfig = import("./chain-config-resolver.js").ResolvedChainConfig;
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import SecureBuffer from './memory-safe/secure-buffer.js';
