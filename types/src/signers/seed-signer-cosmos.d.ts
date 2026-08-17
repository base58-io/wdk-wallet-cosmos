/**
 * Interface for Cosmos signers.
 *
 * In addition to the base WDK signer contract, Cosmos signers are direct
 * CosmJS offline signers and expose the metadata required by wallet accounts.
 *
 * @extends {ISigner}
 * @interface
 */
export class ISignerCosmos extends ISigner {
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
    /**
     * @param {string | Uint8Array | null} seed - BIP-39 mnemonic or seed bytes.
     * @param {CosmosWalletConfig} [config] - Cosmos chain configuration.
     * @param {{ path?: string, isChild?: boolean }} [options] - Internal signer options.
     */
    constructor(seed: string | Uint8Array | null, config?: CosmosWalletConfig, options?: {
        path?: string;
        isChild?: boolean;
    });
    /** @private @type {ResolvedChainConfig} */
    private _config;
    /** @private @type {string} */
    private _relativePath;
    /** @private @type {string} */
    private _path;
    /** @private @type {SecureBuffer | undefined} */
    private _seed;
    /** @private @type {SecureBuffer | undefined} */
    private _privateKey;
    /** @private @type {Uint8Array | undefined} */
    private _publicKey;
    /** @private @type {string | undefined} */
    private _address;
    /** @private @type {DirectSecp256k1Wallet | undefined} */
    private _wallet;
    /** @private @type {Promise<void> | undefined} */
    private _initializing;
    /** @private */
    private _disposed;
    /** @type {string} */
    get path(): string;
    /**
     * @param {string} relPath - Relative Cosmos BIP-44 path.
     * @returns {Promise<SeedSignerCosmos>}
     * @throws {SignerError} If this signer cannot derive.
     */
    derive(relPath: string): Promise<SeedSignerCosmos>;
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
export type AminoSignResponse = import("@cosmjs/amino").AminoSignResponse;
export type StdSignature = import("@cosmjs/amino").StdSignature;
export type StdSignDoc = import("@cosmjs/amino").StdSignDoc;
export type AccountData = import("@cosmjs/proto-signing").AccountData;
export type DirectSignResponse = import("@cosmjs/proto-signing").DirectSignResponse;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type SignDoc = import("cosmjs-types/cosmos/tx/v1beta1/tx").SignDoc;
export type CosmosWalletConfig = import("../chain-config-resolver.js").CosmosWalletConfig;
export type ResolvedChainConfig = import("../chain-config-resolver.js").ResolvedChainConfig;
import { ISigner } from '@tetherto/wdk-wallet';
