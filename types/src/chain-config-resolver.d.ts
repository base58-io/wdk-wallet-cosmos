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
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for transaction operations.
     */
    transactionMaxFee?: number | bigint;
    /**
     * - Optional IBC channel map keyed by destination Bech32 prefix.
     */
    ibcChannels?: Record<string, {
        sourceChannel: string;
    }>;
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
     * - Optional IBC channel map keyed by destination Bech32 prefix.
     */
    ibcChannels?: Record<string, {
        sourceChannel: string;
    }>;
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
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for transaction operations.
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
 * @property {number | bigint} [transactionMaxFee] - The maximum fee amount for transaction operations.
 * @property {string} [chainId] - The chain ID (from registry).
 * @property {string} [prettyName] - The human-readable chain name (from registry).
 * @property {Record<string, { sourceChannel: string }>} [ibcChannels] - Optional IBC channel map keyed by destination Bech32 prefix.
 */
/**
 * Resolves chain configuration from chain-registry or custom config.
 *
 * @param {CosmosWalletConfig} config - The wallet configuration.
 * @returns {ResolvedChainConfig} The resolved chain configuration.
 * @throws {ValueError} If chainName is provided but not found in registry.
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
