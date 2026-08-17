'use strict'

import { fromBase64, toBase64 } from '@cosmjs/encoding'
import { makeSignDoc as makeDirectSignDoc } from '@cosmjs/proto-signing'
import { SigningStargateClient, StargateClient } from '@cosmjs/stargate'
import { InvalidSignerError, ValueError } from '@tetherto/wdk-wallet'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { resolveChainConfig } from './chain-config-resolver.js'
import SeedSignerCosmos from './signers/seed-signer-cosmos.js'
import WalletAccountCosmosReadOnly from './wallet-account-cosmos-read-only.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount<TxRaw>} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').Transaction} Transaction */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('./signers/seed-signer-cosmos.js').ISignerCosmos} ISignerCosmos */

/**
 * @typedef {Object} CosmosTransaction
 * @property {string} to - The recipient address.
 * @property {Array<{denom: string, amount: string}>} amount - The amount to send.
 * @property {string} [memo] - Optional transaction memo.
 */

/**
 * @typedef {import('./chain-config-resolver.js').CosmosWalletConfig} CosmosWalletConfig
 */

/**
 * @typedef {import('./chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig
 */

/**
 * @typedef {import('@cosmjs/amino').StdSignDoc} StdSignDoc
 */

/**
 * @typedef {import('@cosmjs/amino').StdSignature} StdSignature
 */

/**
 * A protobuf `SignDoc` in JSON wire form.
 *
 * Byte fields are base64 strings and the account number is a decimal string, so
 * the document survives the JSON-RPC bridge between the wallet worklet and its
 * host application (that bridge rejects typed arrays and bigints).
 *
 * @typedef {Object} DirectSignDocJson
 * @property {string} chainId - The chain id the document is bound to.
 * @property {string} accountNumber - The signer's account number, as a decimal string.
 * @property {string} bodyBytes - The base64-encoded protobuf `TxBody`.
 * @property {string} authInfoBytes - The base64-encoded protobuf `AuthInfo`.
 */

/**
 * @typedef {Object} SignDirectParams
 * @property {string} signerAddress - The address expected to sign, must match this account.
 * @property {DirectSignDocJson} signDoc - The document to sign.
 */

/**
 * @typedef {Object} SignDirectResult
 * @property {StdSignature} signature - The Cosmos signature over the document.
 * @property {DirectSignDocJson} signed - The document that was actually signed.
 */

/**
 * @typedef {Object} SignAminoParams
 * @property {string} signerAddress - The address expected to sign, must match this account.
 * @property {StdSignDoc} signDoc - The document to sign, already JSON-safe.
 */

/**
 * @typedef {Object} SignAminoResult
 * @property {StdSignature} signature - The Cosmos signature over the document.
 * @property {StdSignDoc} signed - The document that was actually signed.
 */

const DECIMAL_STRING_PATTERN = /^(?:0|[1-9][0-9]*)$/

/**
 * Checks whether a value is a non-negative decimal integer string.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a decimal string.
 */
function isDecimalString(value) {
  return typeof value === 'string' && DECIMAL_STRING_PATTERN.test(value)
}

/**
 * Checks whether a value is a `{ denom, amount }` coin with a decimal amount.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a coin.
 */
function isCoin(value) {
  if (!value || typeof value !== 'object') return false
  const coin = /** @type {{ denom?: unknown, amount?: unknown }} */ (value)
  return typeof coin.denom === 'string' && isDecimalString(coin.amount)
}

/**
 * Checks whether a value is an amino `{ type, value }` message.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is an amino message.
 */
function isAminoMsg(value) {
  if (!value || typeof value !== 'object') return false
  const msg = /** @type {{ type?: unknown, value?: unknown }} */ (value)
  return (
    typeof msg.type === 'string' && Boolean(msg.value) && typeof msg.value === 'object'
  )
}

/**
 * Reads a required string field out of unvalidated JSON-RPC params.
 *
 * @param {unknown} value - The raw field value.
 * @param {string} context - The error message prefix.
 * @param {string} field - The field's path, used in error messages.
 * @returns {string} The field value.
 */
function parseStringField(value, context, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValueError(`${context}: ${field} must be a non-empty string.`)
  }
  return value
}

/**
 * Decodes a base64 byte field out of unvalidated JSON-RPC params.
 *
 * Byte fields are base64 only: hex or numeric-keyed objects (what a mangled
 * `Uint8Array` looks like after crossing the bridge) are rejected instead of
 * guessed at.
 *
 * @param {unknown} value - The raw field value.
 * @param {string} context - The error message prefix.
 * @param {string} field - The field's path, used in error messages.
 * @returns {Uint8Array} The decoded bytes.
 */
function parseBase64Field(value, context, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValueError(
      `${context}: ${field} must be a non-empty base64 string.`
    )
  }

  try {
    return fromBase64(value)
  } catch (_error) {
    throw new ValueError(`${context}: ${field} is not valid base64.`)
  }
}

/**
 * Parses a decimal account number string into the number CosmJS expects.
 *
 * @param {unknown} value - The raw field value.
 * @param {string} context - The error message prefix.
 * @param {string} field - The field's path, used in error messages.
 * @returns {number} The account number.
 */
function parseAccountNumber(value, context, field) {
  if (!isDecimalString(value)) {
    throw new ValueError(`${context}: ${field} must be a decimal string.`)
  }

  const accountNumber = Number(value)
  if (!Number.isSafeInteger(accountNumber)) {
    throw new ValueError(`${context}: ${field} is out of range.`)
  }

  return accountNumber
}

/**
 * Validates a `StdSignDoc` received over the JSON-RPC bridge.
 *
 * Amino documents are already JSON-safe, so the document is validated in place
 * and passed through untouched: the signature must cover exactly the document
 * the caller asked to sign.
 *
 * @param {unknown} value - The raw sign document.
 * @param {string} context - The error message prefix.
 * @returns {StdSignDoc} The validated sign document.
 */
function parseStdSignDoc(value, context) {
  if (!value || typeof value !== 'object') {
    throw new ValueError(`${context}: signDoc must be an object.`)
  }

  const signDoc = /** @type {Record<string, unknown>} */ (value)

  if (typeof signDoc.chain_id !== 'string') {
    throw new ValueError(`${context}: signDoc.chain_id must be a string.`)
  }
  if (!isDecimalString(signDoc.account_number)) {
    throw new ValueError(
      `${context}: signDoc.account_number must be a decimal string.`
    )
  }
  if (!isDecimalString(signDoc.sequence)) {
    throw new ValueError(`${context}: signDoc.sequence must be a decimal string.`)
  }
  if (typeof signDoc.memo !== 'string') {
    throw new ValueError(`${context}: signDoc.memo must be a string.`)
  }
  if (!Array.isArray(signDoc.msgs) || !signDoc.msgs.every(isAminoMsg)) {
    throw new ValueError(
      `${context}: signDoc.msgs must be an array of { type, value } messages.`
    )
  }
  if (!signDoc.fee || typeof signDoc.fee !== 'object') {
    throw new ValueError(`${context}: signDoc.fee must be an object.`)
  }

  const fee = /** @type {{ amount?: unknown, gas?: unknown }} */ (signDoc.fee)
  if (!Array.isArray(fee.amount) || !fee.amount.every(isCoin)) {
    throw new ValueError(
      `${context}: signDoc.fee.amount must be an array of { denom, amount } coins.`
    )
  }
  if (!isDecimalString(fee.gas)) {
    throw new ValueError(`${context}: signDoc.fee.gas must be a decimal string.`)
  }

  return /** @type {StdSignDoc} */ (value)
}

/** @implements {IWalletAccount} */
export default class WalletAccountCosmos extends WalletAccountCosmosReadOnly {
  /**
   * Creates an account backed by a Cosmos signer.
   *
   * @param {ISignerCosmos} signer - The initialized Cosmos signer.
   * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
   */
  constructor(signer, resolvedConfig) {
    // The address is served by the signer, which resolves it lazily.
    super(undefined, resolvedConfig)

    /**
     * The signer used by this account.
     *
     * @protected
     * @type {ISignerCosmos}
     */
    this._signer = signer

    /**
     * Whether this account has been disposed.
     *
     * @protected
     * @type {boolean}
     */
    this._disposed = false
  }

  /**
   * Creates a new Cosmos wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {CosmosWalletConfig} [config] - The configuration object.
   * @returns {Promise<WalletAccountCosmos>} The wallet account instance.
   */
  static async create(seed, path, config = {}) {
    const rootSigner = new SeedSignerCosmos(seed, config)
    try {
      const signer = await rootSigner.derive(path)
      return await WalletAccountCosmos.fromSigner(signer, config)
    } finally {
      rootSigner.dispose()
    }
  }

  /**
   * Creates a wallet account from an initialized Cosmos signer.
   *
   * @param {ISignerCosmos} signer - The Cosmos signer.
   * @param {CosmosWalletConfig} [config] - The configuration object.
   * @returns {Promise<WalletAccountCosmos>} The wallet account instance.
   */
  static async fromSigner(signer, config = {}) {
    await signer.getAddress()
    return new WalletAccountCosmos(signer, resolveChainConfig(config))
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The address.
   */
  async getAddress() {
    this._assertNotDisposed()
    return await this._signer.getAddress()
  }

  /**
   * Transfers tokens to another address.
   *
   * @param {TransferOptions & { memo?: string }} options - The transfer's
   *   options. When `memo` is set it replaces the default transaction memo;
   *   on the IBC path it is also set on the `MsgTransfer` payload.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer(options) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints('transfer tokens')

    const { token, recipient, amount, memo } = options
    const address = await this.getAddress()

    const recipientPrefix = this._getBech32Prefix(recipient)
    const isSamePrefix = recipientPrefix === this._config.addressPrefix

    const sendAmount = {
      denom: token,
      amount: amount.toString(),
    }

    const fee = this._buildTransferFee()

    const channelConfig = isSamePrefix
      ? null
      : this._getIbcChannelConfigForPrefix(recipientPrefix)
    const totalFee = BigInt(fee.amount[0].amount)

    this._assertTransferFeeWithinLimit(totalFee)

    const result = await this._withFallback(endpoints, async endpoint => {
      const client = await SigningStargateClient.connectWithSigner(
        endpoint,
        this._signer
      )

      if (isSamePrefix) {
        return client.sendTokens(
          address,
          recipient,
          [sendAmount],
          fee,
          memo ?? 'Transfer via WDK'
        )
      }

      const timeoutSeconds = 600
      const timeoutTimestampNanoseconds = String(
        (Date.now() + timeoutSeconds * 1000) * 1_000_000
      )

      const msgTransfer = {
        typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
        value: {
          sourcePort: 'transfer',
          sourceChannel: /** @type {{ sourceChannel: string }} */ (
            channelConfig
          ).sourceChannel,
          token: sendAmount,
          sender: address,
          receiver: recipient,
          timeoutHeight: undefined,
          timeoutTimestamp: timeoutTimestampNanoseconds,
          memo: memo ?? 'Transfer via WDK (IBC)',
        },
      }

      const broadcastResult = await client.signAndBroadcast(
        address,
        [msgTransfer],
        fee,
        memo ?? 'Transfer via WDK (IBC)'
      )

      return {
        transactionHash: broadcastResult.transactionHash,
      }
    })

    return {
      hash: result.transactionHash,
      fee: totalFee,
    }
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair() {
    this._assertNotDisposed()
    return this._signer.keyPair
  }

  /**
   * Signs a message.
   *
   * Uses ADR-36, the arbitrary message signing format.
   * The returned string is a JSON-encoded StdSignature.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The JSON-encoded Cosmos StdSignature.
   */
  async sign(message) {
    this._assertNotDisposed()
    return await this._signer.sign(message)
  }

  /**
   * Returns the account's compressed secp256k1 public key.
   *
   * Base64 encoded, since the JSON-RPC bridge to the host application cannot
   * carry raw bytes.
   *
   * @returns {Promise<string>} The base64-encoded 33-byte public key.
   */
  async getPublicKey() {
    this._assertNotDisposed()
    await this._signer.getAddress()
    return toBase64(this.keyPair.publicKey)
  }

  /**
   * Ensures a requested signer address belongs to this account.
   *
   * @param {unknown} signerAddress - The requested signer address.
   * @param {string} context - The error message prefix.
   * @returns {Promise<string>} The validated signer address.
   * @private
   */
  async _assertSignerAddress(signerAddress, context) {
    const requested = parseStringField(signerAddress, context, 'signerAddress')
    const address = await this.getAddress()

    if (requested !== address) {
      throw new ValueError(
        `${context}: signerAddress ${requested} does not belong to this account.`
      )
    }

    return address
  }

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
  async signDirect(params) {
    this._assertNotDisposed()

    const context = 'Invalid signDirect params'

    if (!params || typeof params !== 'object') {
      throw new ValueError(
        `${context}: an object with signerAddress and signDoc is required.`
      )
    }

    const signerAddress = await this._assertSignerAddress(
      params.signerAddress,
      context
    )

    if (!params.signDoc || typeof params.signDoc !== 'object') {
      throw new ValueError(`${context}: signDoc must be an object.`)
    }

    const { chainId, accountNumber, bodyBytes, authInfoBytes } = params.signDoc
    const signDoc = makeDirectSignDoc(
      parseBase64Field(bodyBytes, context, 'signDoc.bodyBytes'),
      parseBase64Field(authInfoBytes, context, 'signDoc.authInfoBytes'),
      parseStringField(chainId, context, 'signDoc.chainId'),
      parseAccountNumber(accountNumber, context, 'signDoc.accountNumber')
    )

    const { signature, signed } = await this._signer.signDirect(
      signerAddress,
      signDoc
    )

    return {
      signature,
      signed: {
        chainId: signed.chainId,
        accountNumber: signed.accountNumber.toString(),
        bodyBytes: toBase64(signed.bodyBytes),
        authInfoBytes: toBase64(signed.authInfoBytes),
      },
    }
  }

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
  async signAmino(params) {
    this._assertNotDisposed()

    const context = 'Invalid signAmino params'

    if (!params || typeof params !== 'object') {
      throw new ValueError(
        `${context}: an object with signerAddress and signDoc is required.`
      )
    }

    const signerAddress = await this._assertSignerAddress(
      params.signerAddress,
      context
    )
    const signDoc = parseStdSignDoc(params.signDoc, context)

    const { signature, signed } = await this._signer.signAmino(
      signerAddress,
      signDoc
    )

    return { signature, signed }
  }

  /**
   * Signs a transaction without broadcasting it.
   *
   * @param {Transaction} transaction - The transaction to sign.
   * @returns {Promise<TxRaw>} The signed Cosmos transaction.
   */
  async signTransaction(transaction) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints('sign transactions')

    const cosmosTransaction = this._toCosmosTransaction(transaction)
    const fee = this._buildTransferFee()
    this._assertTransactionFeeWithinLimit(BigInt(fee.amount[0].amount))

    const signerAddress = await this.getAddress()
    const message = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: signerAddress,
        toAddress: cosmosTransaction.to,
        amount: cosmosTransaction.amount,
      },
    }

    return await this._withFallback(endpoints, async endpoint => {
      const client = await SigningStargateClient.connectWithSigner(
        endpoint,
        this._signer
      )

      return client.sign(
        signerAddress,
        [message],
        fee,
        cosmosTransaction.memo || ''
      )
    })
  }

  /**
   * Sends an unsigned or previously signed transaction.
   *
   * @param {Transaction | TxRaw} transaction - The transaction to send.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction(transaction) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints('send transactions')

    if (this._isSignedTransaction(transaction)) {
      const signedTransaction = /** @type {TxRaw} */ (transaction)
      const transactionBytes = TxRaw.encode(signedTransaction).finish()
      const transactionFee = this._getSignedTransactionFee(transactionBytes)
      this._assertTransactionFeeWithinLimit(transactionFee)

      const result = await this._withFallback(endpoints, async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return await client.broadcastTx(transactionBytes)
      })

      return {
        hash: result.transactionHash,
        fee: transactionFee,
      }
    }

    const cosmosTransaction = this._toCosmosTransaction(
      /** @type {Transaction} */ (transaction)
    )
    const fee = this._buildTransferFee()
    const transactionFee = BigInt(fee.amount[0].amount)
    this._assertTransactionFeeWithinLimit(transactionFee)

    const senderAddress = await this.getAddress()

    const result = await this._withFallback(endpoints, async endpoint => {
      const client = await SigningStargateClient.connectWithSigner(
        endpoint,
        this._signer
      )

      return client.sendTokens(
        senderAddress,
        cosmosTransaction.to,
        cosmosTransaction.amount,
        fee,
        cosmosTransaction.memo
      )
    })

    return {
      hash: result.transactionHash,
      fee: transactionFee,
    }
  }

  /**
   * Converts a generic transaction to a Cosmos transaction.
   *
   * @param {Transaction} transaction - The transaction to convert.
   * @returns {CosmosTransaction} The converted transaction.
   */
  _toCosmosTransaction(transaction) {
    const cosmosTransaction = {
      to: transaction.to,
      amount: [
        {
          denom: this._config.nativeDenom,
          amount: transaction.value.toString(),
        },
      ],
      memo: 'Transfer via WDK',
    }

    return cosmosTransaction
  }

  /**
   * Returns a read-only copy of the account, holding no key material.
   *
   * @returns {Promise<WalletAccountCosmosReadOnly>} The read-only account.
   */
  async toReadOnlyAccount() {
    return new WalletAccountCosmosReadOnly(
      await this.getAddress(),
      this._config
    )
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index() {
    const index = this._signer.index
    if (index === undefined) {
      throw new InvalidSignerError(
        'The Cosmos signer does not have a derivation index.'
      )
    }
    return index
  }

  /**
   * The derivation path of this account (see BIP-44).
   *
   * @type {string}
   */
  get path() {
    const path = this._signer.path
    if (path === undefined) {
      throw new InvalidSignerError(
        'The Cosmos signer does not have a derivation path.'
      )
    }
    return path
  }

  /**
   * Whether this account has been disposed.
   *
   * @type {boolean}
   */
  get isDisposed() {
    return this._disposed
  }

  /**
   * Disposes the wallet account, securely erasing all sensitive data from memory.
   * After calling this method, the account can no longer be used.
   */
  dispose() {
    if (this._disposed) {
      return
    }

    this._signer.dispose()
    this._disposed = true
  }
}
