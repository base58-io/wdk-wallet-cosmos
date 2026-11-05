import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
export type StdFee = import('@cosmjs/amino').StdFee;
export type StdSignature = import('@cosmjs/amino').StdSignature;
export type IndexedTx = import('@cosmjs/stargate').IndexedTx;
export type IbcQueries = import('@cosmjs/stargate').IbcExtension['ibc'];
export type CometClient = import('@cosmjs/tendermint-rpc').CometClient;
export type Transaction = import('@tetherto/wdk-wallet').Transaction;
export type TransactionReceipt = import('@tetherto/wdk-wallet').TransactionReceipt;
export type TransferOptions = import('@tetherto/wdk-wallet').TransferOptions;
export type TransferResult = import('@tetherto/wdk-wallet').TransferResult;
export type CosmosWalletConfig = import('./chain-config-resolver.js').CosmosWalletConfig;
export type ResolvedChainConfig = import('./chain-config-resolver.js').ResolvedChainConfig;
export type CosmosTransactionReceipt = TransactionReceipt & {
    transaction: IndexedTx;
};
export type IbcChannel = {
    /**
     * - The channel id on this chain, the `sourceChannel` of a transfer over it.
     */
    channelId: string;
    /**
     * - The channel id on the counterparty chain.
     */
    counterpartyChannelId: string;
    /**
     * - The chain id the channel leads to.
     */
    counterpartyChainId: string;
};
export type DenomTrace = {
    /**
     * - The denom on the chain the token is native to (e.g. `uatom`).
     */
    baseDenom: string;
    /**
     * - The hops the token took, most recent first: `path[0]` is the channel on this chain it arrived through.
     */
    path: {
        portId: string;
        channelId: string;
    }[];
    /**
     * - The chain the token arrived from: the counterparty of `path[0]`. For a single-hop token, the chain it is native to. Unset if that channel's light client is not Tendermint.
     */
    sourceChainId?: string;
};
/**
 * Returns the promise cached under a key, creating it on first use. A promise
 * that rejects is dropped, so the next call creates it again.
 *
 * @template K, V
 * @param {Map<K, Promise<V>>} cache - The cache.
 * @param {K} key - The key.
 * @param {() => Promise<V>} create - Creates the promise on a cache miss.
 * @returns {Promise<V>} The cached promise.
 */
export declare function cachePromise<K, V>(cache: Map<K, Promise<V>>, key: K, create: () => Promise<V>): Promise<V>;
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
     * The chain's open transfer channels, queried once per account.
     *
     * @private
     * @type {Promise<IbcChannel[]> | undefined}
     */
    _ibcChannels;
    /**
     * Resolved denom traces, keyed by denom. A trace never changes.
     *
     * @private
     * @type {Map<string, Promise<DenomTrace>>}
     */
    _denomTraces;
    /**
     * CometBFT clients, keyed by RPC endpoint.
     *
     * @protected
     * @type {Map<string, Promise<CometClient>>}
     */
    _cometClients: Map<string, Promise<CometClient>>;
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
    get disposed(): boolean;
    /**
     * Throws if this account has been disposed.
     *
     * @protected
     * @throws {DisposalError} If the account has been disposed.
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
     * Returns the account's CometBFT client for an RPC endpoint. The first call
     * connects, which asks the node for its CometBFT version; later calls reuse
     * that client. A failed connection is not kept.
     *
     * @protected
     * @param {string} endpoint - The RPC endpoint.
     * @returns {Promise<CometClient>} The CometBFT client.
     */
    protected _getCometClient(endpoint: string): Promise<CometClient>;
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
     * Returns the per-unit gas price: the registry's average gas price, else the
     * configured `gasPrice`, else the default average price in the native denom.
     *
     * @protected
     * @returns {{ denom: string, amount: number }} The gas price.
     */
    protected _parseGasPrice(): {
        denom: string;
        amount: number;
    };
    /**
     * Builds the fee for a gas limit, priced at {@link _parseGasPrice}.
     *
     * @protected
     * @param {number} gasLimit - The transaction's gas limit.
     * @returns {StdFee} The fee.
     */
    protected _buildFee(gasLimit: number): StdFee;
    /**
     * Extracts Bech32 prefix from an address.
     *
     * @param {string} address - The Bech32 address.
     * @returns {string} The Bech32 prefix.
     * @throws {ValueError} If the address is not a Bech32 address.
     */
    _getBech32Prefix(address: string): string;
    /**
     * Returns the ICS-20 `transfer` channels the account can send over, each
     * with the chain id it leads to.
     *
     * A chain configured by `chainName` reads them from chain-registry, with no
     * RPC query: one channel per counterparty, the one the registry prefers.
     * Its open channels on chain include stale ones, often hundreds of them.
     *
     * Any other chain, such as a local testnet, queries its open channels whose
     * counterparty is a Tendermint chain. Channels rarely change, so the account
     * queries them once and serves later calls from that result; a failed query
     * is not cached. Create a new account to pick up channels opened since.
     *
     * @returns {Promise<IbcChannel[]>} The transfer channels.
     * @throws {ProviderRequiredError} If the chain is not configured by `chainName` and no RPC endpoint is configured.
     */
    getIbcChannels(): Promise<IbcChannel[]>;
    /**
     * Returns where an `ibc/<hash>` denom came from, or null for a denom native
     * to this chain (anything without the `ibc/` prefix).
     *
     * Traces never change, so each denom is queried once per account.
     *
     * @param {string} denom - The denom, e.g. `ibc/27394FB0...` or `uatom`.
     * @returns {Promise<DenomTrace | null>} The trace, or null for a native denom.
     * @throws {ProviderRequiredError} If no RPC endpoint is configured.
     * @throws {Error} If the chain does not know the denom's hash.
     */
    getDenomTrace(denom: string): Promise<DenomTrace | null>;
    /**
     * Returns the open transfer channel leading to the chain behind a Bech32
     * prefix. The prefix resolves to candidate chain ids through `ibcChains`
     * and chain-registry; exactly one channel from `getIbcChannels` must lead to
     * one of them.
     *
     * @protected
     * @param {string} prefix - The destination Bech32 prefix.
     * @returns {Promise<IbcChannel>} The channel to transfer over.
     * @throws {ValueError} If the prefix is unknown, or no single channel leads to its chain.
     */
    protected _getIbcChannelForPrefix(prefix: string): Promise<IbcChannel>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * A read-only account cannot simulate the transfer (simulation needs the
     * sender's public key), so the quote uses the fixed
     * {@link DEFAULT_TRANSFER_GAS_LIMIT}.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
     * @throws {ValueError} If the recipient is on another chain that no single IBC channel leads to.
     */
    quoteTransfer(options: TransferOptions): Promise<Omit<TransferResult, 'hash'>>;
    /**
     * Quotes the cost of sending an unsigned or signed transaction.
     *
     * A signed transaction is quoted at the fee it carries. An unsigned one uses
     * the fixed {@link DEFAULT_TRANSFER_GAS_LIMIT}, since a read-only account
     * cannot simulate it.
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
