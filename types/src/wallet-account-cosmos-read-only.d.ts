import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
export type StdSignature = import('@cosmjs/amino').StdSignature;
export type IndexedTx = import('@cosmjs/stargate').IndexedTx;
export type Transaction = import('@tetherto/wdk-wallet').Transaction;
export type TransactionReceipt = import('@tetherto/wdk-wallet').TransactionReceipt;
export type TransferOptions = import('@tetherto/wdk-wallet').TransferOptions;
export type TransferResult = import('@tetherto/wdk-wallet').TransferResult;
export type CosmosWalletConfig = import('./chain-config-resolver.js').CosmosWalletConfig;
export type ResolvedChainConfig = import('./chain-config-resolver.js').ResolvedChainConfig;
export type CosmosTransactionReceipt = TransactionReceipt & {
    transaction: IndexedTx;
};
/**
 * A Cosmos wallet account without key material.
 *
 * Holds every path that only needs an address and an RPC endpoint: balances,
 * quotes, receipts and signature verification. {@link WalletAccountCosmos}
 * extends it with the signer-dependent operations.
 */
export default class WalletAccountCosmosReadOnly extends WalletAccountReadOnly {
    /**
     * The resolved wallet configuration.
     *
     * @protected
     * @type {ResolvedChainConfig}
     */
    _config: ResolvedChainConfig;
    /**
     * The address prefix for Bech32 encoding.
     *
     * @protected
     * @type {string}
     */
    _prefix: string;
    /**
     * Creates a read-only account.
     *
     * @param {string | undefined} address - The account's Bech32 address.
     * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
     */
    constructor(address: string | undefined, resolvedConfig: ResolvedChainConfig);
    /**
     * Creates a read-only account from an address and an unresolved configuration.
     *
     * @param {string} address - The account's Bech32 address.
     * @param {CosmosWalletConfig} [config] - The configuration object.
     * @returns {WalletAccountCosmosReadOnly} The read-only account.
     */
    static fromAddress(address: string, config?: CosmosWalletConfig): WalletAccountCosmosReadOnly;
    /** @type {number} */
    get defaultWaitInterval(): number;
    /**
     * Whether this account has been disposed. Read-only accounts hold no key
     * material, so they are never disposed.
     *
     * @type {boolean}
     */
    get isDisposed(): boolean;
    /**
     * Throws if this account has been disposed.
     *
     * @protected
     * @throws {AssertionError} If the account has been disposed.
     */
    protected _assertNotDisposed(): void;
    /**
     * Returns the configured RPC endpoints.
     *
     * @protected
     * @param {string} [operation] - The operation requiring the endpoints, used in error messages.
     * @returns {string[]} The RPC endpoints.
     * @throws {ProviderRequiredError} If no RPC endpoint is configured.
     */
    protected _assertRpcEndpoints(operation?: string): string[];
    /**
     * Runs an operation against the configured RPC endpoints, with fallback.
     *
     * @protected
     * @template T
     * @param {string[]} endpoints - The RPC endpoints to try.
     * @param {(endpoint: string) => Promise<T>} operation - The operation to run.
     * @returns {Promise<T>} The operation's result.
     */
    protected _withFallback<T>(endpoints: string[], operation: (endpoint: string) => Promise<T>): Promise<T>;
    /**
     * Returns the account's balance.
     *
     * @param {string} [denom] - The denomination to check (defaults to chain's native denom).
     * @returns {Promise<bigint>} The balance in base units.
     */
    getBalance(denom?: string): Promise<bigint>;
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
     * Builds the standard fee for a simple transfer.
     *
     * @protected
     * @returns {{ amount: Array<{denom: string, amount: string}>, gas: string }} The fee.
     */
    protected _buildTransferFee(): {
        amount: Array<{
            denom: string;
            amount: string;
        }>;
        gas: string;
    };
    /**
     * Extracts Bech32 prefix from an address.
     *
     * @param {string} address - The Bech32 address.
     * @returns {string} The Bech32 prefix.
     * @throws {ValueError} If the address is not a Bech32 address.
     */
    _getBech32Prefix(address: string): string;
    /**
     * Returns IBC channel config for a destination Bech32 prefix.
     *
     * @param {string} prefix - The destination Bech32 prefix.
     * @returns {{ sourceChannel: string }} The IBC channel configuration.
     * @throws {ValueError} If no channel is configured for the prefix.
     */
    _getIbcChannelConfigForPrefix(prefix: string): {
        sourceChannel: string;
    };
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, 'hash'>>;
    /**
     * Quotes the cost of sending an unsigned or signed transaction.
     *
     * @param {Transaction | TxRaw} transaction - The transaction to quote.
     * @returns {Promise<{fee: bigint}>} The estimated fee.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transaction max. fee option.
     */
    quoteSendTransaction(transaction: Transaction | TxRaw): Promise<{
        fee: bigint;
    }>;
    /**
     * Checks whether a transaction is an encoded Cosmos TxRaw object.
     *
     * @protected
     * @param {Transaction | TxRaw} transaction - The transaction to inspect.
     * @returns {boolean} Whether the transaction is signed.
     */
    protected _isSignedTransaction(transaction: Transaction | TxRaw): boolean;
    /**
     * Reads the total fee from an encoded signed transaction.
     *
     * @protected
     * @param {Uint8Array} transactionBytes - Encoded TxRaw bytes.
     * @returns {bigint} The total transaction fee.
     */
    protected _getSignedTransactionFee(transactionBytes: Uint8Array): bigint;
    /**
     * Enforces the configured transaction fee limit.
     *
     * @protected
     * @param {bigint} fee - Transaction fee in base units.
     * @throws {MaximumFeeExceededError} If the fee exceeds the limit.
     */
    protected _assertTransactionFeeWithinLimit(fee: bigint): void;
    /**
     * Enforces the configured transfer fee limit.
     *
     * @protected
     * @param {bigint} fee - Transfer fee in base units.
     * @throws {MaximumFeeExceededError} If the fee exceeds the limit.
     */
    protected _assertTransferFeeWithinLimit(fee: bigint): void;
    /**
     * Returns the indexed transaction for a hash, or null if it has not been
     * included in a block yet.
     *
     * @deprecated Use {@link getTransaction} instead, which returns a normalized receipt.
     * @param {string} hash - The transaction hash.
     * @returns {Promise<IndexedTx | null>} The indexed transaction, or null.
     */
    getTransactionReceipt(hash: string): Promise<IndexedTx | null>;
    /**
     * Returns a normalized, finality-based receipt for a transaction.
     *
     * A transaction that made it into a block is final: CometBFT does not fork.
     *
     * @param {string} hash - The transaction hash.
     * @returns {Promise<CosmosTransactionReceipt>} The normalized receipt.
     * @throws {NoSuchElementError} If no transaction has been found for the given hash.
     */
    getTransaction(hash: string): Promise<CosmosTransactionReceipt>;
    /**
     * Verifies an ADR-36 message signature against this account's address.
     *
     * The signature carries the public key it was produced with, so verification
     * needs no key material: the embedded key must both derive this account's
     * address and validate the signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The JSON-encoded Cosmos StdSignature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
}
