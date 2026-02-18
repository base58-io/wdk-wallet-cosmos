'use strict'

/**
 * Default gas limit for simple token transfers.
 *
 * @type {number}
 */
export const DEFAULT_TRANSFER_GAS_LIMIT = 200000

/**
 * Default gas price tiers used as final fallback when no chain-specific gas metadata is available.
 * Mirrors common Cosmos wallet defaults (Keplr-compatible).
 *
 * @type {{ low: number, average: number, high: number }}
 */
export const DEFAULT_GAS_PRICE_STEP = {
  low: 0.01,
  average: 0.025,
  high: 0.04,
}

/**
 * Calculates transaction fee amount from gas price and gas limit.
 *
 * @param {number} gasPriceAmount
 * @param {number} [gasLimit]
 * @returns {bigint | undefined}
 */
export function calculateFeeAmountFromGasPrice(
  gasPriceAmount,
  gasLimit = DEFAULT_TRANSFER_GAS_LIMIT
) {
  if (!Number.isFinite(gasPriceAmount) || gasPriceAmount <= 0) {
    return undefined
  }

  if (!Number.isFinite(gasLimit) || gasLimit <= 0) {
    return undefined
  }

  const calculatedFeeAmount = Math.ceil(gasPriceAmount * gasLimit)

  return Number.isFinite(calculatedFeeAmount) && calculatedFeeAmount > 0
    ? BigInt(calculatedFeeAmount)
    : undefined
}

/**
 * Extracts gas price amount and denomination from `<amount><denom>` representation.
 *
 * @param {string | undefined} gasPrice
 * @returns {{ gasPriceAmount: number, gasPriceDenomination: string } | undefined}
 */
export function extractGasPrice(gasPrice) {
  if (!gasPrice) {
    return undefined
  }

  const gasPriceMatch = gasPrice.match(
    /^([0-9]+(?:\.[0-9]+)?)([a-zA-Z][a-zA-Z0-9/:._-]*)$/
  )
  if (!gasPriceMatch) {
    return undefined
  }

  const gasPriceAmount = parseFloat(gasPriceMatch[1])
  if (!Number.isFinite(gasPriceAmount) || gasPriceAmount <= 0) {
    return undefined
  }

  return {
    gasPriceAmount,
    gasPriceDenomination: gasPriceMatch[2],
  }
}
