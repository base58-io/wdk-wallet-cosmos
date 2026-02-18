"use strict";

// eslint-disable-next-line camelcase
import { sodium_memzero } from "sodium-universal";

/**
 * A memory-safe buffer wrapper that securely zeroes memory on disposal.
 * This prevents sensitive data (like private keys) from lingering in memory
 * after they're no longer needed.
 */
export default class SecureBuffer {
  /**
   * Creates a new SecureBuffer.
   *
   * @param {Uint8Array} data - The sensitive data to store.
   */
  constructor(data) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("SecureBuffer requires a Uint8Array");
    }

    /**
     * The underlying buffer containing sensitive data.
     *
     * @private
     * @type {Uint8Array}
     */
    this._buffer = data;

    /**
     * Whether this buffer has been disposed.
     *
     * @private
     * @type {boolean}
     */
    this._disposed = false;
  }

  /**
   * Returns the underlying buffer.
   * Throws if the buffer has been disposed.
   *
   * @returns {Uint8Array} The buffer.
   * @throws {Error} If the buffer has been disposed.
   */
  get buffer() {
    if (this._disposed) {
      throw new Error("Cannot access disposed SecureBuffer");
    }
    return this._buffer;
  }

  /**
   * Returns the length of the buffer.
   *
   * @returns {number} The buffer length.
   */
  get length() {
    return this._disposed ? 0 : this._buffer.length;
  }

  /**
   * Whether this buffer has been disposed.
   *
   * @returns {boolean} True if disposed.
   */
  get isDisposed() {
    return this._disposed;
  }

  /**
   * Creates a copy of the buffer.
   * The caller is responsible for securely handling the copy.
   *
   * @returns {Uint8Array} A copy of the buffer.
   * @throws {Error} If the buffer has been disposed.
   */
  copy() {
    if (this._disposed) {
      throw new Error("Cannot copy disposed SecureBuffer");
    }
    return new Uint8Array(this._buffer);
  }

  /**
   * Securely zeroes the memory and marks the buffer as disposed.
   * This operation is irreversible.
   */
  dispose() {
    if (this._disposed) {
      return;
    }

    // Zero the memory but keep the buffer reference
    // The _disposed flag prevents further access
    sodium_memzero(this._buffer);
    this._disposed = true;
  }

  /**
   * Creates a SecureBuffer from a hex string.
   *
   * @param {string} hex - The hex string (with or without 0x prefix).
   * @returns {SecureBuffer} The secure buffer.
   */
  static fromHex(hex) {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);

    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }

    return new SecureBuffer(bytes);
  }

  /**
   * Securely zeroes a Uint8Array without creating a SecureBuffer.
   * Useful for cleaning up temporary buffers.
   *
   * @param {Uint8Array} buffer - The buffer to zero.
   */
  static zero(buffer) {
    if (buffer instanceof Uint8Array) {
      sodium_memzero(buffer);
    }
  }
}
