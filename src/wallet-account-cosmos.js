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
import { SigningStargateClient, StargateClient } from '@cosmjs/stargate'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { resolveChainConfig } from './chain-config-resolver.js'
import {
  DEFAULT_GAS_PRICE_STEP,
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
  extractGasPrice,
} from './gas-fee-utils.js'
import { withFallback } from './rpc-fallback.js'
import SeedSignerCosmos from './signers/seed-signer-cosmos.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount<TxRaw>} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').Transaction} Transaction */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */
/** @typedef {import('./signers/seed-signer-cosmos.js').ISignerCosmos} ISignerCosmos */

/**
 * @typedef {Object} CosmosTransaction
 * @property {string} to - The recipient address.
 * @property {Array<{denom: string, amount: string}>} amount - The amount to send.
 * @property {string} [memo] - Optional transaction memo.
 */

/**
 * @typedef {Object} CosmosWalletConfig
 * @property {string} [chainName] - The chain name from chain-registry (e.g. 'juno', 'osmosis').
 * @property {string[]} [rpcEndpoints] - Array of RPC endpoint URLs for fallback.
 * @property {number} [retryCount] - Max retry rounds for RPC fallback (default: 3).
 * @property {number} [retryDelay] - Base delay in ms for exponential backoff (default: 150).
 * @property {string} [addressPrefix] - The Bech32 address prefix (overrides registry, default: 'cosmos').
 * @property {string} [nativeDenom] - The native token denomination (overrides registry, default: 'uatom').
 * @property {number} [coinType] - The BIP-44 coin type (overrides registry, default: 118).
 * @property {string} [gasPrice] - The gas price with denom (e.g. '0.025uatom').
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for transaction operations.
 * @property {Record<string, { sourceChannel: string }>} [ibcChannels] - Optional IBC channel map keyed by destination Bech32 prefix.
 */

/**
 * @typedef {import('./chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig
 */

// Default gas limit for simple token transfers
// In production, this should be estimated per-transaction via simulation
const DEFAULT_GAS_LIMIT = DEFAULT_TRANSFER_GAS_LIMIT.toString()

const TEXT_ENCODER = new TextEncoder()

/**
 * @typedef {import('@cosmjs/amino').StdSignDoc} StdSignDoc
 */

/**
 * Builds the ADR-36 sign doc for arbitrary message signing.
 *
 * @param {string} signer - The signer address.
 * @param {string} message - The message to sign.
 * @returns {StdSignDoc} The ADR-36 sign doc.
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
 * @returns {import('@cosmjs/amino').StdSignature} The parsed signature.
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
    throw new Error('Invalid Cosmos signature')
  }

  return parsed
}

/** @implements {IWalletAccount} */
export default class WalletAccountCosmos {
  /**
   * Creates an account backed by a Cosmos signer.
   *
   * @param {ISignerCosmos} signer - The initialized Cosmos signer.
   * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
   */
  constructor(signer, resolvedConfig) {
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
   * Throws an error if this account has been disposed.
   *
   * @protected
   * @throws {Error} If the account has been disposed.
   */
  _assertNotDisposed() {
    if (this._disposed) {
      throw new Error('Cannot use disposed wallet account')
    }
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
   * Returns the account's balance.
   *
   * @param {string} [denom] - The denomination to check (defaults to chain's native denom).
   * @returns {Promise<bigint>} The balance in base units.
   */
  async getBalance(denom) {
    const denomination = denom || this._config.nativeDenom
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error('The wallet must be configured with an RPC endpoint.')
    }

    const address = await this.getAddress()

    const balance = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return client.getBalance(address, denomination)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    return BigInt(balance.amount)
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
   * Extracts Bech32 prefix from an address.
   *
   * @param {string} address - The Bech32 address.
   * @returns {string} The Bech32 prefix.
   */
  _getBech32Prefix(address) {
    const separatorIndex = address.indexOf('1')
    if (separatorIndex <= 0) {
      throw new Error('Invalid Bech32 address format.')
    }
    return address.slice(0, separatorIndex)
  }

  /**
   * Returns IBC channel config for a destination Bech32 prefix.
   *
   * @param {string} prefix - The destination Bech32 prefix.
   * @returns {{ sourceChannel: string }} The IBC channel configuration.
   */
  _getIbcChannelConfigForPrefix(prefix) {
    const ibcChannels = this._config.ibcChannels
    if (!ibcChannels) {
      throw new Error(
        'IBC channels configuration is not available for this wallet.'
      )
    }

    const channelConfig = ibcChannels[prefix]
    if (!channelConfig || !channelConfig.sourceChannel) {
      throw new Error(
        `IBC channel configuration not found for destination prefix: ${prefix}`
      )
    }

    return channelConfig
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

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error('The wallet must be configured with an RPC endpoint.')
    }

    const address = await this.getAddress()

    const balances = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return client.getAllBalances(address)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

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
   * Transfers tokens to another address.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer(options) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to transfer tokens.'
      )
    }

    const { token, recipient, amount } = options
    const address = await this.getAddress()

    const recipientPrefix = this._getBech32Prefix(recipient)
    const isSamePrefix = recipientPrefix === this._config.addressPrefix

    const sendAmount = {
      denom: token,
      amount: amount.toString(),
    }

    const { gasDenom, gasAmount } = this._parseGasPrice()
    const fee = {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: DEFAULT_GAS_LIMIT,
    }

    const channelConfig = isSamePrefix
      ? null
      : this._getIbcChannelConfigForPrefix(recipientPrefix)
    const totalFee = BigInt(fee.amount[0].amount)

    if (
      this._config.transferMaxFee !== undefined &&
      totalFee > this._config.transferMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    const result = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
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
            'Transfer via WDK'
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
            memo: 'Transfer via WDK (IBC)',
          },
        }

        const broadcastResult = await client.signAndBroadcast(
          address,
          [msgTransfer],
          fee,
          'Transfer via WDK (IBC)'
        )

        return {
          transactionHash: broadcastResult.transactionHash,
        }
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    return {
      hash: result.transactionHash,
      fee: totalFee,
    }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer(options) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to transfer tokens.'
      )
    }

    const { recipient } = options
    const recipientPrefix = this._getBech32Prefix(recipient)
    const isSamePrefix = recipientPrefix === this._config.addressPrefix

    if (!isSamePrefix) {
      this._getIbcChannelConfigForPrefix(recipientPrefix)
    }

    const { gasAmount } = this._parseGasPrice()
    const estimatedFee = BigInt(gasAmount)

    if (
      this._config.transferMaxFee !== undefined &&
      estimatedFee > this._config.transferMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    return {
      fee: estimatedFee,
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
   * Verifies a message's signature.
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
      const publicKey = this.keyPair.publicKey

      if (
        pubkeyToAddress(stdSignature.pub_key, this._prefix).toLowerCase() !==
        address.toLowerCase()
      ) {
        return false
      }

      // Ensure signature base64 is well-formed before verifying.
      fromBase64(stdSignature.signature)

      const { signature: signatureBytes } = decodeSignature(stdSignature)
      const signDoc = buildAdr36SignDoc(address, message)
      const messageHash = sha256(serializeSignDoc(signDoc))
      const secp256k1Signature =
        Secp256k1Signature.fromFixedLength(signatureBytes)

      return Secp256k1.verifySignature(
        secp256k1Signature,
        messageHash,
        publicKey
      )
    } catch (_error) {
      return false
    }
  }

  /**
   * Signs a transaction without broadcasting it.
   *
   * @param {Transaction} transaction - The transaction to sign.
   * @returns {Promise<TxRaw>} The signed Cosmos transaction.
   */
  async signTransaction(transaction) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to sign transactions.'
      )
    }

    const cosmosTransaction = this._toCosmosTransaction(transaction)
    const { gasDenom, gasAmount } = this._parseGasPrice()
    const transactionFee = BigInt(gasAmount)
    this._assertTransactionFeeWithinLimit(transactionFee)

    const fee = {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: DEFAULT_GAS_LIMIT,
    }
    const signerAddress = await this.getAddress()
    const message = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: signerAddress,
        toAddress: cosmosTransaction.to,
        amount: cosmosTransaction.amount,
      },
    }

    return await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
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
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )
  }

  /**
   * Sends an unsigned or previously signed transaction.
   *
   * @param {Transaction | TxRaw} transaction - The transaction to send.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction(transaction) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to send transactions.'
      )
    }

    if (this._isSignedTransaction(transaction)) {
      const signedTransaction = /** @type {TxRaw} */ (transaction)
      const transactionBytes = TxRaw.encode(signedTransaction).finish()
      const transactionFee = this._getSignedTransactionFee(transactionBytes)
      this._assertTransactionFeeWithinLimit(transactionFee)

      const result = await withFallback(
        this._config.rpcEndpoints,
        async endpoint => {
          const client = await StargateClient.connect(endpoint)
          return await client.broadcastTx(transactionBytes)
        },
        {
          retryCount: this._config.retryCount,
          retryDelay: this._config.retryDelay,
        }
      )

      return {
        hash: result.transactionHash,
        fee: transactionFee,
      }
    }

    const cosmosTransaction = this._toCosmosTransaction(
      /** @type {Transaction} */ (transaction)
    )
    const { gasDenom, gasAmount } = this._parseGasPrice()
    const transactionFee = BigInt(gasAmount)
    this._assertTransactionFeeWithinLimit(transactionFee)

    const fee = {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: DEFAULT_GAS_LIMIT,
    }
    const senderAddress = await this.getAddress()

    const result = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
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
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

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
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<IWalletAccountReadOnly>} The read-only account.
   * @throws {Error} Not implemented for Cosmos.
   */
  async toReadOnlyAccount() {
    throw new Error('Read-only accounts are not implemented for Cosmos.')
  }

  /**
   * Quotes the cost of sending an unsigned or signed transaction.
   *
   * @param {Transaction | TxRaw} transaction - The transaction to quote.
   * @returns {Promise<{fee: bigint}>} The estimated fee.
   */
  async quoteSendTransaction(transaction) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to send transactions.'
      )
    }

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
   * @param {Transaction | TxRaw} transaction - The transaction to inspect.
   * @returns {boolean} Whether the transaction is signed.
   * @private
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
   * @param {Uint8Array} transactionBytes - Encoded TxRaw bytes.
   * @returns {bigint} The total transaction fee.
   * @private
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
   * @param {bigint} fee - Transaction fee in base units.
   * @private
   */
  _assertTransactionFeeWithinLimit(fee) {
    if (
      this._config.transactionMaxFee !== undefined &&
      fee > this._config.transactionMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for transaction operation.')
    }
  }

  /**
   * Returns the transaction receipt for a given transaction hash.
   *
   * @param {string} hash - The transaction hash.
   * @returns {Promise<object>} The transaction receipt.
   */
  async getTransactionReceipt(hash) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to get transaction receipts.'
      )
    }

    const transaction = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return client.getTx(hash)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    if (!transaction) {
      throw new Error(`Transaction not found: ${hash}`)
    }

    return transaction
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index() {
    const index = this._signer.index
    if (index === undefined) {
      throw new Error('The Cosmos signer does not have a derivation index.')
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
      throw new Error('The Cosmos signer does not have a derivation path.')
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
