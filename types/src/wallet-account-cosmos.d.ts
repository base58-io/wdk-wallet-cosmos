import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import WalletAccountCosmosReadOnly from './wallet-account-cosmos-read-only.js';
export type IWalletAccount = import('@tetherto/wdk-wallet').IWalletAccount<TxRaw>;
export type KeyPair = import('@tetherto/wdk-wallet').KeyPair;
export type Transaction = import('@tetherto/wdk-wallet').Transaction;
export type TransactionResult = import('@tetherto/wdk-wallet').TransactionResult;
export type TransferOptions = import('@tetherto/wdk-wallet').TransferOptions;
export type TransferResult = import('@tetherto/wdk-wallet').TransferResult;
export type ISignerCosmos = import('./signers/seed-signer-cosmos.js').ISignerCosmos;
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
     */
    constructor(signer: ISignerCosmos, resolvedConfig: ResolvedChainConfig);
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
     * Returns the account's address.
     *
     * @returns {Promise<string>} The address.
     */
    getAddress(): Promise<string>;
    /**
     * Transfers tokens to another address.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<TransferResult>} The transfer's result.
     */
    transfer(options: TransferOptions): Promise<TransferResult>;
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
     * Returns a read-only copy of the account, holding no key material.
     *
     * @returns {Promise<WalletAccountCosmosReadOnly>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountCosmosReadOnly>;
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
