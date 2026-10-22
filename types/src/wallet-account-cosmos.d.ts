import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import WalletAccountCosmosReadOnly from './wallet-account-cosmos-read-only.js';
export type Coin = import('@cosmjs/amino').Coin;
export type StdFee = import('@cosmjs/amino').StdFee;
export type EncodeObject = import('@cosmjs/proto-signing').EncodeObject;
export type DeliverTxResponse = import('@cosmjs/stargate').DeliverTxResponse;
export type IWalletAccount = import('@tetherto/wdk-wallet').IWalletAccount<TxRaw>;
export type KeyPair = import('@tetherto/wdk-wallet').KeyPair;
export type Transaction = import('@tetherto/wdk-wallet').Transaction;
export type TransactionResult = import('@tetherto/wdk-wallet').TransactionResult;
export type TransferOptions = import('@tetherto/wdk-wallet').TransferOptions;
export type TransferResult = import('@tetherto/wdk-wallet').TransferResult;
export type ISignerCosmos = import('./signers/seed-signer-cosmos.js').ISignerCosmos;
export type PreparedTransaction = {
    /**
     * - The messages to sign.
     */
    messages: EncodeObject[];
    /**
     * - The transaction memo.
     */
    memo: string;
    /**
     * - The fee at the simulated gas limit.
     */
    fee: StdFee;
    /**
     * - The fee amount in base units.
     */
    totalFee: bigint;
};
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
    memo?: string;
};
export type CosmosWalletConfig = import('./chain-config-resolver.js').CosmosWalletConfig;
export type ResolvedChainConfig = import('./chain-config-resolver.js').ResolvedChainConfig;
export type StdSignDoc = import('@cosmjs/amino').StdSignDoc;
export type StdSignature = import('@cosmjs/amino').StdSignature;
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
/** @implements {IWalletAccount} */
export default class WalletAccountCosmos extends WalletAccountCosmosReadOnly implements IWalletAccount {
    /**
     * The signer used by this account.
     *
     * @protected
     * @type {ISignerCosmos}
     */
    _signer: ISignerCosmos;
    /**
     * If true, disposes the signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    _shouldWipeSignerOnDisposal: boolean;
    /**
     * Whether this account has been disposed.
     *
     * @protected
     * @type {boolean}
     */
    _disposed: boolean;
    /**
     * Creates an account backed by a Cosmos signer.
     *
     * @param {ISignerCosmos} signer - The initialized Cosmos signer.
     * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
     * @param {boolean} [shouldWipeSignerOnDisposal] - If true, the account owns the signer and disposes it in {@link dispose}.
     */
    constructor(signer: ISignerCosmos, resolvedConfig: ResolvedChainConfig, shouldWipeSignerOnDisposal?: boolean);
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
     * The signer stays owned by the caller: disposing the account leaves it untouched,
     * unless `shouldWipeSignerOnDisposal` hands its ownership to the account.
     *
     * @param {ISignerCosmos} signer - The Cosmos signer.
     * @param {CosmosWalletConfig} [config] - The configuration object.
     * @param {{ shouldWipeSignerOnDisposal?: boolean }} [options] - Ownership options.
     * @returns {Promise<WalletAccountCosmos>} The wallet account instance.
     */
    static fromSigner(signer: ISignerCosmos, config?: CosmosWalletConfig, { shouldWipeSignerOnDisposal }?: {
        shouldWipeSignerOnDisposal?: boolean;
    }): Promise<WalletAccountCosmos>;
    /**
     * Returns the account's address.
     *
     * @returns {Promise<string>} The address.
     */
    getAddress(): Promise<string>;
    /**
     * Quotes the costs of a transfer by simulating it.
     *
     * @param {TransferOptions & { memo?: string }} options - The transfer's options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
     * @throws {ProviderError} If the provider fails to estimate the costs of the transfer.
     * @throws {Error} If the chain rejects the simulated transfer.
     */
    quoteTransfer(options: TransferOptions & {
        memo?: string;
    }): Promise<Omit<TransferResult, 'hash'>>;
    /**
     * Transfers tokens to another address.
     *
     * The transfer is simulated first, and signed with the simulated gas limit.
     *
     * @param {TransferOptions & { memo?: string }} options - The transfer's
     *   options. When `memo` is set it replaces the default transaction memo;
     *   on the IBC path it is also set on the `MsgTransfer` payload.
     * @returns {Promise<TransferResult>} The transfer's result.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
     * @throws {ProviderError} If the provider fails to estimate the costs of the transfer.
     * @throws {TransferError} If the transfer failed on chain for insufficient funds.
     * @throws {Error} If the chain rejects the simulated transfer, or the transfer failed on chain for any other reason.
     */
    transfer(options: TransferOptions & {
        memo?: string;
    }): Promise<TransferResult>;
    /**
     * Builds a transfer's message and prices it by simulation: a bank `MsgSend`
     * for a recipient with this chain's prefix, an IBC `MsgTransfer` over the
     * configured channel otherwise.
     *
     * @protected
     * @param {TransferOptions & { memo?: string }} options - The transfer's options.
     * @returns {Promise<PreparedTransaction>} The transfer, ready to sign.
     */
    protected _prepareTransfer({ token, recipient, amount, memo }: TransferOptions & {
        memo?: string;
    }): Promise<PreparedTransaction>;
    /**
     * Builds the bank `MsgSend` for an unsigned transaction and prices it by
     * simulation.
     *
     * @protected
     * @param {Transaction} transaction - The transaction.
     * @returns {Promise<PreparedTransaction>} The transaction, ready to sign.
     */
    protected _prepareTransaction(transaction: Transaction): Promise<PreparedTransaction>;
    /**
     * Simulates messages and builds the fee to sign them with.
     *
     * @protected
     * @param {EncodeObject[]} messages - The messages to sign.
     * @param {string} memo - The transaction memo.
     * @returns {Promise<PreparedTransaction>} The messages, ready to sign.
     */
    protected _prepareMessages(messages: EncodeObject[], memo: string): Promise<PreparedTransaction>;
    /**
     * Simulates messages and returns the gas limit to sign them with: the gas
     * used, scaled by `gasAdjustment` and rounded up.
     *
     * The simulated transaction carries a fee of one base unit of the gas price
     * denom, so the chain charges the fee deduction a signed transaction pays
     * for; without a fee the simulation under-reports gas. The fee amount barely
     * affects gas used.
     *
     * Transport failures fail over across the RPC endpoints. A simulation the
     * chain rejects (an ABCI error, e.g. insufficient funds or an invalid
     * message) is thrown at once with the chain's code and log.
     *
     * @protected
     * @param {EncodeObject[]} messages - The messages to simulate.
     * @param {string} memo - The transaction memo.
     * @returns {Promise<number>} The gas limit.
     * @throws {ProviderError} If every RPC endpoint fails to simulate the messages.
     * @throws {Error} If the chain rejects the simulation.
     */
    protected _estimateGas(messages: EncodeObject[], memo: string): Promise<number>;
    /**
     * The account's key pair, or null if the signer does not expose key material.
     *
     * @type {KeyPair | null}
     */
    get keyPair(): KeyPair | null;
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
     * Returns the account's compressed secp256k1 public key.
     *
     * Base64 encoded, since the JSON-RPC bridge to the host application cannot
     * carry raw bytes.
     *
     * @returns {Promise<string>} The base64-encoded 33-byte public key.
     */
    getPublicKey(): Promise<string>;
    /**
     * Returns the compressed secp256k1 public key the signer reports for this
     * account's address. Read from the signer's accounts rather than its key
     * pair, so signers that keep their key material private work too.
     *
     * @private
     * @returns {Promise<Uint8Array>} The 33-byte public key.
     */
    private _getSignerPublicKey;
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
     * @throws {ValueError} If the params are malformed or the signer address does not match.
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
     * @throws {ValueError} If the params are malformed or the signer address does not match.
     */
    signAmino(params: SignAminoParams): Promise<SignAminoResult>;
    /**
     * Quotes the cost of sending a transaction. An unsigned transaction is
     * simulated; a signed one is quoted at the fee it carries.
     *
     * @param {Transaction | TxRaw} transaction - The transaction to quote.
     * @returns {Promise<{fee: bigint}>} The estimated fee.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transaction max. fee option.
     * @throws {ProviderError} If the provider fails to estimate the costs of the transaction.
     * @throws {Error} If the chain rejects the simulated transaction.
     */
    quoteSendTransaction(transaction: Transaction | TxRaw): Promise<{
        fee: bigint;
    }>;
    /**
     * Signs a transaction without broadcasting it, at the simulated gas limit.
     *
     * @param {Transaction} transaction - The transaction to sign.
     * @returns {Promise<TxRaw>} The signed Cosmos transaction.
     * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transaction max. fee option.
     * @throws {ProviderError} If the provider fails to estimate the costs of the transaction.
     * @throws {Error} If the chain rejects the simulated transaction.
     */
    signTransaction(transaction: Transaction): Promise<TxRaw>;
    /**
     * Sends an unsigned or previously signed transaction. An unsigned
     * transaction is simulated and signed at the simulated gas limit; a signed
     * one is broadcast as-is.
     *
     * @param {Transaction | TxRaw} transaction - The transaction to send.
     * @returns {Promise<TransactionResult>} The transaction's result.
     * @throws {MaximumFeeExceededError} If the fee exceeds the transaction max. fee option.
     * @throws {ProviderError} If the provider fails to estimate the costs of the transaction.
     * @throws {TransactionError} If the transaction failed on chain for insufficient funds.
     * @throws {Error} If the chain rejects the simulated transaction, or the transaction failed on chain for any other reason.
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
     * Returns a read-only copy of the account, holding no key material.
     *
     * @returns {Promise<WalletAccountCosmosReadOnly>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountCosmosReadOnly>;
    /**
     * The derivation path of this account (see BIP-44), or null if the signer is
     * not bound to a derivation position.
     *
     * @type {string | null}
     */
    get path(): string | null;
    /**
     * Whether this account has been disposed.
     *
     * @type {boolean}
     */
    get disposed(): boolean;
    /**
     * Disposes the wallet account. After calling this method, the account can no longer be used.
     * The signer is disposed, securely erasing its key material, only if the account owns it.
     */
    dispose(): void;
}
