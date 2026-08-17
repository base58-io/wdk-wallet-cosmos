import * as bip39 from 'bip39'
import { createHash } from 'crypto'

// Shared between the offline and chain-backed `WalletAccountCosmos` suites.
// The two chains and their IBC channel are defined in docker-compose.yml.

export const IBC_CHAIN_1_CONFIG = {
  rpcEndpoints: ['http://localhost:26657'],
  addressPrefix: 'wdk',
  nativeDenom: 'stake',
  gasPrice: '0.025stake',
  ibcChannels: {
    wdk2: {
      sourceChannel: 'channel-0',
    },
  },
}

export const IBC_CHAIN_2_CONFIG = {
  rpcEndpoints: ['http://localhost:26658'],
  addressPrefix: 'wdk2',
  nativeDenom: 'stake',
  gasPrice: '0.025stake',
  ibcChannels: {
    wdk: {
      sourceChannel: 'channel-0',
    },
  },
}

// Alice mnemonic from Ignite output (for local/dev use only)
export const ALICE_MNEMONIC =
  'car knock victory oval pulse practice draw bulb fiction bulb involve dumb stairs discover update spatial blouse perfect match property wheat defense host fortune'

// Bob mnemonic from Ignite output (for local/dev use only)
export const BOB_MNEMONIC =
  'banner spread envelope side kite person disagree path silver will brother under couch edit food venture squirrel civil budget number acquire point work mass'

export const INVALID_MNEMONIC = 'invalid seed phrase that should not work'

export const ALICE_SEED = bip39.mnemonicToSeedSync(ALICE_MNEMONIC)

// Alice and Bob addresses from Ignite output (Bech32 with `wdk` prefix)
export const ALICE_ADDRESS = 'wdk1jvjy9gpu95k9uaez7ncydkaurcqpcpye7znlz5'
export const BOB_ADDRESS = 'wdk1m9l358xunhhwds0568za49mzhvuxx9uxv52xme'

export const BOB_ADDRESS_CHAIN_2 = 'wdk21m9l358xunhhwds0568za49mzhvuxx9uxs7puwd'

export const DEFAULT_TEST_GAS_PRICE_AMOUNT = 0.025

/** Derives the `ibc/<hash>` denom a base denom takes on after one hop. */
export function resolveIbcDenom(
  sourceChannel: string,
  baseDenom: string
): string {
  const denomTrace = `transfer/${sourceChannel}/${baseDenom}`
  const hash = createHash('sha256')
    .update(denomTrace)
    .digest('hex')
    .toUpperCase()
  return `ibc/${hash}`
}
