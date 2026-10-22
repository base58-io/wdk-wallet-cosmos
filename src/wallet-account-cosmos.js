'use strict'

import { encodeSecp256k1Pubkey } from '@cosmjs/amino'
import { fromBase64, toBase64 } from '@cosmjs/encoding'
import {
  Registry,
  encodePubkey,
  makeSignDoc as makeDirectSignDoc,
} from '@cosmjs/proto-signing'
import {
  QueryClient,
  SigningStargateClient,
  StargateClient,
  createProtobufRpcClient,
  defaultRegistryTypes,
} from '@cosmjs/stargate'
import { connectComet } from '@cosmjs/tendermint-rpc'
import {
  TransactionError,
  TransactionErrorReason,
  TransferError,
  TransferErrorReason,
  ValueError,
} from '@tetherto/wdk-wallet'
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing'
import {
  ServiceClientImpl,
  SimulateRequest,
} from 'cosmjs-types/cosmos/tx/v1beta1/service'
import { Tx, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { resolveChainConfig } from './chain-config-resolver.js'
import SeedSignerCosmos from './signers/seed-signer-cosmos.js'
import WalletAccountCosmosReadOnly from './wallet-account-cosmos-read-only.js'

/** @typedef {import('@cosmjs/amino').Coin} Coin */
/** @typedef {import('@cosmjs/amino').StdFee} StdFee */
/** @typedef {import('@cosmjs/proto-signing').EncodeObject} EncodeObject */
/** @typedef {import('@cosmjs/stargate').DeliverTxResponse} DeliverTxResponse */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount<TxRaw>} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').Transaction} Transaction */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('./signers/seed-signer-cosmos.js').ISignerCosmos} ISignerCosmos */

/**
 * Messages ready to sign, with the fee their simulation priced.
 *
 * @typedef {Object} PreparedTransaction
 * @property {EncodeObject[]} messages - The messages to sign.
 * @property {string} memo - The transaction memo.
 * @property {StdFee} fee - The fee at the simulated gas limit.
 * @property {bigint} totalFee - The fee amount in base units.
 */

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

// How long an IBC transfer packet stays relayable before it times out.
const IBC_TIMEOUT_SECONDS = 600

// Insufficient funds is the one on-chain failure the WDK error reasons name.
const INSUFFICIENT_FUNDS_PATTERN = /insufficient funds/i

/**
 * Throws when a broadcast transaction was included in a block but failed.
 * Insufficient funds surfaces as the WDK error for the operation; any other
 * ABCI failure is thrown with the chain's code and log.
 *
 * @param {DeliverTxResponse} result - The broadcast result.
 * @param {'transfer' | 'transaction'} operation - The operation that was broadcast.
 * @throws {TransferError} If a transfer failed for insufficient funds.
 * @throws {TransactionError} If a transaction failed for insufficient funds.
 * @throws {Error} If the transaction failed for any other reason.
 */
function assertDelivered(result, operation) {
  if (result.code === 0) {
    return
  }

  // Chains on Cosmos SDK 0.50+ only fill the log for failed transactions.
  const log = result.rawLog ?? ''
  const message = `The ${operation} ${result.transactionHash} failed on chain with code ${result.code}: ${log}`

  if (!INSUFFICIENT_FUNDS_PATTERN.test(log)) {
    throw new Error(message)
  }

  if (operation === 'transfer') {
    throw new TransferError(message, {
      reason: TransferErrorReason.INSUFFICIENT_BALANCE,
    })
  }

  throw new TransactionError(message, {
    reason: TransactionErrorReason.INSUFFICIENT_BALANCE,
  })
}

/**
 * Builds a bank `MsgSend`.
 *
 * @param {string} fromAddress - The sender address.
 * @param {string} toAddress - The recipient address.
 * @param {Coin[]} amount - The coins to send.
 * @returns {EncodeObject} The message.
 */
function createMsgSend(fromAddress, toAddress, amount) {
  return {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: { fromAddress, toAddress, amount },
  }
}

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
   * @param {boolean} [shouldWipeSignerOnDisposal] - If true, the account owns the signer and disposes it in {@link dispose}.
   */
  constructor(signer, resolvedConfig, shouldWipeSignerOnDisposal = false) {
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
     * If true, disposes the signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    this._shouldWipeSignerOnDisposal = shouldWipeSignerOnDisposal

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
      return await WalletAccountCosmos.fromSigner(signer, config, {
        shouldWipeSignerOnDisposal: true,
      })
    } finally {
      rootSigner.dispose()
    }
  }

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
  static async fromSigner(
    signer,
    config = {},
    { shouldWipeSignerOnDisposal = false } = {}
  ) {
    await signer.getAddress()
    return new WalletAccountCosmos(
      signer,
      resolveChainConfig(config),
      shouldWipeSignerOnDisposal
    )
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
   * Quotes the costs of a transfer by simulating it.
   *
   * @param {TransferOptions & { memo?: string }} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
   * @throws {ProviderError} If the provider fails to estimate the costs of the transfer.
   * @throws {Error} If the chain rejects the simulated transfer.
   */
  async quoteTransfer(options) {
    this._assertNotDisposed()
    this._assertRpcEndpoints('transfer tokens')

    const { totalFee } = await this._prepareTransfer(options)
    this._assertTransferFeeWithinLimit(totalFee)

    return { fee: totalFee }
  }

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
  async transfer(options) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints('transfer tokens')

    const { messages, memo, fee, totalFee } =
      await this._prepareTransfer(options)
    this._assertTransferFeeWithinLimit(totalFee)

    const address = await this.getAddress()
    const result = await this._withFallback(endpoints, async endpoint => {
      const client = await SigningStargateClient.connectWithSigner(
        endpoint,
        this._signer
      )
      return client.signAndBroadcast(address, messages, fee, memo)
    })
    assertDelivered(result, 'transfer')

    return {
      hash: result.transactionHash,
      fee: totalFee,
    }
  }

  /**
   * Builds a transfer's message and prices it by simulation: a bank `MsgSend`
   * for a recipient with this chain's prefix, an IBC `MsgTransfer` over the
   * configured channel otherwise.
   *
   * @protected
   * @param {TransferOptions & { memo?: string }} options - The transfer's options.
   * @returns {Promise<PreparedTransaction>} The transfer, ready to sign.
   */
  async _prepareTransfer({ token, recipient, amount, memo }) {
    const address = await this.getAddress()
    const recipientPrefix = this._getBech32Prefix(recipient)
    const sendAmount = { denom: token, amount: amount.toString() }

    if (recipientPrefix === this._config.addressPrefix) {
      return await this._prepareMessages(
        [createMsgSend(address, recipient, [sendAmount])],
        memo ?? 'Transfer via WDK'
      )
    }

    const { sourceChannel } =
      this._getIbcChannelConfigForPrefix(recipientPrefix)
    const ibcMemo = memo ?? 'Transfer via WDK (IBC)'
    const timeoutTimestampNanoseconds = String(
      (Date.now() + IBC_TIMEOUT_SECONDS * 1000) * 1_000_000
    )

    const msgTransfer = {
      typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
      value: {
        sourcePort: 'transfer',
        sourceChannel,
        token: sendAmount,
        sender: address,
        receiver: recipient,
        timeoutHeight: undefined,
        timeoutTimestamp: timeoutTimestampNanoseconds,
        memo: ibcMemo,
      },
    }

    return await this._prepareMessages([msgTransfer], ibcMemo)
  }

  /**
   * Builds the bank `MsgSend` for an unsigned transaction and prices it by
   * simulation.
   *
   * @protected
   * @param {Transaction} transaction - The transaction.
   * @returns {Promise<PreparedTransaction>} The transaction, ready to sign.
   */
  async _prepareTransaction(transaction) {
    const { to, amount, memo } = this._toCosmosTransaction(transaction)
    const address = await this.getAddress()

    return await this._prepareMessages(
      [createMsgSend(address, to, amount)],
      memo ?? ''
    )
  }

  /**
   * Simulates messages and builds the fee to sign them with.
   *
   * @protected
   * @param {EncodeObject[]} messages - The messages to sign.
   * @param {string} memo - The transaction memo.
   * @returns {Promise<PreparedTransaction>} The messages, ready to sign.
   */
  async _prepareMessages(messages, memo) {
    const fee = this._buildFee(await this._estimateGas(messages, memo))

    return { messages, memo, fee, totalFee: BigInt(fee.amount[0].amount) }
  }

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
  async _estimateGas(messages, memo) {
    const endpoints = this._assertRpcEndpoints()
    const address = await this.getAddress()
    const publicKey = encodePubkey(
      encodeSecp256k1Pubkey(await this._getSignerPublicKey())
    )
    const fee = { amount: [{ denom: this._parseGasPrice().denom, amount: '1' }] }
    const registry = new Registry(defaultRegistryTypes)
    const body = {
      messages: messages.map(message => registry.encodeAsAny(message)),
      memo,
    }

    const gasUsed = await this._withFallback(endpoints, async endpoint => {
      const comet = await connectComet(endpoint)
      const { sequence } = await StargateClient.create(comet).getSequence(
        address
      )

      const tx = Tx.fromPartial({
        body,
        authInfo: {
          fee,
          signerInfos: [
            {
              publicKey,
              sequence: BigInt(sequence),
              modeInfo: { single: { mode: SignMode.SIGN_MODE_UNSPECIFIED } },
            },
          ],
        },
        signatures: [new Uint8Array()],
      })

      const service = new ServiceClientImpl(
        createProtobufRpcClient(new QueryClient(comet))
      )
      const { gasInfo } = await service.Simulate(
        SimulateRequest.fromPartial({ txBytes: Tx.encode(tx).finish() })
      )
      if (!gasInfo) {
        throw new Error('The transaction simulation returned no gas info.')
      }

      return Number(gasInfo.gasUsed)
    })

    return Math.ceil(gasUsed * this._config.gasAdjustment)
  }

  /**
   * The account's key pair, or null if the signer does not expose key material.
   *
   * @type {KeyPair | null}
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
    return toBase64(await this._getSignerPublicKey())
  }

  /**
   * Returns the compressed secp256k1 public key the signer reports for this
   * account's address. Read from the signer's accounts rather than its key
   * pair, so signers that keep their key material private work too.
   *
   * @private
   * @returns {Promise<Uint8Array>} The 33-byte public key.
   */
  async _getSignerPublicKey() {
    const address = await this.getAddress()
    const accounts = await this._signer.getAccounts()
    const account = accounts.find(account => account.address === address)
    if (!account) {
      throw new Error(`The signer has no account for address ${address}.`)
    }
    return account.pubkey
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
   * Quotes the cost of sending a transaction. An unsigned transaction is
   * simulated; a signed one is quoted at the fee it carries.
   *
   * @param {Transaction | TxRaw} transaction - The transaction to quote.
   * @returns {Promise<{fee: bigint}>} The estimated fee.
   * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transaction max. fee option.
   * @throws {ProviderError} If the provider fails to estimate the costs of the transaction.
   * @throws {Error} If the chain rejects the simulated transaction.
   */
  async quoteSendTransaction(transaction) {
    if (this._isSignedTransaction(transaction)) {
      return await super.quoteSendTransaction(transaction)
    }

    this._assertNotDisposed()
    this._assertRpcEndpoints('send transactions')

    const { totalFee } = await this._prepareTransaction(
      /** @type {Transaction} */ (transaction)
    )
    this._assertTransactionFeeWithinLimit(totalFee)

    return { fee: totalFee }
  }

  /**
   * Signs a transaction without broadcasting it, at the simulated gas limit.
   *
   * @param {Transaction} transaction - The transaction to sign.
   * @returns {Promise<TxRaw>} The signed Cosmos transaction.
   * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transaction max. fee option.
   * @throws {ProviderError} If the provider fails to estimate the costs of the transaction.
   * @throws {Error} If the chain rejects the simulated transaction.
   */
  async signTransaction(transaction) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints('sign transactions')

    const { messages, memo, fee, totalFee } =
      await this._prepareTransaction(transaction)
    this._assertTransactionFeeWithinLimit(totalFee)

    const address = await this.getAddress()

    return await this._withFallback(endpoints, async endpoint => {
      const client = await SigningStargateClient.connectWithSigner(
        endpoint,
        this._signer
      )
      return client.sign(address, messages, fee, memo)
    })
  }

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
      assertDelivered(result, 'transaction')

      return {
        hash: result.transactionHash,
        fee: transactionFee,
      }
    }

    const { messages, memo, fee, totalFee } = await this._prepareTransaction(
      /** @type {Transaction} */ (transaction)
    )
    this._assertTransactionFeeWithinLimit(totalFee)

    const address = await this.getAddress()

    const result = await this._withFallback(endpoints, async endpoint => {
      const client = await SigningStargateClient.connectWithSigner(
        endpoint,
        this._signer
      )
      return client.signAndBroadcast(address, messages, fee, memo)
    })
    assertDelivered(result, 'transaction')

    return {
      hash: result.transactionHash,
      fee: totalFee,
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
   * The derivation path of this account (see BIP-44), or null if the signer is
   * not bound to a derivation position.
   *
   * @type {string | null}
   */
  get path() {
    return this._signer.path
  }

  /**
   * Whether this account has been disposed.
   *
   * @type {boolean}
   */
  get disposed() {
    return this._disposed
  }

  /**
   * Disposes the wallet account. After calling this method, the account can no longer be used.
   * The signer is disposed, securely erasing its key material, only if the account owns it.
   */
  dispose() {
    if (this._disposed) {
      return
    }

    if (this._shouldWipeSignerOnDisposal) {
      this._signer.dispose()
    }
    this._disposed = true
  }
}
