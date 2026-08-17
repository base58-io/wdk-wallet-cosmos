import { ISigner } from '@tetherto/wdk-wallet';
export type AminoSignResponse = import('@cosmjs/amino').AminoSignResponse;
export type StdSignature = import('@cosmjs/amino').StdSignature;
export type StdSignDoc = import('@cosmjs/amino').StdSignDoc;
export type AccountData = import('@cosmjs/proto-signing').AccountData;
export type DirectSignResponse = import('@cosmjs/proto-signing').DirectSignResponse;
export type KeyPair = import('@tetherto/wdk-wallet').KeyPair;
export type SignDoc = import('cosmjs-types/cosmos/tx/v1beta1/tx').SignDoc;
export type CosmosWalletConfig = import('../chain-config-resolver.js').CosmosWalletConfig;
export type ResolvedChainConfig = import('../chain-config-resolver.js').ResolvedChainConfig;
/**
 * Interface for Cosmos signers.
 *
 * In addition to the base WDK signer contract, Cosmos signers are direct
 * CosmJS offline signers and expose the metadata required by wallet accounts.
 *
 * @extends {ISigner}
 * @interface
 */
export declare class ISignerCosmos extends ISigner {
    /** @type {boolean} */
    get isDerivable(): boolean;
    /** @type {number | undefined} */
    get index(): number | undefined;
    /** @type {string | undefined} */
    get path(): string | undefined;
    /** @type {KeyPair} */
    get keyPair(): KeyPair;
    /**
     * @param {string} relPath - Relative Cosmos BIP-44 path.
     * @returns {Promise<ISignerCosmos>}
     */
    derive(relPath: string): Promise<ISignerCosmos>;
    /** @returns {Promise<string>} */
    getAddress(): Promise<string>;
    /**
     * @param {string} message - Message to sign using ADR-36.
     * @returns {Promise<string>}
     */
    sign(message: string): Promise<string>;
    /** @returns {Promise<readonly AccountData[]>} */
    getAccounts(): Promise<readonly AccountData[]>;
    /**
     * @param {string} signerAddress - Signer address.
     * @param {SignDoc} signDoc - Direct sign document.
     * @returns {Promise<DirectSignResponse>}
     */
    signDirect(signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse>;
    /**
     * @param {string} signerAddress - Signer address.
     * @param {StdSignDoc} signDoc - Amino (SIGN_MODE_LEGACY_AMINO_JSON) sign document.
     * @returns {Promise<AminoSignResponse>}
     */
    signAmino(signerAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse>;
    dispose(): void;
}
/**
 * Memory-safe, derivable Cosmos signer backed by a BIP-39 seed.
 *
 * Root signers retain a copy of the seed and can derive child signers. Child
 * signers retain only their account private key and cannot derive further.
 *
 * @extends {ISignerCosmos}
 */
export default class SeedSignerCosmos extends ISignerCosmos {
    /** @private @type {ResolvedChainConfig} */
    _config;
    /** @private @type {string} */
    _relativePath;
    /** @private @type {string} */
    _path;
    /** @private @type {SecureBuffer | undefined} */
    _seed;
    /** @private @type {SecureBuffer | undefined} */
    _privateKey;
    /** @private @type {Uint8Array | undefined} */
    _publicKey;
    /** @private @type {string | undefined} */
    _address;
    /** @private @type {DirectSecp256k1Wallet | undefined} */
    _wallet;
    /** @private @type {Promise<void> | undefined} */
    _initializing;
    /** @private */
    _disposed;
    /**
     * @param {string | Uint8Array | null} seed - BIP-39 mnemonic or seed bytes.
     * @param {CosmosWalletConfig} [config] - Cosmos chain configuration.
     * @param {{ path?: string, isChild?: boolean }} [options] - Internal signer options.
     */
    constructor(seed: string | Uint8Array | null, config?: CosmosWalletConfig, options?: {
        path?: string;
        isChild?: boolean;
    });
    /** @type {boolean} */
    get isDerivable(): boolean;
    /** @type {number | undefined} */
    get index(): number | undefined;
    /** @type {string} */
    get path(): string;
    /** @type {KeyPair} */
    get keyPair(): KeyPair;
    /**
     * @param {string} relPath - Relative Cosmos BIP-44 path.
     * @returns {Promise<SeedSignerCosmos>}
     * @throws {UnsupportedOperationError} If this signer cannot derive.
     */
    derive(relPath: string): Promise<SeedSignerCosmos>;
    /** @returns {Promise<string>} */
    getAddress(): Promise<string>;
    /**
     * @param {string} message - Message to sign using ADR-36.
     * @returns {Promise<string>}
     */
    sign(message: string): Promise<string>;
    /** @returns {Promise<readonly AccountData[]>} */
    getAccounts(): Promise<readonly AccountData[]>;
    /**
     * @param {string} signerAddress - Signer address.
     * @param {SignDoc} signDoc - Direct sign document.
     * @returns {Promise<DirectSignResponse>}
     */
    signDirect(signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse>;
    /**
     * Signs an amino (SIGN_MODE_LEGACY_AMINO_JSON) document.
     *
     * The document is signed as provided and echoed back in the response, which
     * is what callers must use to assemble the broadcastable transaction.
     *
     * @param {string} signerAddress - Signer address, must match this signer's address.
     * @param {StdSignDoc} signDoc - Amino sign document.
     * @returns {Promise<AminoSignResponse>}
     * @throws {ValueError} If the signer address does not belong to this signer.
     */
    signAmino(signerAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse>;
    dispose(): void;
    /**
     * Signs a 32-byte hash with this signer's key, in the fixed-length (r || s)
     * encoding Cosmos expects.
     *
     * @private
     * @param {Uint8Array} messageHash - The hash to sign.
     * @returns {StdSignature} The encoded secp256k1 signature.
     */
    private _createSignature;
    /** @private */
    private _assertNotDisposed;
    /** @private */
    private _assertInitialized;
    /** @private @returns {Promise<void>} */
    private _initialize;
    /**
     * @private
     * @param {Uint8Array} seed - Seed bytes used only during derivation.
     * @returns {Promise<void>}
     */
    private _initializeFromSeed;
}
