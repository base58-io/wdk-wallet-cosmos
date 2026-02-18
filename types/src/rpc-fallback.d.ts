/**
 * Determines if an error should be thrown immediately without retry.
 *
 * @param {Error} error - The error to evaluate.
 * @returns {boolean} True if the error should be thrown immediately (no retry).
 */
export function shouldThrow(error: Error): boolean;
/**
 * Calculates the retry delay using exponential backoff.
 * Formula: ~~(1 << attempt) * baseDelay
 *
 * @param {Error | null} error - The error that triggered the retry.
 * @param {number} attempt - The current attempt number (0-indexed).
 * @param {number} baseDelay - The base delay in milliseconds.
 * @returns {number} The delay in milliseconds before the next retry.
 */
export function calculateRetryDelay(error: Error | null, attempt: number, baseDelay: number): number;
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
export function withFallback<T>(endpoints: string[], operation: (endpoint: string) => Promise<T>, options?: FallbackOptions): Promise<T>;
/**
 * Creates a connection factory with fallback support.
 *
 * @template T
 * @param {string[]} endpoints - Array of RPC endpoint URLs.
 * @param {(endpoint: string) => Promise<T>} connectFn - Function to create a connection.
 * @param {FallbackOptions} [options] - Fallback configuration options.
 * @returns {() => Promise<T>} A function that returns a connected client.
 */
export function createFallbackConnection<T>(endpoints: string[], connectFn: (endpoint: string) => Promise<T>, options?: FallbackOptions): () => Promise<T>;
export type FallbackOptions = {
    /**
     * - Maximum number of retry rounds.
     */
    retryCount?: number | undefined;
    /**
     * - Base delay in ms for exponential backoff.
     */
    retryDelay?: number | undefined;
};
