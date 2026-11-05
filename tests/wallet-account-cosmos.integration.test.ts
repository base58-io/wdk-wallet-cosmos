/**
 * Chain-backed `WalletAccountCosmos` tests. These need the two Ignite chains
 * and the Hermes relayer from docker-compose.yml to be up and IBC-connected;
 * run them with `npm run test:integration`. Everything that can be asserted
 * offline lives in wallet-account-cosmos.test.ts instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import WalletManagerCosmos, {
  WalletAccountCosmos,
  WalletAccountCosmosReadOnly,
} from '../index.js'
import { calculateFeeAmountFromGasPrice } from '../src/gas-fee-utils.js'
import {
  ALICE_ADDRESS,
  ALICE_MNEMONIC,
  BOB_ADDRESS_CHAIN_2,
  BOB_MNEMONIC,
  DEFAULT_TEST_GAS_PRICE_AMOUNT,
  IBC_CHAIN_1_CONFIG,
  IBC_CHAIN_2_CONFIG,
  resolveIbcDenom,
} from './fixtures.js'

/**
 * Polls `read` until it returns something other than `previous`: an IBC
 * transfer lands on the destination chain a few blocks after it is sent.
 */
async function waitForChange(
  read: () => Promise<bigint>,
  previous: bigint,
  timeout = 60_000
): Promise<bigint> {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (value !== previous || Date.now() > deadline) return value
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

describe('WalletAccountCosmos (chain-backed)', () => {
  let aliceWallet: InstanceType<typeof WalletManagerCosmos>
  let aliceAccount: WalletAccountCosmos
  let bobWallet: InstanceType<typeof WalletManagerCosmos>
  let bobAccount: WalletAccountCosmos

  beforeEach(async () => {
    aliceWallet = new WalletManagerCosmos(ALICE_MNEMONIC, IBC_CHAIN_1_CONFIG)
    aliceAccount = await aliceWallet.getAccount(0)

    bobWallet = new WalletManagerCosmos(BOB_MNEMONIC, IBC_CHAIN_1_CONFIG)
    bobAccount = await bobWallet.getAccount(0)
  })

  afterEach(() => {
    aliceWallet.dispose()
    bobWallet.dispose()
  })

  describe('getBalance', () => {
    it('should return the correct balance of the account', async () => {
      const balance = await aliceAccount.getBalance('stake')

      expect(typeof balance).toBe('bigint')
      expect(balance).toBeGreaterThan(BigInt(0))
    })

    it('should use nativeDenom from config for default balance check', async () => {
      const defaultDenomBalance = await aliceAccount.getBalance() // No denom passed
      const stakeBalance = await aliceAccount.getBalance('stake')

      expect(defaultDenomBalance).toBe(stakeBalance)
    })
  })

  describe('getTokenBalance', () => {
    it('should return the correct token balance of the account', async () => {
      const tokenBalance = await aliceAccount.getTokenBalance('token')

      expect(typeof tokenBalance).toBe('bigint')
      expect(tokenBalance).toBeGreaterThan(BigInt(0))
    })
  })

  describe('getTokenBalances', () => {
    it('should return the correct balances for multiple tokens', async () => {
      const balances = await aliceAccount.getTokenBalances(['stake', 'token'])

      expect(typeof balances.stake).toBe('bigint')
      expect(typeof balances.token).toBe('bigint')
      expect(balances.stake).toBeGreaterThan(BigInt(0))
      expect(balances.token).toBeGreaterThan(BigInt(0))
    })

    it('should return only requested balances', async () => {
      const balances = await aliceAccount.getTokenBalances(['token'])

      expect(typeof balances.token).toBe('bigint')
      expect(balances.token).toBeGreaterThan(BigInt(0))
    })

    it('should ignore tokens that the account does not hold', async () => {
      const balances = await aliceAccount.getTokenBalances([
        'stake',
        'nonexistent',
      ])
      const expectedStakeBalance = await aliceAccount.getBalance('stake')

      expect(balances).toEqual({
        stake: expectedStakeBalance,
      })
      expect(
        Object.prototype.hasOwnProperty.call(balances, 'nonexistent')
      ).toBe(false)
    })
  })

  describe('getIbcChannels', () => {
    it('should derive the open channel and the chain it leads to on both chains', async () => {
      const chain1 = WalletAccountCosmosReadOnly.fromAddress(
        ALICE_ADDRESS,
        IBC_CHAIN_1_CONFIG
      )
      const chain2 = WalletAccountCosmosReadOnly.fromAddress(
        BOB_ADDRESS_CHAIN_2,
        IBC_CHAIN_2_CONFIG
      )

      const [chain1Channels, chain2Channels] = await Promise.all([
        chain1.getIbcChannels(),
        chain2.getIbcChannels(),
      ])

      expect(chain1Channels).toEqual([
        {
          channelId: 'channel-0',
          counterpartyChannelId: 'channel-0',
          counterpartyChainId: 'wdkdev2',
        },
      ])
      expect(chain2Channels).toEqual([
        {
          channelId: 'channel-0',
          counterpartyChannelId: 'channel-0',
          counterpartyChainId: 'wdkdev',
        },
      ])
    })
  })

  describe('transfer', () => {
    it('should transfer tokens', async () => {
      const aliceBalanceBefore = await aliceAccount.getBalance('token')
      const bobBalanceBefore = await bobAccount.getBalance('token')

      const transfer = await bobAccount.transfer({
        token: 'token',
        recipient: ALICE_ADDRESS,
        amount: 1000,
      })

      expect(transfer).toBeDefined()

      const aliceBalanceAfter = await aliceAccount.getBalance('token')
      const bobBalanceAfter = await bobAccount.getBalance('token')

      expect(bobBalanceAfter).toBe(bobBalanceBefore - BigInt(1000))
      expect(aliceBalanceAfter).toBe(aliceBalanceBefore + BigInt(1000))
    })

    it('should sign at the simulated gas limit and deduct the returned fee', async () => {
      const balanceBefore = await bobAccount.getBalance('stake')

      const transfer = await bobAccount.transfer({
        token: 'token',
        recipient: ALICE_ADDRESS,
        amount: 1000,
      })

      const balanceAfter = await bobAccount.getBalance('stake')
      const receipt = await bobAccount.getTransaction(transfer.hash)
      const { gasUsed, gasWanted } = receipt.transaction

      expect(receipt.success).toBe(true)
      expect(receipt.fee).toBe(transfer.fee)
      expect(transfer.fee).toBe(
        calculateFeeAmountFromGasPrice(
          DEFAULT_TEST_GAS_PRICE_AMOUNT,
          Number(gasWanted)
        )
      )
      expect(gasUsed).toBeLessThanOrEqual(gasWanted)
      expect(balanceBefore - balanceAfter).toBe(transfer.fee)
    })

    it('should transfer native stake to wdkdev2 and back over the derived channel', async () => {
      const chain1AliceWallet = new WalletManagerCosmos(
        ALICE_MNEMONIC,
        IBC_CHAIN_1_CONFIG
      )
      const chain1AliceAccount = await chain1AliceWallet.getAccount(0)

      const chain2BobWallet = new WalletManagerCosmos(
        BOB_MNEMONIC,
        IBC_CHAIN_2_CONFIG
      )
      const chain2BobAccount = await chain2BobWallet.getAccount(0)

      try {
        const aliceAddress = await chain1AliceAccount.getAddress()
        const bobAddress = await chain2BobAccount.getAddress()

        expect(aliceAddress).toBe(ALICE_ADDRESS)
        expect(bobAddress).toBe(BOB_ADDRESS_CHAIN_2)

        // The voucher's denom is named after the channel on the receiving side.
        const [channel] = await chain1AliceAccount.getIbcChannels()
        const voucherDenom = resolveIbcDenom(
          channel.counterpartyChannelId,
          'stake'
        )
        const transferAmount = 1000

        const bobVoucherBefore = await chain2BobAccount.getBalance(voucherDenom)
        const transferResult = await chain1AliceAccount.transfer({
          token: 'stake',
          recipient: bobAddress,
          amount: transferAmount,
        })

        expect(transferResult.fee).toBeGreaterThan(BigInt(0))
        const receipt = await chain1AliceAccount.getTransaction(
          transferResult.hash
        )
        expect(receipt.success).toBe(true)
        expect(receipt.fee).toBe(transferResult.fee)

        const bobVoucherAfter = await waitForChange(
          () => chain2BobAccount.getBalance(voucherDenom),
          bobVoucherBefore
        )
        expect(bobVoucherAfter - bobVoucherBefore).toBe(BigInt(transferAmount))

        // Sending the voucher back routes through ibcChains' `wdk` entry.
        const aliceStakeBefore = await chain1AliceAccount.getBalance('stake')
        const returnResult = await chain2BobAccount.transfer({
          token: voucherDenom,
          recipient: aliceAddress,
          amount: transferAmount,
        })
        expect(
          (await chain2BobAccount.getTransaction(returnResult.hash)).success
        ).toBe(true)

        const aliceStakeAfter = await waitForChange(
          () => chain1AliceAccount.getBalance('stake'),
          aliceStakeBefore
        )
        expect(aliceStakeAfter - aliceStakeBefore).toBe(BigInt(transferAmount))
      } finally {
        chain1AliceWallet.dispose()
        chain2BobWallet.dispose()
      }
    }, 150_000)
  })
})
