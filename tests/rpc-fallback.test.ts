import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldThrow,
  calculateRetryDelay,
  withFallback,
} from '../src/rpc-fallback.js'
import { ProviderError, ProviderErrorReason } from '@tetherto/wdk-wallet'

describe('shouldThrow', () => {
  describe('ABCI error codes', () => {
    it('returns true for insufficient funds (code 5)', () => {
      const error = Object.assign(new Error('insufficient funds'), { code: 5 })
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for out of gas (code 11)', () => {
      const error = Object.assign(new Error('out of gas'), { code: 11 })
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for invalid sequence (code 3)', () => {
      const error = Object.assign(new Error('invalid sequence'), { code: 3 })
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for unauthorized (code 4)', () => {
      const error = Object.assign(new Error('unauthorized'), { code: 4 })
      expect(shouldThrow(error)).toBe(true)
    })
  })

  describe('JSON-RPC error codes', () => {
    it('returns true for parse error (-32700)', () => {
      const error = Object.assign(new Error('Parse error'), { code: -32700 })
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for invalid request (-32600)', () => {
      const error = Object.assign(new Error('Invalid Request'), { code: -32600 })
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for method not found (-32601)', () => {
      const error = Object.assign(new Error('Method not found'), { code: -32601 })
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for invalid params (-32602)', () => {
      const error = Object.assign(new Error('Invalid params'), { code: -32602 })
      expect(shouldThrow(error)).toBe(true)
    })
  })

  describe('error message patterns', () => {
    it('returns true for "insufficient funds" in message', () => {
      const error = new Error('Transaction failed: insufficient funds')
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for "out of gas" in message', () => {
      const error = new Error('out of gas in location')
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for "signature verification failed" in message', () => {
      const error = new Error('signature verification failed')
      expect(shouldThrow(error)).toBe(true)
    })

    it('returns true for "invalid chain-id" in message', () => {
      const error = new Error('invalid chain-id')
      expect(shouldThrow(error)).toBe(true)
    })
  })

  describe('network errors (retryable)', () => {
    it('returns false for timeout errors', () => {
      const error = new Error('Request timeout')
      expect(shouldThrow(error)).toBe(false)
    })

    it('returns false for ECONNREFUSED', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:26657')
      expect(shouldThrow(error)).toBe(false)
    })

    it('returns false for ECONNRESET', () => {
      const error = new Error('read ECONNRESET')
      expect(shouldThrow(error)).toBe(false)
    })

    it('returns false for "fetch failed"', () => {
      const error = new Error('fetch failed')
      expect(shouldThrow(error)).toBe(false)
    })

    it('returns false for 503 errors', () => {
      const error = new Error('Service Unavailable 503')
      expect(shouldThrow(error)).toBe(false)
    })

    it('returns false for 429 rate limiting', () => {
      const error = new Error('Too Many Requests 429')
      expect(shouldThrow(error)).toBe(false)
    })
  })
})

describe('calculateRetryDelay', () => {
  it('returns exponential backoff for attempt 0', () => {
    const delay = calculateRetryDelay(null, 0, 150)
    expect(delay).toBe(150)
  })

  it('returns exponential backoff for attempt 1', () => {
    const delay = calculateRetryDelay(null, 1, 150)
    expect(delay).toBe(300)
  })

  it('returns exponential backoff for attempt 2', () => {
    const delay = calculateRetryDelay(null, 2, 150)
    expect(delay).toBe(600)
  })

  it('returns exponential backoff for attempt 3', () => {
    const delay = calculateRetryDelay(null, 3, 150)
    expect(delay).toBe(1200)
  })

  it('respects Retry-After header when present', () => {
    const error = Object.assign(new Error('Rate limited'), {
      headers: { get: (key: string) => (key === 'Retry-After' ? '5' : null) },
    })
    const delay = calculateRetryDelay(error, 0, 150)
    expect(delay).toBe(5000)
  })
})

describe('withFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws if no endpoints provided', async () => {
    await expect(withFallback([], async () => 'result')).rejects.toThrow(
      'No RPC endpoints provided'
    )
  })

  it('returns result on first successful call', async () => {
    const operation = vi.fn().mockResolvedValue('success')
    const result = await withFallback(['endpoint1'], operation)
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(operation).toHaveBeenCalledWith('endpoint1')
  })

  it('falls back to next endpoint on network error', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce('success')

    const result = await withFallback(['endpoint1', 'endpoint2'], operation)
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(operation).toHaveBeenNthCalledWith(1, 'endpoint1')
    expect(operation).toHaveBeenNthCalledWith(2, 'endpoint2')
  })

  it('throws immediately for non-retryable errors', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('insufficient funds'))

    await expect(
      withFallback(['endpoint1', 'endpoint2'], operation)
    ).rejects.toThrow('insufficient funds')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('retries with exponential backoff after trying all endpoints', async () => {
    vi.useRealTimers()

    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success')

    const result = await withFallback(['ep1', 'ep2'], operation, {
      retryCount: 3,
      retryDelay: 10,
    })

    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('throws last error after exhausting all retries', async () => {
    vi.useRealTimers()

    const operation = vi.fn().mockRejectedValue(new Error('timeout'))

    await expect(
      withFallback(['ep1'], operation, {
        retryCount: 2,
        retryDelay: 10,
      })
    ).rejects.toThrow('timeout')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('surfaces an exhausted transport failure as a ProviderError', async () => {
    vi.useRealTimers()

    const operation = vi.fn().mockRejectedValue(new Error('fetch failed'))

    await expect(
      withFallback(['ep1'], operation, { retryCount: 0 })
    ).rejects.toThrow(ProviderError)
    await expect(
      withFallback(['ep1'], operation, { retryCount: 0 })
    ).rejects.toMatchObject({ reason: ProviderErrorReason.NETWORK_ERROR })
  })

  it('classifies a timed-out endpoint as a request timeout', async () => {
    vi.useRealTimers()

    const operation = vi.fn().mockRejectedValue(new Error('Request timeout'))

    await expect(
      withFallback(['ep1'], operation, { retryCount: 0 })
    ).rejects.toMatchObject({ reason: ProviderErrorReason.REQUEST_TIMEOUT })
  })

  it('passes chain-level failures through unwrapped', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('insufficient funds'))

    await expect(withFallback(['ep1'], operation)).rejects.not.toBeInstanceOf(
      ProviderError
    )
  })
})
