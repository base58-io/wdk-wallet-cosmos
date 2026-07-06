// CosmJS Registry pre-populated with THORChain / MAYAChain `MsgDeposit`,
// on top of the standard Cosmos types. Used when constructing a
// SigningStargateClient that needs to sign a deposit tx.

'use strict'

import { Registry } from '@cosmjs/proto-signing'
import { defaultRegistryTypes } from '@cosmjs/stargate'

import { TYPE_URL_MSG_DEPOSIT, MsgDeposit } from './thorchain-types.js'

/**
 * Build a Registry with the standard Cosmos message types plus
 * THORChain/MAYAChain `MsgDeposit`. SigningStargateClient uses this to
 * encode the message before signing and broadcasting.
 *
 * @returns {Registry}
 */
export function createThorMayaRegistry() {
  return new Registry([
    ...defaultRegistryTypes,
    [TYPE_URL_MSG_DEPOSIT, MsgDeposit],
  ])
}
