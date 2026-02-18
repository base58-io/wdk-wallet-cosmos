'use strict'

import { chains } from 'chain-registry'

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
 * @typedef {Object} CosmosWalletConfig
 * @property {string} [chainName] - The chain name from chain-registry (e.g. 'juno', 'osmosis').
 * @property {string[]} [rpcEndpoints] - Array of RPC endpoint URLs for fallback support.
 * @property {number} [retryCount] - Max retry rounds for RPC fallback (default: 3).
 * @property {number} [retryDelay] - Base delay in ms for exponential backoff (default: 150).
 * @property {string} [addressPrefix] - The Bech32 address prefix (overrides registry, default: 'cosmos').
 * @property {string} [nativeDenom] - The native token denomination (overrides registry, default: 'uatom').
 * @property {number} [coinType] - The BIP-44 coin type (overrides registry, default: 118).
 * @property {string} [gasPrice] - The gas price with denom (e.g. '0.025uatom').
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {Record<string, { sourceChannel: string }>} [ibcChannels] - Optional IBC channel map keyed by destination Bech32 prefix.
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
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {string} [chainId] - The chain ID (from registry).
 * @property {string} [prettyName] - The human-readable chain name (from registry).
 * @property {Record<string, { sourceChannel: string }>} [ibcChannels] - Optional IBC channel map keyed by destination Bech32 prefix.
 */

/**
 * Resolves chain configuration from chain-registry or custom config.
 *
 * @param {CosmosWalletConfig} config - The wallet configuration.
 * @returns {ResolvedChainConfig} The resolved chain configuration.
 * @throws {Error} If chainName is provided but not found in registry.
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
      transferMaxFee: config.transferMaxFee,
      ibcChannels: config.ibcChannels,
    }
  }

  // Find chain in registry
  const chainData = chains.find(chain => chain.chainName === config.chainName)

  if (!chainData) {
    throw new Error(
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
    transferMaxFee: config.transferMaxFee,
    ibcChannels: config.ibcChannels,
    chainId: chainData.chainId,
    prettyName: chainData.prettyName,
  }
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
