export type CosmosWalletConfig = {
    /**
     * - The chain name from chain-registry (e.g. 'juno', 'osmosis').
     */
    chainName?: string;
    /**
     * - Array of RPC endpoint URLs for fallback support.
     */
    rpcEndpoints?: string[];
    /**
     * - Max retry rounds for RPC fallback (default: 3).
     */
    retryCount?: number;
    /**
     * - Base delay in ms for exponential backoff (default: 150).
     */
    retryDelay?: number;
    /**
     * - The Bech32 address prefix (overrides registry, default: 'cosmos').
     */
    addressPrefix?: string;
    /**
     * - The native token denomination (overrides registry, default: 'uatom').
     */
    nativeDenom?: string;
    /**
     * - The BIP-44 coin type (overrides registry, default: 118).
     */
    coinType?: number;
    /**
     * - The gas price with denom (e.g. '0.025uatom').
     */
    gasPrice?: string;
    /**
     * - The multiplier applied to simulated gas usage to set the gas limit (default: 1.3).
     */
    gasAdjustment?: number;
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for transaction operations.
     */
    transactionMaxFee?: number | bigint;
    /**
     * - Chain ids keyed by Bech32 prefix, for IBC destinations chain-registry does not know (e.g. `{ wdk2: 'wdkdev2' }`). An entry overrides the registry for its prefix.
     */
    ibcChains?: Record<string, string>;
};
export type ResolvedChainConfig = {
    /**
     * - Array of RPC endpoint URLs for fallback.
     */
    rpcEndpoints: string[];
    /**
     * - Max retry rounds for RPC fallback.
     */
    retryCount: number;
    /**
     * - Base delay in ms for exponential backoff.
     */
    retryDelay: number;
    /**
     * - The Bech32 address prefix.
     */
    addressPrefix: string;
    /**
     * - The native token denomination.
     */
    nativeDenom: string;
    /**
     * - The BIP-44 coin type.
     */
    coinType: number;
    /**
     * - The gas price with denom.
     */
    gasPrice?: string;
    /**
     * - Gas price tiers from chain-registry fee token metadata.
     */
    gasPriceStep?: {
        low: number;
        average: number;
        high: number;
        denom: string;
    };
    /**
     * - The multiplier applied to simulated gas usage to set the gas limit.
     */
    gasAdjustment: number;
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for transaction operations.
     */
    transactionMaxFee?: number | bigint;
    /**
     * - The chain ID (from registry).
     */
    chainId?: string;
    /**
     * - The human-readable chain name (from registry).
     */
    prettyName?: string;
    /**
     * - Chain ids keyed by Bech32 prefix, for IBC destinations chain-registry does not know (e.g. `{ wdk2: 'wdkdev2' }`). An entry overrides the registry for its prefix.
     */
    ibcChains?: Record<string, string>;
};
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
export declare function resolveChainConfig(config?: CosmosWalletConfig): ResolvedChainConfig;
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
export declare function getChainIdsForPrefix(prefix: string, ibcChains?: Record<string, string>): string[];
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
export declare function getRegistryIbcChannels(chainId: string): {
    channelId: string;
    counterpartyChannelId: string;
    counterpartyChainId: string;
}[];
/**
 * Returns the list of available chain names from chain-registry.
 *
 * @returns {string[]} Array of chain names.
 */
export declare function getAvailableChains(): string[];
/**
 * Checks if a chain name exists in the registry.
 *
 * @param {string} chainName - The chain name to check.
 * @returns {boolean} True if the chain exists.
 */
export declare function isKnownChain(chainName: string): boolean;
