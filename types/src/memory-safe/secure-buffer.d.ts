/**
 * A memory-safe buffer wrapper that securely zeroes memory on disposal.
 * This prevents sensitive data (like private keys) from lingering in memory
 * after they're no longer needed.
 */
export default class SecureBuffer {
    /**
     * Creates a SecureBuffer from a hex string.
     *
     * @param {string} hex - The hex string (with or without 0x prefix).
     * @returns {SecureBuffer} The secure buffer.
     */
    static fromHex(hex: string): SecureBuffer;
    /**
     * Securely zeroes a Uint8Array without creating a SecureBuffer.
     * Useful for cleaning up temporary buffers.
     *
     * @param {Uint8Array} buffer - The buffer to zero.
     */
    static zero(buffer: Uint8Array): void;
    /**
     * Creates a new SecureBuffer.
     *
     * @param {Uint8Array} data - The sensitive data to store.
     */
    constructor(data: Uint8Array);
    /**
     * The underlying buffer containing sensitive data.
     *
     * @private
     * @type {Uint8Array}
     */
    private _buffer;
    /**
     * Whether this buffer has been disposed.
     *
     * @private
     * @type {boolean}
     */
    private _disposed;
    /**
     * Returns the underlying buffer.
     * Throws if the buffer has been disposed.
     *
     * @returns {Uint8Array} The buffer.
     * @throws {Error} If the buffer has been disposed.
     */
    get buffer(): Uint8Array;
    /**
     * Returns the length of the buffer.
     *
     * @returns {number} The buffer length.
     */
    get length(): number;
    /**
     * Whether this buffer has been disposed.
     *
     * @returns {boolean} True if disposed.
     */
    get isDisposed(): boolean;
    /**
     * Creates a copy of the buffer.
     * The caller is responsible for securely handling the copy.
     *
     * @returns {Uint8Array} A copy of the buffer.
     * @throws {Error} If the buffer has been disposed.
     */
    copy(): Uint8Array;
    /**
     * Securely zeroes the memory and marks the buffer as disposed.
     * This operation is irreversible.
     */
    dispose(): void;
}
