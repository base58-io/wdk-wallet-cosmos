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
     * Creates a wallet account from an initialized Cosmos signer.
     *
     * @param {ISignerCosmos} signer - The Cosmos signer.
     * @param {CosmosWalletConfig} [config] - The configuration object.
     * @returns {Promise<WalletAccountCosmos>} The wallet account instance.
     */
    static fromSigner(signer: ISignerCosmos, config?: CosmosWalletConfig): Promise<WalletAccountCosmos>;
    /**
     * Creates an account backed by a Cosmos signer.
     *
     * @param {ISignerCosmos} signer - The initialized Cosmos signer.
     * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
     */
    constructor(signer: ISignerCosmos, resolvedConfig: ResolvedChainConfig);
    /**
     * The resolved wallet configuration.
     *
     * @protected
     * @type {ResolvedChainConfig}
     */
    protected _config: ResolvedChainConfig;
    /**
     * The address prefix for Bech32 encoding.
     *
     * @protected
     * @type {string}
     */
    protected _prefix: string;
    /**
     * The signer used by this account.
     *
     * @protected
     * @type {ISignerCosmos}
     */
    protected _signer: ISignerCosmos;
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
     * Returns the account's compressed secp256k1 public key.
     *
     * Base64 encoded, since the JSON-RPC bridge to the host application cannot
     * carry raw bytes.
     *
     * @returns {Promise<string>} The base64-encoded 33-byte public key.
     */
    getPublicKey(): Promise<string>;
    /**
     * Ensures a requested signer address belongs to this account.
     *
     * @param {unknown} signerAddress - The requested signer address.
     * @param {string} context - The error message prefix.
     * @returns {Promise<string>} The validated signer address.
     * @private
     */
    private _assertSignerAddress;
    /**
     * Signs a protobuf `SignDoc` (SIGN_MODE_DIRECT), mirroring the cosmjs
     * `OfflineDirectSigner` contract with JSON-safe fields.
     *
     * Strictly string-in/string-out JSON: byte fields are base64 and the account
     * number is a decimal string, on the way in and on the way out.
     *
     * @param {SignDirectParams} params - The signer address and document to sign.
     * @returns {Promise<SignDirectResult>} The signature and the signed document.
     * @throws {Error} If the params are malformed or the signer address does not match.
     */
    signDirect(params: SignDirectParams): Promise<SignDirectResult>;
    /**
     * Signs an amino `StdSignDoc` (SIGN_MODE_LEGACY_AMINO_JSON), mirroring the
     * cosmjs `OfflineAminoSigner` contract.
     *
     * The document is already JSON-safe, so it is validated and signed as-is, then
     * echoed back alongside the signature.
     *
     * @param {SignAminoParams} params - The signer address and document to sign.
     * @returns {Promise<SignAminoResult>} The signature and the signed document.
     * @throws {Error} If the params are malformed or the signer address does not match.
     */
    signAmino(params: SignAminoParams): Promise<SignAminoResult>;
    /**
     * Signs a transaction without broadcasting it.
     *
     * @param {Transaction} transaction - The transaction to sign.
     * @returns {Promise<TxRaw>} The signed Cosmos transaction.
     */
    signTransaction(transaction: Transaction): Promise<TxRaw>;
    /**
     * Sends an unsigned or previously signed transaction.
     *
     * @param {Transaction | TxRaw} transaction - The transaction to send.
     * @returns {Promise<TransactionResult>} The transaction's result.
     */
    sendTransaction(transaction: Transaction | TxRaw): Promise<TransactionResult>;
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
     * Quotes the cost of sending an unsigned or signed transaction.
     *
     * @param {Transaction | TxRaw} transaction - The transaction to quote.
     * @returns {Promise<{fee: bigint}>} The estimated fee.
     */
    quoteSendTransaction(transaction: Transaction | TxRaw): Promise<{
        fee: bigint;
    }>;
    /**
     * Checks whether a transaction is an encoded Cosmos TxRaw object.
     *
     * @param {Transaction | TxRaw} transaction - The transaction to inspect.
     * @returns {boolean} Whether the transaction is signed.
     * @private
     */
    private _isSignedTransaction;
    /**
     * Reads the total fee from an encoded signed transaction.
     *
     * @param {Uint8Array} transactionBytes - Encoded TxRaw bytes.
     * @returns {bigint} The total transaction fee.
     * @private
     */
    private _getSignedTransactionFee;
    /**
     * Enforces the configured transaction fee limit.
     *
     * @param {bigint} fee - Transaction fee in base units.
     * @private
     */
    private _assertTransactionFeeWithinLimit;
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
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount<TxRaw>;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type Transaction = import("@tetherto/wdk-wallet").Transaction;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type ISignerCosmos = import("./signers/seed-signer-cosmos.js").ISignerCosmos;
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
     * - The maximum fee amount for transaction operations.
     */
    transactionMaxFee?: number | bigint | undefined;
    /**
     * - Optional IBC channel map keyed by destination Bech32 prefix.
     */
    ibcChannels?: Record<string, {
        sourceChannel: string;
    }> | undefined;
};
export type ResolvedChainConfig = import("./chain-config-resolver.js").ResolvedChainConfig;
export type StdSignDoc = import("@cosmjs/amino").StdSignDoc;
export type StdSignature = import("@cosmjs/amino").StdSignature;
/**
 * A protobuf `SignDoc` in JSON wire form.
 *
 * Byte fields are base64 strings and the account number is a decimal string, so
 * the document survives the JSON-RPC bridge between the wallet worklet and its
 * host application (that bridge rejects typed arrays and bigints).
 */
export type DirectSignDocJson = {
    /**
     * - The chain id the document is bound to.
     */
    chainId: string;
    /**
     * - The signer's account number, as a decimal string.
     */
    accountNumber: string;
    /**
     * - The base64-encoded protobuf `TxBody`.
     */
    bodyBytes: string;
    /**
     * - The base64-encoded protobuf `AuthInfo`.
     */
    authInfoBytes: string;
};
export type SignDirectParams = {
    /**
     * - The address expected to sign, must match this account.
     */
    signerAddress: string;
    /**
     * - The document to sign.
     */
    signDoc: DirectSignDocJson;
};
export type SignDirectResult = {
    /**
     * - The Cosmos signature over the document.
     */
    signature: StdSignature;
    /**
     * - The document that was actually signed.
     */
    signed: DirectSignDocJson;
};
export type SignAminoParams = {
    /**
     * - The address expected to sign, must match this account.
     */
    signerAddress: string;
    /**
     * - The document to sign, already JSON-safe.
     */
    signDoc: StdSignDoc;
};
export type SignAminoResult = {
    /**
     * - The Cosmos signature over the document.
     */
    signature: StdSignature;
    /**
     * - The document that was actually signed.
     */
    signed: StdSignDoc;
};
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
