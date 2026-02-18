/**
 * Calculates transaction fee amount from gas price and gas limit.
 *
 * @param {number} gasPriceAmount
 * @param {number} [gasLimit]
 * @returns {bigint | undefined}
 */
export function calculateFeeAmountFromGasPrice(gasPriceAmount: number, gasLimit?: number): bigint | undefined;
/**
 * Extracts gas price amount and denomination from `<amount><denom>` representation.
 *
 * @param {string | undefined} gasPrice
 * @returns {{ gasPriceAmount: number, gasPriceDenomination: string } | undefined}
 */
export function extractGasPrice(gasPrice: string | undefined): {
    gasPriceAmount: number;
    gasPriceDenomination: string;
} | undefined;
/**
 * Default gas limit for simple token transfers.
 *
 * @type {number}
 */
export const DEFAULT_TRANSFER_GAS_LIMIT: number;
/**
 * Default gas price tiers used as final fallback when no chain-specific gas metadata is available.
 * Mirrors common Cosmos wallet defaults (Keplr-compatible).
 *
 * @type {{ low: number, average: number, high: number }}
 */
export const DEFAULT_GAS_PRICE_STEP: {
    low: number;
    average: number;
    high: number;
};
