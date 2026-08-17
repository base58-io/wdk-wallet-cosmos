'use strict'

import {
  decodeSignature,
  makeSignDoc,
  pubkeyToAddress,
  serializeSignDoc,
} from '@cosmjs/amino'
import { Secp256k1, Secp256k1Signature, sha256 } from '@cosmjs/crypto'
import { fromBase64, toBase64 } from '@cosmjs/encoding'
import { decodeTxRaw } from '@cosmjs/proto-signing'
import { StargateClient } from '@cosmjs/stargate'
import {
  AssertionError,
  MaximumFeeExceededError,
  NoSuchElementError,
  ProviderRequiredError,
  ValueError,
  WalletAccountReadOnly,
} from '@tetherto/wdk-wallet'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { resolveChainConfig } from './chain-config-resolver.js'
import {
  DEFAULT_GAS_PRICE_STEP,
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
  extractGasPrice,
} from './gas-fee-utils.js'
import { withFallback } from './rpc-fallback.js'

/** @typedef {import('@cosmjs/amino').StdSignature} StdSignature */
/** @typedef {import('@cosmjs/stargate').IndexedTx} IndexedTx */
/** @typedef {import('@tetherto/wdk-wallet').Transaction} Transaction */
/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('./chain-config-resolver.js').CosmosWalletConfig} CosmosWalletConfig */
/** @typedef {import('./chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig */

/**
 * A normalized transaction receipt carrying the CometBFT indexed transaction it
 * was derived from.
 *
 * @typedef {TransactionReceipt & { transaction: IndexedTx }} CosmosTransactionReceipt
 */

// Default gas limit for simple token transfers
// In production, this should be estimated per-transaction via simulation
const DEFAULT_GAS_LIMIT = DEFAULT_TRANSFER_GAS_LIMIT.toString()

// CometBFT chains produce blocks roughly every 6 seconds.
const BLOCK_TIME = 6000

const TEXT_ENCODER = new TextEncoder()

/**
 * Builds the ADR-36 sign doc for arbitrary message signing.
 *
 * @param {string} signer - The signer address.
 * @param {string} message - The message to sign.
 * @returns {import('@cosmjs/amino').StdSignDoc} The ADR-36 sign doc.
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
 * Parses a JSON-encoded Cosmos StdSignature.
 *
 * @param {string} signature - The signature string.
 * @returns {StdSignature} The parsed signature.
 * @throws {ValueError} If the signature is not a well-formed StdSignature.
 */
function parseStdSignature(signature) {
  const parsed = JSON.parse(signature)

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.pub_key ||
    typeof parsed.pub_key !== 'object' ||
    typeof parsed.pub_key.type !== 'string' ||
    typeof parsed.pub_key.value !== 'string' ||
    typeof parsed.signature !== 'string'
  ) {
    throw new ValueError('Invalid Cosmos signature')
  }

  return parsed
}

/**
 * A Cosmos wallet account without key material.
 *
 * Holds every path that only needs an address and an RPC endpoint: balances,
 * quotes, receipts and signature verification. {@link WalletAccountCosmos}
 * extends it with the signer-dependent operations.
 */
export default class WalletAccountCosmosReadOnly extends WalletAccountReadOnly {
  /**
   * Creates a read-only account.
   *
   * @param {string | undefined} address - The account's Bech32 address.
   * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
   */
  constructor(address, resolvedConfig) {
    super(address)

    /**
     * The resolved wallet configuration.
     *
     * @protected
     * @type {ResolvedChainConfig}
     */
    this._config = resolvedConfig

    /**
     * The address prefix for Bech32 encoding.
     *
     * @protected
     * @type {string}
     */
    this._prefix = resolvedConfig.addressPrefix
  }

  /**
   * Creates a read-only account from an address and an unresolved configuration.
   *
   * @param {string} address - The account's Bech32 address.
   * @param {CosmosWalletConfig} [config] - The configuration object.
   * @returns {WalletAccountCosmosReadOnly} The read-only account.
   */
  static fromAddress(address, config = {}) {
    return new WalletAccountCosmosReadOnly(address, resolveChainConfig(config))
  }

  /** @type {number} */
  get defaultWaitInterval() {
    return BLOCK_TIME
  }

  /**
   * Whether this account has been disposed. Read-only accounts hold no key
   * material, so they are never disposed.
   *
   * @type {boolean}
   */
  get isDisposed() {
    return false
  }

  /**
   * Throws if this account has been disposed.
   *
   * @protected
   * @throws {AssertionError} If the account has been disposed.
   */
  _assertNotDisposed() {
    if (this.isDisposed) {
      throw new AssertionError('Cannot use disposed wallet account')
    }
  }

  /**
   * Returns the configured RPC endpoints.
   *
   * @protected
   * @param {string} [operation] - The operation requiring the endpoints, used in error messages.
   * @returns {string[]} The RPC endpoints.
   * @throws {ProviderRequiredError} If no RPC endpoint is configured.
   */
  _assertRpcEndpoints(operation) {
    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new ProviderRequiredError(
        operation
          ? `The wallet must be configured with an RPC endpoint to ${operation}.`
          : 'The wallet must be configured with an RPC endpoint.'
      )
    }

    return this._config.rpcEndpoints
  }

  /**
   * Runs an operation against the configured RPC endpoints, with fallback.
   *
   * @protected
   * @template T
   * @param {string[]} endpoints - The RPC endpoints to try.
   * @param {(endpoint: string) => Promise<T>} operation - The operation to run.
   * @returns {Promise<T>} The operation's result.
   */
  async _withFallback(endpoints, operation) {
    return await withFallback(endpoints, operation, {
      retryCount: this._config.retryCount,
      retryDelay: this._config.retryDelay,
    })
  }

  /**
   * Returns the account's balance.
   *
   * @param {string} [denom] - The denomination to check (defaults to chain's native denom).
   * @returns {Promise<bigint>} The balance in base units.
   */
  async getBalance(denom) {
    this._assertNotDisposed()

    const denomination = denom || this._config.nativeDenom
    const endpoints = this._assertRpcEndpoints()
    const address = await this.getAddress()

    const balance = await this._withFallback(endpoints, async endpoint => {
      const client = await StargateClient.connect(endpoint)
      return client.getBalance(address, denomination)
    })

    return BigInt(balance.amount)
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} denom - The token denomination.
   * @returns {Promise<bigint>} The token balance in base units.
   */
  async getTokenBalance(denom) {
    return await this.getBalance(denom)
  }

  /**
   * Returns the account balances for a list of tokens.
   *
   * @param {string[]} denoms - The token denominations.
   * @returns {Promise<Record<string, bigint>>} The token balances (in base unit).
   */
  async getTokenBalances(denoms) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints()
    const address = await this.getAddress()

    const balances = await this._withFallback(endpoints, async endpoint => {
      const client = await StargateClient.connect(endpoint)
      return client.getAllBalances(address)
    })

    /** @type {Record<string, bigint>} */
    const result = {}
    for (const balance of balances) {
      if (denoms.includes(balance.denom)) {
        result[balance.denom] = BigInt(balance.amount)
      }
    }
    return result
  }

  /**
   * Parses the gas price from config into denom and amount.
   *
   * @protected
   * @returns {{gasDenom: string, gasAmount: string}} The parsed gas price.
   */
  _parseGasPrice() {
    const gasPriceStep = this._config.gasPriceStep
    if (
      gasPriceStep &&
      Number.isFinite(gasPriceStep.average) &&
      gasPriceStep.average > 0
    ) {
      const gasAmount = calculateFeeAmountFromGasPrice(
        gasPriceStep.average,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      if (gasAmount) {
        return {
          gasDenom: gasPriceStep.denom,
          gasAmount: gasAmount.toString(),
        }
      }
    }

    const extractedGasPrice = extractGasPrice(this._config.gasPrice)
    if (extractedGasPrice) {
      const gasAmount = calculateFeeAmountFromGasPrice(
        extractedGasPrice.gasPriceAmount,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      if (gasAmount) {
        return {
          gasDenom: extractedGasPrice.gasPriceDenomination,
          gasAmount: gasAmount.toString(),
        }
      }
    }

    const defaultGasAmount = calculateFeeAmountFromGasPrice(
      DEFAULT_GAS_PRICE_STEP.average,
      DEFAULT_TRANSFER_GAS_LIMIT
    )

    return {
      gasDenom: this._config.nativeDenom,
      gasAmount: defaultGasAmount ? defaultGasAmount.toString() : '0',
    }
  }

  /**
   * Builds the standard fee for a simple transfer.
   *
   * @protected
   * @returns {{ amount: Array<{denom: string, amount: string}>, gas: string }} The fee.
   */
  _buildTransferFee() {
    const { gasDenom, gasAmount } = this._parseGasPrice()

    return {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: DEFAULT_GAS_LIMIT,
    }
  }

  /**
   * Extracts Bech32 prefix from an address.
   *
   * @param {string} address - The Bech32 address.
   * @returns {string} The Bech32 prefix.
   * @throws {ValueError} If the address is not a Bech32 address.
   */
  _getBech32Prefix(address) {
    const separatorIndex = address.indexOf('1')
    if (separatorIndex <= 0) {
      throw new ValueError('Invalid Bech32 address format.')
    }
    return address.slice(0, separatorIndex)
  }

  /**
   * Returns IBC channel config for a destination Bech32 prefix.
   *
   * @param {string} prefix - The destination Bech32 prefix.
   * @returns {{ sourceChannel: string }} The IBC channel configuration.
   * @throws {ValueError} If no channel is configured for the prefix.
   */
  _getIbcChannelConfigForPrefix(prefix) {
    const ibcChannels = this._config.ibcChannels
    if (!ibcChannels) {
      throw new ValueError(
        'IBC channels configuration is not available for this wallet.'
      )
    }

    const channelConfig = ibcChannels[prefix]
    if (!channelConfig || !channelConfig.sourceChannel) {
      throw new ValueError(
        `IBC channel configuration not found for destination prefix: ${prefix}`
      )
    }

    return channelConfig
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
   */
  async quoteTransfer(options) {
    this._assertNotDisposed()
    this._assertRpcEndpoints('transfer tokens')

    const recipientPrefix = this._getBech32Prefix(options.recipient)
    if (recipientPrefix !== this._config.addressPrefix) {
      this._getIbcChannelConfigForPrefix(recipientPrefix)
    }

    const estimatedFee = BigInt(this._parseGasPrice().gasAmount)
    this._assertTransferFeeWithinLimit(estimatedFee)

    return {
      fee: estimatedFee,
    }
  }

  /**
   * Quotes the cost of sending an unsigned or signed transaction.
   *
   * @param {Transaction | TxRaw} transaction - The transaction to quote.
   * @returns {Promise<{fee: bigint}>} The estimated fee.
   * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transaction max. fee option.
   */
  async quoteSendTransaction(transaction) {
    this._assertNotDisposed()
    this._assertRpcEndpoints('send transactions')

    const estimatedFee = this._isSignedTransaction(transaction)
      ? this._getSignedTransactionFee(
          TxRaw.encode(/** @type {TxRaw} */ (transaction)).finish()
        )
      : BigInt(this._parseGasPrice().gasAmount)

    this._assertTransactionFeeWithinLimit(estimatedFee)

    return {
      fee: estimatedFee,
    }
  }

  /**
   * Checks whether a transaction is an encoded Cosmos TxRaw object.
   *
   * @protected
   * @param {Transaction | TxRaw} transaction - The transaction to inspect.
   * @returns {boolean} Whether the transaction is signed.
   */
  _isSignedTransaction(transaction) {
    if (transaction === null || typeof transaction !== 'object') return false
    const candidate = /** @type {Partial<TxRaw>} */ (
      /** @type {unknown} */ (transaction)
    )
    return (
      candidate.bodyBytes instanceof Uint8Array &&
      candidate.authInfoBytes instanceof Uint8Array &&
      Array.isArray(candidate.signatures)
    )
  }

  /**
   * Reads the total fee from an encoded signed transaction.
   *
   * @protected
   * @param {Uint8Array} transactionBytes - Encoded TxRaw bytes.
   * @returns {bigint} The total transaction fee.
   */
  _getSignedTransactionFee(transactionBytes) {
    const decodedTransaction = decodeTxRaw(transactionBytes)
    return (decodedTransaction.authInfo.fee?.amount || []).reduce(
      (total, coin) => total + BigInt(coin.amount),
      BigInt(0)
    )
  }

  /**
   * Enforces the configured transaction fee limit.
   *
   * @protected
   * @param {bigint} fee - Transaction fee in base units.
   * @throws {MaximumFeeExceededError} If the fee exceeds the limit.
   */
  _assertTransactionFeeWithinLimit(fee) {
    if (
      this._config.transactionMaxFee !== undefined &&
      fee > this._config.transactionMaxFee
    ) {
      throw new MaximumFeeExceededError(
        'Exceeded maximum fee cost for transaction operation.',
        {}
      )
    }
  }

  /**
   * Enforces the configured transfer fee limit.
   *
   * @protected
   * @param {bigint} fee - Transfer fee in base units.
   * @throws {MaximumFeeExceededError} If the fee exceeds the limit.
   */
  _assertTransferFeeWithinLimit(fee) {
    if (
      this._config.transferMaxFee !== undefined &&
      fee > this._config.transferMaxFee
    ) {
      throw new MaximumFeeExceededError(
        'Exceeded maximum fee cost for transfer operation.',
        {}
      )
    }
  }

  /**
   * Returns the indexed transaction for a hash, or null if it has not been
   * included in a block yet.
   *
   * @deprecated Use {@link getTransaction} instead, which returns a normalized receipt.
   * @param {string} hash - The transaction hash.
   * @returns {Promise<IndexedTx | null>} The indexed transaction, or null.
   */
  async getTransactionReceipt(hash) {
    this._assertNotDisposed()

    const endpoints = this._assertRpcEndpoints('get transaction receipts')

    return await this._withFallback(endpoints, async endpoint => {
      const client = await StargateClient.connect(endpoint)
      return client.getTx(hash)
    })
  }

  /**
   * Returns a normalized, finality-based receipt for a transaction.
   *
   * A transaction that made it into a block is final: CometBFT does not fork.
   *
   * @param {string} hash - The transaction hash.
   * @returns {Promise<CosmosTransactionReceipt>} The normalized receipt.
   * @throws {NoSuchElementError} If no transaction has been found for the given hash.
   */
  async getTransaction(hash) {
    const transaction = await this.getTransactionReceipt(hash)

    if (!transaction) {
      throw new NoSuchElementError(`Transaction not found: ${hash}`)
    }

    return {
      hash: transaction.hash,
      finality: 'final',
      success: transaction.code === 0,
      block: transaction.height,
      fee: this._getSignedTransactionFee(transaction.tx),
      transaction,
    }
  }

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
  async verify(message, signature) {
    this._assertNotDisposed()

    try {
      const stdSignature = parseStdSignature(signature)
      const address = await this.getAddress()

      if (
        pubkeyToAddress(stdSignature.pub_key, this._prefix).toLowerCase() !==
        address.toLowerCase()
      ) {
        return false
      }

      // Ensure signature base64 is well-formed before verifying.
      fromBase64(stdSignature.signature)

      const { pubkey, signature: signatureBytes } =
        decodeSignature(stdSignature)
      const signDoc = buildAdr36SignDoc(address, message)
      const messageHash = sha256(serializeSignDoc(signDoc))
      const secp256k1Signature =
        Secp256k1Signature.fromFixedLength(signatureBytes)

      return Secp256k1.verifySignature(secp256k1Signature, messageHash, pubkey)
    } catch (_error) {
      return false
    }
  }
}
