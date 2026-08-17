/**
 * Chain-backed `WalletAccountCosmos` tests. These need the two Ignite chains
 * and the Hermes relayer from docker-compose.yml to be up and IBC-connected;
 * run them with `npm run test:integration`. Everything that can be asserted
 * offline lives in wallet-account-cosmos.test.ts instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import WalletManagerCosmos, { WalletAccountCosmos } from '../index.js'
import {
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
} from '../src/gas-fee-utils.js'
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

    it('should deduct correct fee from sender balance', async () => {
      const balanceBefore = await bobAccount.getBalance('stake')

      await bobAccount.transfer({
        token: 'token',
        recipient: ALICE_ADDRESS,
        amount: 1000,
      })

      const balanceAfter = await bobAccount.getBalance('stake')
      const expectedFee = calculateFeeAmountFromGasPrice(
        DEFAULT_TEST_GAS_PRICE_AMOUNT,
        DEFAULT_TRANSFER_GAS_LIMIT
      )

      expect(expectedFee).toBeDefined()
      expect(balanceBefore - balanceAfter).toBe(expectedFee)
    })

    it('should transfer native stake from wdkdev (wdk) to wdkdev2 (wdk2) via IBC', async () => {
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

        const baseDenom = 'stake'
        const sourceChannel = IBC_CHAIN_1_CONFIG.ibcChannels.wdk2.sourceChannel
        const destinationIbcDenom = resolveIbcDenom(sourceChannel, baseDenom)

        const bobIbcBalanceBefore =
          await chain2BobAccount.getBalance(destinationIbcDenom)

        const transferAmount = 1000
        const transferResult = await chain1AliceAccount.transfer({
          token: baseDenom,
          recipient: bobAddress,
          amount: transferAmount,
        })

        expect(transferResult.hash).toBeTypeOf('string')
        expect(transferResult.hash.length).toBeGreaterThan(0)
        expect(transferResult.fee).toBeGreaterThan(BigInt(0))

        const bobIbcBalanceAfter =
          await chain2BobAccount.getBalance(destinationIbcDenom)

        expect(bobIbcBalanceAfter - bobIbcBalanceBefore).toBe(
          BigInt(transferAmount)
        )
      } finally {
        chain1AliceWallet.dispose()
        chain2BobWallet.dispose()
      }
    }, 150_000)
  })
})
