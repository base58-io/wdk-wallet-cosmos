// Verify the SwapDK custom Registry registers MsgDeposit alongside
// the standard Cosmos types and can encode/decode a deposit message.

import { describe, it, expect } from 'vitest'

import { createThorMayaRegistry } from '../src/proto/registry.js'
import { TYPE_URL_MSG_DEPOSIT } from '../src/proto/thorchain-types.js'

describe('createThorMayaRegistry', () => {
  it('returns a Registry containing MsgDeposit under the canonical typeUrl', () => {
    const registry = createThorMayaRegistry()
    const generator = registry.lookupType(TYPE_URL_MSG_DEPOSIT)
    expect(generator).toBeDefined()
  })

  it('encodes a deposit message via the registered type', () => {
    const registry = createThorMayaRegistry()
    const encoded = registry.encode({
      typeUrl: TYPE_URL_MSG_DEPOSIT,
      value: {
        coins: [
          {
            asset: { chain: 'THOR', symbol: 'RUNE', ticker: 'RUNE' },
            amount: '100000000',
            decimals: 0,
          },
        ],
        memo: '=:BTC.BTC:bc1qtest:0/1/0',
        signer: new Uint8Array([1, 2, 3]),
      },
    })
    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(0)
  })

  it('still resolves a standard cosmos-sdk type (MsgSend) — defaults remain intact', () => {
    const registry = createThorMayaRegistry()
    const generator = registry.lookupType('/cosmos.bank.v1beta1.MsgSend')
    expect(generator).toBeDefined()
  })
})
