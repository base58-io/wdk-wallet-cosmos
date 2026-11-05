'use strict'

import { ValueError } from '@tetherto/wdk-wallet'
import { chains, ibcData } from 'chain-registry'

const DEFAULT_GAS_ADJUSTMENT = 1.3

/**
 * @param {string[] | undefined} rpcEndpoints
 * @param {{ address?: string }[] | undefined} registryEndpoints
 * @returns {string[]}
 */
function buildRpcEndpoints(rpcEndpoints, registryEndpoints) {
  if (rpcEndpoints && rpcEndpoints.length > 0) {
    return rpcEndpoints
  }
  if (registryEndpoints && registryEndpoints.length > 0) {
    return /** @type {string[]} */ (
      registryEndpoints.map(e => e.address).filter(Boolean)
    )
  }
  return []
}

/**
 * Validates the configured gas adjustment, falling back to the default.
 *
 * @param {number | undefined} gasAdjustment
 * @returns {number}
 * @throws {ValueError} If the gas adjustment is not a positive finite number.
 */
function resolveGasAdjustment(gasAdjustment = DEFAULT_GAS_ADJUSTMENT) {
  if (!Number.isFinite(gasAdjustment) || gasAdjustment <= 0) {
    throw new ValueError('gasAdjustment must be a positive finite number.')
  }
  return gasAdjustment
}

/**
 * @typedef {Object} CosmosWalletConfig
 * @property {string} [chainName] - The chain name from chain-registry (e.g. 'juno', 'osmosis').
 * @property {string[]} [rpcEndpoints] - Array of RPC endpoint URLs for fallback support.
 * @property {number} [retryCount] - Max retry rounds for RPC fallback (default: 3).
 * @property {number} [retryDelay] - Base delay in ms for exponential backoff (default: 150).
 * @property {string} [addressPrefix] - The Bech32 address prefix (overrides registry, default: 'cosmos').
 * @property {string} [nativeDenom] - The native token denomination (overrides registry, default: 'uatom').
 * @property {number} [coinType] - The BIP-44 coin type (overrides registry, default: 118).
 * @property {string} [gasPrice] - The gas price with denom (e.g. '0.025uatom').
 * @property {number} [gasAdjustment] - The multiplier applied to simulated gas usage to set the gas limit (default: 1.3).
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for transaction operations.
 * @property {Record<string, string>} [ibcChains] - Chain ids keyed by Bech32 prefix, for IBC destinations chain-registry does not know (e.g. `{ wdk2: 'wdkdev2' }`). An entry overrides the registry for its prefix.
 */

/**
 * @typedef {Object} ResolvedChainConfig
 * @property {string[]} rpcEndpoints - Array of RPC endpoint URLs for fallback.
 * @property {number} retryCount - Max retry rounds for RPC fallback.
 * @property {number} retryDelay - Base delay in ms for exponential backoff.
 * @property {string} addressPrefix - The Bech32 address prefix.
 * @property {string} nativeDenom - The native token denomination.
 * @property {number} coinType - The BIP-44 coin type.
 * @property {string} [gasPrice] - The gas price with denom.
 * @property {{ low: number, average: number, high: number, denom: string }} [gasPriceStep] - Gas price tiers from chain-registry fee token metadata.
 * @property {number} gasAdjustment - The multiplier applied to simulated gas usage to set the gas limit.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for transaction operations.
 * @property {string} [chainId] - The chain ID (from registry).
 * @property {string} [prettyName] - The human-readable chain name (from registry).
 * @property {Record<string, string>} [ibcChains] - Chain ids keyed by Bech32 prefix, for IBC destinations chain-registry does not know (e.g. `{ wdk2: 'wdkdev2' }`). An entry overrides the registry for its prefix.
 */

/**
 * Resolves chain configuration from chain-registry or custom config.
 *
 * @param {CosmosWalletConfig} config - The wallet configuration.
 * @returns {ResolvedChainConfig} The resolved chain configuration.
 * @throws {ValueError} If chainName is provided but not found in registry, or gasAdjustment is invalid.
 *
 * @example
 * // Auto-config from registry
 * const config = resolveChainConfig({ chainName: 'juno' });
 *
 * @example
 * // Custom/local chain
 * const config = resolveChainConfig({
 *   rpcEndpoints: ['http://localhost:26657'],
 *   addressPrefix: 'wdkdev',
 *   nativeDenom: 'stake'
 * });
 *
 * @example
 * // Hybrid: registry + custom RPC with fallbacks
 * const config = resolveChainConfig({
 *   chainName: 'juno',
 *   rpcEndpoints: ['https://my-custom-rpc.com', 'https://backup-rpc.com']
 * });
 */
export function resolveChainConfig(config = {}) {
  const gasAdjustment = resolveGasAdjustment(config.gasAdjustment)

  if (!config.chainName) {
    const endpoints = buildRpcEndpoints(config.rpcEndpoints, undefined)
    return {
      rpcEndpoints: endpoints,
      retryCount: config.retryCount ?? 3,
      retryDelay: config.retryDelay ?? 150,
      addressPrefix: config.addressPrefix || 'cosmos',
      nativeDenom: config.nativeDenom || 'uatom',
      coinType: config.coinType ?? 118,
      gasPrice: config.gasPrice,
      gasAdjustment,
      transferMaxFee: config.transferMaxFee,
      transactionMaxFee: config.transactionMaxFee,
      ibcChains: config.ibcChains,
    }
  }

  // Find chain in registry
  const chainData = chains.find(chain => chain.chainName === config.chainName)

  if (!chainData) {
    throw new ValueError(
      `Chain "${config.chainName}" not found in chain-registry. ` +
        `Use custom config for local/private chains.`
    )
  }

  const registryRpcEndpoints = chainData.apis?.rpc
  const endpoints = buildRpcEndpoints(config.rpcEndpoints, registryRpcEndpoints)

  const feeToken = chainData.fees?.feeTokens?.[0]

  const defaultGasPriceStep = feeToken?.denom
    ? {
        low:
          feeToken.lowGasPrice ??
          feeToken.fixedMinGasPrice ??
          feeToken.averageGasPrice ??
          feeToken.highGasPrice ??
          0,
        average:
          feeToken.averageGasPrice ??
          feeToken.lowGasPrice ??
          feeToken.fixedMinGasPrice ??
          feeToken.highGasPrice ??
          0,
        high:
          feeToken.highGasPrice ??
          feeToken.averageGasPrice ??
          feeToken.lowGasPrice ??
          feeToken.fixedMinGasPrice ??
          0,
        denom: feeToken.denom,
      }
    : undefined

  const defaultGasPrice = defaultGasPriceStep
    ? `${defaultGasPriceStep.average}${defaultGasPriceStep.denom}`
    : undefined

  return {
    rpcEndpoints: endpoints,
    retryCount: config.retryCount ?? 3,
    retryDelay: config.retryDelay ?? 150,
    addressPrefix: config.addressPrefix || chainData.bech32Prefix || 'cosmos',
    nativeDenom: config.nativeDenom || feeToken?.denom || 'uatom',
    coinType: config.coinType ?? chainData.slip44 ?? 118,
    gasPrice: config.gasPrice || defaultGasPrice,
    gasPriceStep: defaultGasPriceStep,
    gasAdjustment,
    transferMaxFee: config.transferMaxFee,
    transactionMaxFee: config.transactionMaxFee,
    ibcChains: config.ibcChains,
    chainId: chainData.chainId,
    prettyName: chainData.prettyName,
  }
}

/**
 * Returns the chain ids a Bech32 prefix may belong to: the `ibcChains` entry
 * for the prefix if there is one, else every chain-registry chain using it.
 * Several registry chains can share a prefix (e.g. a mainnet and its testnet);
 * the caller tells them apart by which one an open IBC channel leads to.
 *
 * @param {string} prefix - The Bech32 prefix.
 * @param {Record<string, string>} [ibcChains] - The configured prefix to chain id map.
 * @returns {string[]} The candidate chain ids, empty if the prefix is unknown.
 */
export function getChainIdsForPrefix(prefix, ibcChains = {}) {
  if (Object.prototype.hasOwnProperty.call(ibcChains, prefix)) {
    return [ibcChains[prefix]]
  }

  return chains
    .filter(chain => chain.bech32Prefix === prefix && chain.chainId)
    .map(chain => /** @type {string} */ (chain.chainId))
}

/**
 * Returns the `transfer` channels chain-registry lists for a chain, one per
 * counterparty chain: the one tagged preferred, else the only one not marked
 * inactive. Two chains can share several open channels, most of them stale;
 * the registry names the one in use. A counterparty with several channels and
 * none preferred keeps them all, so the caller can report the ambiguity.
 *
 * @param {string} chainId - The chain the channels are on.
 * @returns {{ channelId: string, counterpartyChannelId: string, counterpartyChainId: string }[]} The channels, empty if the registry lists none.
 */
export function getRegistryIbcChannels(chainId) {
  const listed = ibcData.flatMap(pair => {
    const ownIsChain1 = pair.chain1.chainId === chainId
    if (!ownIsChain1 && pair.chain2.chainId !== chainId) return []
    const counterpartyChainId = ownIsChain1
      ? pair.chain2.chainId
      : pair.chain1.chainId

    const transferChannels = pair.channels.filter(
      ({ chain1, chain2, tags }) =>
        chain1.portId === 'transfer' &&
        chain2.portId === 'transfer' &&
        tags?.status !== 'INACTIVE'
    )
    const preferred = transferChannels.find(({ tags }) => tags?.preferred)

    return (preferred ? [preferred] : transferChannels).map(
      ({ chain1, chain2 }) => {
        const [own, counterparty] = ownIsChain1
          ? [chain1, chain2]
          : [chain2, chain1]
        return {
          channelId: own.channelId,
          counterpartyChannelId: counterparty.channelId,
          counterpartyChainId,
        }
      }
    )
  })

  // The registry lists some chain pairs more than once.
  return [...new Map(listed.map(channel => [channel.channelId, channel])).values()]
}

/**
 * Returns the list of available chain names from chain-registry.
 *
 * @returns {string[]} Array of chain names.
 */
export function getAvailableChains() {
  return chains
    .filter(chain => chain.chainType === 'cosmos')
    .map(chain => chain.chainName)
}

/**
 * Checks if a chain name exists in the registry.
 *
 * @param {string} chainName - The chain name to check.
 * @returns {boolean} True if the chain exists.
 */
export function isKnownChain(chainName) {
  return chains.some(chain => chain.chainName === chainName)
}
