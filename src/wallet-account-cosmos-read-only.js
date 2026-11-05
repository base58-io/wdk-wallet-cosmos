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
import {
  QueryClient,
  StargateClient,
  createProtobufRpcClient,
  setupIbcExtension,
} from '@cosmjs/stargate'
import { connectComet } from '@cosmjs/tendermint-rpc'
import {
  DisposalError,
  MaximumFeeExceededError,
  NoSuchElementError,
  ProviderRequiredError,
  ValueError,
  WalletAccountReadOnly,
} from '@tetherto/wdk-wallet'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { State as ChannelState } from 'cosmjs-types/ibc/core/channel/v1/channel'
import { ClientState as TendermintClientState } from 'cosmjs-types/ibc/lightclients/tendermint/v1/tendermint'
import { QueryClientImpl as LegacyTransferQuery } from 'cosmjs-types-ibc-v8/ibc/applications/transfer/v1/query.js'
import {
  getChainIdsForPrefix,
  getRegistryIbcChannels,
  resolveChainConfig,
} from './chain-config-resolver.js'
import {
  DEFAULT_GAS_PRICE_STEP,
  DEFAULT_TRANSFER_GAS_LIMIT,
  extractGasPrice,
} from './gas-fee-utils.js'
import { withFallback } from './rpc-fallback.js'

/** @typedef {import('@cosmjs/amino').StdFee} StdFee */
/** @typedef {import('@cosmjs/amino').StdSignature} StdSignature */
/** @typedef {import('@cosmjs/stargate').IndexedTx} IndexedTx */
/** @typedef {import('@cosmjs/stargate').IbcExtension['ibc']} IbcQueries */
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

/**
 * An open ICS-20 `transfer` channel on the account's chain.
 *
 * @typedef {Object} IbcChannel
 * @property {string} channelId - The channel id on this chain, the `sourceChannel` of a transfer over it.
 * @property {string} counterpartyChannelId - The channel id on the counterparty chain.
 * @property {string} counterpartyChainId - The chain id the channel leads to.
 */

/**
 * Where an `ibc/<hash>` denom came from.
 *
 * @typedef {Object} DenomTrace
 * @property {string} baseDenom - The denom on the chain the token is native to (e.g. `uatom`).
 * @property {{ portId: string, channelId: string }[]} path - The hops the token took, most recent first: `path[0]` is the channel on this chain it arrived through.
 * @property {string} [sourceChainId] - The chain the token arrived from: the counterparty of `path[0]`. For a single-hop token, the chain it is native to. Unset if that channel's light client is not Tendermint.
 */

// CometBFT chains produce blocks roughly every 6 seconds.
const BLOCK_TIME = 6000

const TRANSFER_PORT = 'transfer'

const TENDERMINT_CLIENT_STATE_TYPE_URL =
  '/ibc.lightclients.tendermint.v1.ClientState'

const IBC_DENOM_PREFIX = 'ibc/'

// Cosmos SDK's answer to a query it has no handler for. cosmjs puts it in the
// thrown error's message only: "Query failed with (6): unknown query path: ...".
const UNKNOWN_QUERY_PATH = 'unknown query path'

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
 * Connects a query client with the IBC extension to an RPC endpoint.
 *
 * @param {string} endpoint - The RPC endpoint.
 * @returns {Promise<{ client: QueryClient, ibc: IbcQueries }>} The raw client and its IBC queries.
 */
async function connectIbc(endpoint) {
  const client = new QueryClient(await connectComet(endpoint))
  return { client, ibc: setupIbcExtension(client).ibc }
}

/**
 * Queries a denom's trace as `{ base, trace }`. cosmjs asks for it through the
 * `Denom` query of ibc-go v10; chains on ibc-go v8 and older (e.g. Osmosis)
 * do not serve it and answer the `DenomTrace` query instead, sent here with
 * the cosmjs-types release generated from ibc-go v8.
 *
 * @param {QueryClient} client - The raw query client.
 * @param {IbcQueries} ibc - Its IBC queries.
 * @param {string} hash - The hash of an `ibc/<hash>` denom.
 * @returns {Promise<{ base: string, trace: { portId: string, channelId: string }[] } | undefined>} The trace, or undefined if the chain returned none.
 */
async function queryDenom(client, ibc, hash) {
  try {
    return (await ibc.transfer.denomTrace(hash)).denom
  } catch (error) {
    if (!(error instanceof Error && error.message.includes(UNKNOWN_QUERY_PATH))) {
      throw error
    }
  }

  const { denomTrace } = await new LegacyTransferQuery(
    createProtobufRpcClient(client)
  ).DenomTrace({ hash })
  if (!denomTrace) return undefined

  // `path` is `port/channel` pairs, most recent hop first: `transfer/channel-0/transfer/channel-5`.
  const segments = denomTrace.path ? denomTrace.path.split('/') : []
  const trace = []
  for (let i = 0; i + 1 < segments.length; i += 2) {
    trace.push({ portId: segments[i], channelId: segments[i + 1] })
  }
  return { base: denomTrace.baseDenom, trace }
}

/**
 * Reads the counterparty chain id from a channel's light client.
 *
 * @param {IbcQueries} ibc - The IBC queries.
 * @param {string} portId - The channel's port.
 * @param {string} channelId - The channel id.
 * @returns {Promise<string | undefined>} The chain id, or undefined if the client is not Tendermint.
 */
async function queryCounterpartyChainId(ibc, portId, channelId) {
  const { identifiedClientState } = await ibc.channel.clientState(
    portId,
    channelId
  )
  const clientState = identifiedClientState?.clientState
  if (clientState?.typeUrl !== TENDERMINT_CLIENT_STATE_TYPE_URL) {
    return undefined
  }
  return TendermintClientState.decode(clientState.value).chainId
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

    /**
     * The chain's open transfer channels, queried once per account.
     *
     * @private
     * @type {Promise<IbcChannel[]> | undefined}
     */
    this._ibcChannels = undefined

    /**
     * Resolved denom traces, keyed by denom. A trace never changes.
     *
     * @private
     * @type {Map<string, Promise<DenomTrace>>}
     */
    this._denomTraces = new Map()
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
  get disposed() {
    return false
  }

  /**
   * Throws if this account has been disposed.
   *
   * @protected
   * @throws {DisposalError} If the account has been disposed.
   */
  _assertNotDisposed() {
    if (this.disposed) {
      throw new DisposalError('The wallet account has been disposed.')
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
   * Returns the per-unit gas price: the registry's average gas price, else the
   * configured `gasPrice`, else the default average price in the native denom.
   *
   * @protected
   * @returns {{ denom: string, amount: number }} The gas price.
   */
  _parseGasPrice() {
    const gasPriceStep = this._config.gasPriceStep
    if (
      gasPriceStep &&
      Number.isFinite(gasPriceStep.average) &&
      gasPriceStep.average > 0
    ) {
      return { denom: gasPriceStep.denom, amount: gasPriceStep.average }
    }

    const extractedGasPrice = extractGasPrice(this._config.gasPrice)
    if (extractedGasPrice) {
      return {
        denom: extractedGasPrice.gasPriceDenomination,
        amount: extractedGasPrice.gasPriceAmount,
      }
    }

    return {
      denom: this._config.nativeDenom,
      amount: DEFAULT_GAS_PRICE_STEP.average,
    }
  }

  /**
   * Builds the fee for a gas limit, priced at {@link _parseGasPrice}.
   *
   * @protected
   * @param {number} gasLimit - The transaction's gas limit.
   * @returns {StdFee} The fee.
   */
  _buildFee(gasLimit) {
    const { denom, amount } = this._parseGasPrice()

    return {
      amount: [{ denom, amount: String(Math.ceil(amount * gasLimit)) }],
      gas: String(gasLimit),
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
   * Returns the ICS-20 `transfer` channels the account can send over, each
   * with the chain id it leads to.
   *
   * A chain configured by `chainName` reads them from chain-registry, with no
   * RPC query: one channel per counterparty, the one the registry prefers.
   * Its open channels on chain include stale ones, often hundreds of them.
   *
   * Any other chain, such as a local testnet, queries its open channels whose
   * counterparty is a Tendermint chain. Channels rarely change, so the account
   * queries them once and serves later calls from that result; a failed query
   * is not cached. Create a new account to pick up channels opened since.
   *
   * @returns {Promise<IbcChannel[]>} The transfer channels.
   * @throws {ProviderRequiredError} If the chain is not configured by `chainName` and no RPC endpoint is configured.
   */
  async getIbcChannels() {
    this._assertNotDisposed()

    if (this._config.chainId) {
      return getRegistryIbcChannels(this._config.chainId)
    }

    const endpoints = this._assertRpcEndpoints('query IBC channels')

    if (!this._ibcChannels) {
      this._ibcChannels = this._withFallback(endpoints, async endpoint => {
        const { ibc } = await connectIbc(endpoint)
        const { channels } = await ibc.channel.allChannels()
        const transferChannels = channels.filter(
          channel =>
            channel.state === ChannelState.STATE_OPEN &&
            channel.portId === TRANSFER_PORT &&
            channel.counterparty.portId === TRANSFER_PORT
        )

        const resolved = await Promise.all(
          transferChannels.map(async channel => ({
            channelId: channel.channelId,
            counterpartyChannelId: channel.counterparty.channelId,
            counterpartyChainId: await queryCounterpartyChainId(
              ibc,
              TRANSFER_PORT,
              channel.channelId
            ),
          }))
        )

        return resolved.filter(
          /** @returns {channel is IbcChannel} */
          channel => channel.counterpartyChainId !== undefined
        )
      })
      this._ibcChannels.catch(() => {
        this._ibcChannels = undefined
      })
    }

    return await this._ibcChannels
  }

  /**
   * Returns where an `ibc/<hash>` denom came from, or null for a denom native
   * to this chain (anything without the `ibc/` prefix).
   *
   * Traces never change, so each denom is queried once per account.
   *
   * @param {string} denom - The denom, e.g. `ibc/27394FB0...` or `uatom`.
   * @returns {Promise<DenomTrace | null>} The trace, or null for a native denom.
   * @throws {ProviderRequiredError} If no RPC endpoint is configured.
   * @throws {Error} If the chain does not know the denom's hash.
   */
  async getDenomTrace(denom) {
    this._assertNotDisposed()

    if (!denom.startsWith(IBC_DENOM_PREFIX)) {
      return null
    }

    const endpoints = this._assertRpcEndpoints('query IBC denoms')

    let trace = this._denomTraces.get(denom)
    if (!trace) {
      trace = this._withFallback(endpoints, async endpoint => {
        const { client, ibc } = await connectIbc(endpoint)
        const response = await queryDenom(
          client,
          ibc,
          denom.slice(IBC_DENOM_PREFIX.length)
        )
        if (!response) {
          throw new Error(`The chain returned no trace for ${denom}.`)
        }

        const path = response.trace.map(({ portId, channelId }) => ({
          portId,
          channelId,
        }))
        const sourceChainId = path[0]
          ? await queryCounterpartyChainId(
              ibc,
              path[0].portId,
              path[0].channelId
            )
          : undefined

        return { baseDenom: response.base, path, sourceChainId }
      })
      this._denomTraces.set(denom, trace)
      trace.catch(() => {
        this._denomTraces.delete(denom)
      })
    }

    return await trace
  }

  /**
   * Returns the open transfer channel leading to the chain behind a Bech32
   * prefix. The prefix resolves to candidate chain ids through `ibcChains`
   * and chain-registry; exactly one channel from `getIbcChannels` must lead to
   * one of them.
   *
   * @protected
   * @param {string} prefix - The destination Bech32 prefix.
   * @returns {Promise<IbcChannel>} The channel to transfer over.
   * @throws {ValueError} If the prefix is unknown, or no single channel leads to its chain.
   */
  async _getIbcChannelForPrefix(prefix) {
    const chainIds = getChainIdsForPrefix(prefix, this._config.ibcChains)
    if (chainIds.length === 0) {
      throw new ValueError(
        `No chain is known for the Bech32 prefix "${prefix}". Map it to a chain id in the ibcChains config.`
      )
    }

    const channels = (await this.getIbcChannels()).filter(channel =>
      chainIds.includes(channel.counterpartyChainId)
    )
    if (channels.length === 0) {
      throw new ValueError(
        `No IBC transfer channel leads to ${chainIds.join(' or ')} (Bech32 prefix "${prefix}").`
      )
    }
    if (channels.length > 1) {
      throw new ValueError(
        `Several IBC transfer channels lead to Bech32 prefix "${prefix}": ` +
          channels
            .map(
              channel => `${channel.channelId} (${channel.counterpartyChainId})`
            )
            .join(', ')
      )
    }

    return channels[0]
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * A read-only account cannot simulate the transfer (simulation needs the
   * sender's public key), so the quote uses the fixed
   * {@link DEFAULT_TRANSFER_GAS_LIMIT}.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   * @throws {MaximumFeeExceededError} If the estimated fee exceeds the transfer max. fee option.
   * @throws {ValueError} If the recipient is on another chain that no single IBC channel leads to.
   */
  async quoteTransfer(options) {
    this._assertNotDisposed()
    this._assertRpcEndpoints('transfer tokens')

    const recipientPrefix = this._getBech32Prefix(options.recipient)
    if (recipientPrefix !== this._config.addressPrefix) {
      await this._getIbcChannelForPrefix(recipientPrefix)
    }

    const fee = this._buildFee(DEFAULT_TRANSFER_GAS_LIMIT)
    const estimatedFee = BigInt(fee.amount[0].amount)
    this._assertTransferFeeWithinLimit(estimatedFee)

    return {
      fee: estimatedFee,
    }
  }

  /**
   * Quotes the cost of sending an unsigned or signed transaction.
   *
   * A signed transaction is quoted at the fee it carries. An unsigned one uses
   * the fixed {@link DEFAULT_TRANSFER_GAS_LIMIT}, since a read-only account
   * cannot simulate it.
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
      : BigInt(this._buildFee(DEFAULT_TRANSFER_GAS_LIMIT).amount[0].amount)

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
