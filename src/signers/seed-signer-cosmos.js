'use strict'

import {
  encodeSecp256k1Signature,
  makeSignDoc,
  serializeSignDoc,
} from '@cosmjs/amino'
import { Secp256k1, Slip10, Slip10Curve, sha256, stringToPath } from '@cosmjs/crypto'
import { toBase64 } from '@cosmjs/encoding'
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import {
  AssertionError,
  ISigner,
  NotImplementedError,
  UnsupportedOperationError,
  ValueError,
} from '@tetherto/wdk-wallet'
import * as bip39 from 'bip39'
import { resolveChainConfig } from '../chain-config-resolver.js'
import SecureBuffer from '../memory-safe/secure-buffer.js'

/** @typedef {import('@cosmjs/amino').AminoSignResponse} AminoSignResponse */
/** @typedef {import('@cosmjs/amino').StdSignature} StdSignature */
/** @typedef {import('@cosmjs/amino').StdSignDoc} StdSignDoc */
/** @typedef {import('@cosmjs/proto-signing').AccountData} AccountData */
/** @typedef {import('@cosmjs/proto-signing').DirectSignResponse} DirectSignResponse */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('cosmjs-types/cosmos/tx/v1beta1/tx').SignDoc} SignDoc */
/** @typedef {import('../chain-config-resolver.js').CosmosWalletConfig} CosmosWalletConfig */
/** @typedef {import('../chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig */

const BIP_44_DERIVATION_PATH_PREFIX = "m/44'"
const DEFAULT_ACCOUNT_PATH = "0'/0/0"
const TEXT_ENCODER = new TextEncoder()

/**
 * Builds the ADR-36 sign document used for arbitrary message signing.
 *
 * @param {string} signer - The signer address.
 * @param {string} message - The message to sign.
 * @returns {import('@cosmjs/amino').StdSignDoc} The ADR-36 sign document.
 */
function buildAdr36SignDoc(signer, message) {
  return makeSignDoc(
    [
      {
        type: 'sign/MsgSignData',
        value: {
          signer,
          data: toBase64(TEXT_ENCODER.encode(message)),
        },
      },
    ],
    { amount: [], gas: '0' },
    '',
    '',
    0,
    0
  )
}

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
  get isDerivable() {
    throw new NotImplementedError('isDerivable')
  }

  /** @type {number | undefined} */
  get index() {
    throw new NotImplementedError('index')
  }

  /** @type {string | undefined} */
  get path() {
    throw new NotImplementedError('path')
  }

  /** @type {KeyPair} */
  get keyPair() {
    throw new NotImplementedError('keyPair')
  }

  /**
   * @param {string} relPath - Relative Cosmos BIP-44 path.
   * @returns {Promise<ISignerCosmos>}
   */
  async derive(relPath) {
    throw new NotImplementedError('derive(relPath)')
  }

  /** @returns {Promise<string>} */
  async getAddress() {
    throw new NotImplementedError('getAddress()')
  }

  /**
   * @param {string} message - Message to sign using ADR-36.
   * @returns {Promise<string>}
   */
  async sign(message) {
    throw new NotImplementedError('sign(message)')
  }

  /** @returns {Promise<readonly AccountData[]>} */
  async getAccounts() {
    throw new NotImplementedError('getAccounts()')
  }

  /**
   * @param {string} signerAddress - Signer address.
   * @param {SignDoc} signDoc - Direct sign document.
   * @returns {Promise<DirectSignResponse>}
   */
  async signDirect(signerAddress, signDoc) {
    throw new NotImplementedError('signDirect(signerAddress, signDoc)')
  }

  /**
   * @param {string} signerAddress - Signer address.
   * @param {StdSignDoc} signDoc - Amino (SIGN_MODE_LEGACY_AMINO_JSON) sign document.
   * @returns {Promise<AminoSignResponse>}
   */
  async signAmino(signerAddress, signDoc) {
    throw new NotImplementedError('signAmino(signerAddress, signDoc)')
  }

  dispose() {
    throw new NotImplementedError('dispose()')
  }
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
  constructor(seed, config = {}, options = {}) {
    super()

    if (!options.isChild && seed === null) {
      throw new ValueError('A seed is required for a root Cosmos signer.')
    }

    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new ValueError('The seed phrase is invalid.')
      }
      seed = bip39.mnemonicToSeedSync(seed)
    }

    /** @private @type {ResolvedChainConfig} */
    this._config = resolveChainConfig(config)
    /** @private @type {string} */
    this._relativePath = options.path || DEFAULT_ACCOUNT_PATH
    /** @private @type {string} */
    this._path = `${BIP_44_DERIVATION_PATH_PREFIX}/${this._config.coinType}'/${this._relativePath}`
    /** @private @type {SecureBuffer | undefined} */
    this._seed =
      seed instanceof Uint8Array && !options.isChild
        ? new SecureBuffer(new Uint8Array(seed))
        : undefined
    /** @private @type {SecureBuffer | undefined} */
    this._privateKey = undefined
    /** @private @type {Uint8Array | undefined} */
    this._publicKey = undefined
    /** @private @type {string | undefined} */
    this._address = undefined
    /** @private @type {DirectSecp256k1Wallet | undefined} */
    this._wallet = undefined
    /** @private @type {Promise<void> | undefined} */
    this._initializing = undefined
    /** @private */
    this._disposed = false
  }

  /** @type {boolean} */
  get isDerivable() {
    return Boolean(this._seed && !this._seed.isDisposed)
  }

  /** @type {number | undefined} */
  get index() {
    const lastPathPart = this._path.split('/').pop()
    return lastPathPart === undefined ? undefined : parseInt(lastPathPart, 10)
  }

  /** @type {string} */
  get path() {
    return this._path
  }

  /** @type {KeyPair} */
  get keyPair() {
    this._assertInitialized()
    return {
      privateKey: this._privateKey ? this._privateKey.buffer : null,
      publicKey: /** @type {Uint8Array} */ (this._publicKey),
    }
  }

  /**
   * @param {string} relPath - Relative Cosmos BIP-44 path.
   * @returns {Promise<SeedSignerCosmos>}
   * @throws {UnsupportedOperationError} If this signer cannot derive.
   */
  async derive(relPath) {
    this._assertNotDisposed()
    if (!this._seed || this._seed.isDisposed) {
      throw new UnsupportedOperationError('derive(relPath)')
    }

    const child = new SeedSignerCosmos(null, this._config, {
      path: relPath,
      isChild: true,
    })
    await child._initializeFromSeed(this._seed.buffer)
    return child
  }

  /** @returns {Promise<string>} */
  async getAddress() {
    await this._initialize()
    return /** @type {string} */ (this._address)
  }

  /**
   * @param {string} message - Message to sign using ADR-36.
   * @returns {Promise<string>}
   */
  async sign(message) {
    await this._initialize()
    const address = /** @type {string} */ (this._address)
    const { signature } = await this.signAmino(
      address,
      buildAdr36SignDoc(address, message)
    )

    return JSON.stringify(signature)
  }

  /** @returns {Promise<readonly AccountData[]>} */
  async getAccounts() {
    await this._initialize()
    return await /** @type {DirectSecp256k1Wallet} */ (
      this._wallet
    ).getAccounts()
  }

  /**
   * @param {string} signerAddress - Signer address.
   * @param {SignDoc} signDoc - Direct sign document.
   * @returns {Promise<DirectSignResponse>}
   */
  async signDirect(signerAddress, signDoc) {
    await this._initialize()
    return await /** @type {DirectSecp256k1Wallet} */ (
      this._wallet
    ).signDirect(signerAddress, signDoc)
  }

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
  async signAmino(signerAddress, signDoc) {
    await this._initialize()

    if (signerAddress !== this._address) {
      throw new ValueError(`Address ${signerAddress} not found in wallet`)
    }

    return {
      signed: signDoc,
      signature: this._createSignature(sha256(serializeSignDoc(signDoc))),
    }
  }

  dispose() {
    if (this._disposed) return

    this._privateKey?.dispose()
    this._seed?.dispose()
    this._wallet = undefined
    this._address = undefined
    this._disposed = true
  }

  /**
   * Signs a 32-byte hash with this signer's key, in the fixed-length (r || s)
   * encoding Cosmos expects.
   *
   * @private
   * @param {Uint8Array} messageHash - The hash to sign.
   * @returns {StdSignature} The encoded secp256k1 signature.
   */
  _createSignature(messageHash) {
    const signature = Secp256k1.createSignature(
      messageHash,
      /** @type {SecureBuffer} */ (this._privateKey).buffer
    )
    const fixedLengthSignature = new Uint8Array(64)
    fixedLengthSignature.set(signature.r(32), 0)
    fixedLengthSignature.set(signature.s(32), 32)

    return encodeSecp256k1Signature(
      /** @type {Uint8Array} */ (this._publicKey),
      fixedLengthSignature
    )
  }

  /** @private */
  _assertNotDisposed() {
    if (this._disposed) {
      throw new AssertionError('Cannot use disposed Cosmos signer.')
    }
  }

  /** @private */
  _assertInitialized() {
    this._assertNotDisposed()
    if (!this._privateKey || !this._publicKey || !this._address || !this._wallet) {
      throw new AssertionError('Cosmos signer has not been initialized.')
    }
  }

  /** @private @returns {Promise<void>} */
  async _initialize() {
    this._assertNotDisposed()
    if (this._wallet) return
    if (!this._seed) {
      throw new AssertionError('Cosmos signer has no key material.')
    }
    if (!this._initializing) {
      this._initializing = this._initializeFromSeed(this._seed.buffer)
    }
    await this._initializing
  }

  /**
   * @private
   * @param {Uint8Array} seed - Seed bytes used only during derivation.
   * @returns {Promise<void>}
   */
  async _initializeFromSeed(seed) {
    this._assertNotDisposed()
    const derivationPath = stringToPath(this._path)
    const { privkey } = Slip10.derivePath(
      Slip10Curve.Secp256k1,
      seed,
      derivationPath
    )

    this._privateKey = new SecureBuffer(privkey)
    this._wallet = await DirectSecp256k1Wallet.fromKey(
      this._privateKey.buffer,
      this._config.addressPrefix
    )
    const [account] = await this._wallet.getAccounts()
    this._publicKey = account.pubkey
    this._address = account.address
  }
}
