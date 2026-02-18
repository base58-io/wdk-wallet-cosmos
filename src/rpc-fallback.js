'use strict'

/**
 * Cosmos SDK ABCI error codes that should NOT be retried.
 * @see https://github.com/cosmos/cosmos-sdk/blob/main/types/errors/errors.go
 */
const NON_RETRYABLE_ABCI_CODES = new Set([
  2, // tx parse error
  3, // invalid sequence
  4, // unauthorized
  5, // insufficient funds
  6, // unknown request
  7, // invalid address
  8, // invalid pubkey
  9, // unknown address
  10, // invalid coins
  11, // out of gas
  12, // memo too large
  13, // insufficient fee
  14, // max signatures exceeded
  15, // no signatures
  18, // invalid request
  21, // tx too large
  24, // signer mismatch
  28, // invalid chain-id
  30, // tx timeout height
  32, // incorrect sequence
  37, // not supported
  41, // invalid gas limit
  42, // tx timeout
])

/**
 * CometBFT/Tendermint JSON-RPC error codes that should NOT be retried.
 * @see https://github.com/cometbft/cometbft/blob/main/rpc/jsonrpc/types/types.go
 */
const NON_RETRYABLE_RPC_CODES = new Set([
  -32700, // Parse error
  -32600, // Invalid Request
  -32601, // Method not found
  -32602, // Invalid params
])

const NON_RETRYABLE_ERROR_PATTERNS =
  /insufficient funds|out of gas|invalid sequence|incorrect account sequence|signature verification failed|unauthorized|invalid address|unknown address|invalid coins|memo too large|tx too large|invalid chain-id|tx timeout|invalid pubkey|account.*not found|invalid request|unknown request|no signatures|maximum.*signatures|signer does not match|feature not supported|invalid gas/i

const RETRYABLE_NETWORK_ERRORS =
  /timeout|econnrefused|econnreset|enotfound|fetch failed|network|socket hang up|aborted|failed to fetch|connection refused|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|503|502|504|429/i

/**
 * Determines if an error should be thrown immediately without retry.
 *
 * @param {Error} error - The error to evaluate.
 * @returns {boolean} True if the error should be thrown immediately (no retry).
 */
export function shouldThrow(error) {
  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'number') {
      if (NON_RETRYABLE_ABCI_CODES.has(error.code)) {
        return true
      }
      if (NON_RETRYABLE_RPC_CODES.has(error.code)) {
        return true
      }
    }
  }

  const message = error?.message ?? ''

  if (NON_RETRYABLE_ERROR_PATTERNS.test(message)) {
    return true
  }

  if (RETRYABLE_NETWORK_ERRORS.test(message)) {
    return false
  }

  return true
}

/**
 * Calculates the retry delay using exponential backoff.
 * Formula: ~~(1 << attempt) * baseDelay
 *
 * @param {Error | null} error - The error that triggered the retry.
 * @param {number} attempt - The current attempt number (0-indexed).
 * @param {number} baseDelay - The base delay in milliseconds.
 * @returns {number} The delay in milliseconds before the next retry.
 */
export function calculateRetryDelay(error, attempt, baseDelay) {
  if (error && typeof error === 'object' && 'headers' in error) {
    const headers = /** @type {{ get?: (key: string) => string | null }} */ (
      error.headers
    )
    const retryAfter = headers?.get?.('Retry-After')
    if (retryAfter?.match(/\d/)) {
      return Number.parseInt(retryAfter, 10) * 1000
    }
  }

  return ~~(1 << attempt) * baseDelay
}

/**
 * @typedef {Object} FallbackOptions
 * @property {number} [retryCount=3] - Maximum number of retry rounds.
 * @property {number} [retryDelay=150] - Base delay in ms for exponential backoff.
 */

/**
 * Executes an async operation with fallback across multiple RPC endpoints.
 *
 * @template T
 * @param {string[]} endpoints - Array of RPC endpoint URLs to try.
 * @param {(endpoint: string) => Promise<T>} operation - The async operation to execute.
 * @param {FallbackOptions} [options] - Fallback configuration options.
 * @returns {Promise<T>} The result of the successful operation.
 * @throws {Error} The last error if all endpoints and retries are exhausted.
 */
export async function withFallback(endpoints, operation, options = {}) {
  if (!endpoints || endpoints.length === 0) {
    throw new Error('No RPC endpoints provided for fallback')
  }

  const retryCount = options.retryCount ?? 3
  const retryDelay = options.retryDelay ?? 150

  /** @type {Error | null} */
  let lastError = null

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i]

      try {
        return await operation(endpoint)
      } catch (err) {
        const error = /** @type {Error} */ (err)
        lastError = error

        if (shouldThrow(error)) {
          throw error
        }

        const isLastEndpoint = i === endpoints.length - 1
        const isLastAttempt = attempt === retryCount

        if (isLastEndpoint && !isLastAttempt) {
          const delay = calculateRetryDelay(lastError, attempt, retryDelay)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }

        if (isLastEndpoint && isLastAttempt) {
          throw lastError
        }
      }
    }
  }

  throw lastError ?? new Error('All RPC endpoints failed')
}

/**
 * Creates a connection factory with fallback support.
 *
 * @template T
 * @param {string[]} endpoints - Array of RPC endpoint URLs.
 * @param {(endpoint: string) => Promise<T>} connectFn - Function to create a connection.
 * @param {FallbackOptions} [options] - Fallback configuration options.
 * @returns {() => Promise<T>} A function that returns a connected client.
 */
export function createFallbackConnection(endpoints, connectFn, options = {}) {
  return () => withFallback(endpoints, connectFn, options)
}
