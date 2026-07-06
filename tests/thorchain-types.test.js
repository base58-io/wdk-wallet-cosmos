// @ts-nocheck — the source uses generated-style proto code without
// strict types; the tests are runtime-checked via vitest assertions.
//
// Unit tests for the SwapDK-added THORChain/MAYAChain proto encoders.
// These tests exercise the hand-rolled `Asset` / `Coin` / `MsgDeposit`
// encoders directly — no network, no signing — so they're safe to run
// offline and double as a regression guard if anyone touches the
// protobuf wire format.

import { describe, it, expect } from 'vitest'

import {
  TYPE_URL_MSG_DEPOSIT,
  Asset,
  Coin,
  MsgDeposit,
  parseAssetString,
} from '../src/proto/thorchain-types.js'

describe('TYPE_URL_MSG_DEPOSIT', () => {
  it('matches the canonical THORChain/MAYAChain typeUrl', () => {
    // Both networks register MsgDeposit under `/types.MsgDeposit` — if
    // this string changes, every signed deposit tx will be rejected.
    expect(TYPE_URL_MSG_DEPOSIT).toBe('/types.MsgDeposit')
  })
})

describe('Asset.encode/decode roundtrip', () => {
  it('roundtrips a typical native asset (THOR.RUNE)', () => {
    const original = Asset.fromPartial({ chain: 'THOR', symbol: 'RUNE', ticker: 'RUNE' })
    const bytes = Asset.encode(original).finish()
    const decoded = Asset.decode(bytes)
    expect(decoded.chain).toBe('THOR')
    expect(decoded.symbol).toBe('RUNE')
    expect(decoded.ticker).toBe('RUNE')
    expect(decoded.synth).toBe(false)
    expect(decoded.trade).toBe(false)
    expect(decoded.secured).toBe(false)
  })

  it('preserves boolean modifiers (synth/trade/secured)', () => {
    const original = Asset.fromPartial({
      chain: 'BTC',
      symbol: 'BTC',
      ticker: 'BTC',
      synth: true,
    })
    const decoded = Asset.decode(Asset.encode(original).finish())
    expect(decoded.synth).toBe(true)
  })
})

describe('Coin.encode/decode roundtrip', () => {
  it('roundtrips a coin with nested Asset', () => {
    const original = Coin.fromPartial({
      asset: { chain: 'MAYA', symbol: 'CACAO', ticker: 'CACAO' },
      amount: '100000000',
      decimals: 0,
    })
    const decoded = Coin.decode(Coin.encode(original).finish())
    expect(decoded.amount).toBe('100000000')
    expect(decoded.asset.chain).toBe('MAYA')
    expect(decoded.asset.symbol).toBe('CACAO')
  })
})

describe('MsgDeposit.encode/decode roundtrip', () => {
  it('roundtrips a complete deposit message', () => {
    const signer = new Uint8Array([1, 2, 3, 4, 5])
    const original = MsgDeposit.fromPartial({
      coins: [
        {
          asset: { chain: 'THOR', symbol: 'RUNE', ticker: 'RUNE' },
          amount: '50000000',
          decimals: 0,
        },
      ],
      memo: '=:BTC.BTC:bc1qtest:0/1/0',
      signer,
    })
    const decoded = MsgDeposit.decode(MsgDeposit.encode(original).finish())
    expect(decoded.coins).toHaveLength(1)
    expect(decoded.coins[0].amount).toBe('50000000')
    expect(decoded.coins[0].asset.chain).toBe('THOR')
    expect(decoded.memo).toBe('=:BTC.BTC:bc1qtest:0/1/0')
    expect(Array.from(decoded.signer)).toEqual([1, 2, 3, 4, 5])
  })

  it('handles an empty memo', () => {
    const original = MsgDeposit.fromPartial({
      coins: [{ asset: { chain: 'THOR', symbol: 'RUNE', ticker: 'RUNE' }, amount: '1' }],
      memo: '',
      signer: new Uint8Array([0]),
    })
    const decoded = MsgDeposit.decode(MsgDeposit.encode(original).finish())
    expect(decoded.memo).toBe('')
  })
})

describe('parseAssetString', () => {
  it('parses native chain assets like THOR.RUNE', () => {
    const a = parseAssetString('THOR.RUNE')
    expect(a.chain).toBe('THOR')
    expect(a.symbol).toBe('RUNE')
    expect(a.ticker).toBe('RUNE')
  })

  it('parses MAYA.CACAO', () => {
    const a = parseAssetString('MAYA.CACAO')
    expect(a.chain).toBe('MAYA')
    expect(a.symbol).toBe('CACAO')
  })

  it('strips the contract suffix from ERC-20 references', () => {
    const a = parseAssetString('ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(a.chain).toBe('ETH')
    expect(a.symbol).toBe('USDC')
    expect(a.ticker).toBe('USDC')
  })

  it('upper-cases the chain prefix', () => {
    const a = parseAssetString('thor.RUNE')
    expect(a.chain).toBe('THOR')
  })

  it('throws on missing dot separator', () => {
    expect(() => parseAssetString('RUNE')).toThrow(/CHAIN\.SYMBOL/)
  })

  it('throws on empty input', () => {
    expect(() => parseAssetString('')).toThrow(/non-empty string/)
  })
})
