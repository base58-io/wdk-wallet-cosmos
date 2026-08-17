import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as bip39 from 'bip39'
import WalletManagerCosmos, {
  SeedSignerCosmos,
  WalletAccountCosmos,
} from '../index.js'
import {
  InvalidSignerError,
  ProviderRequiredError,
  UnsupportedOperationError,
} from '@tetherto/wdk-wallet'
import {
  DEFAULT_GAS_PRICE_STEP,
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
} from '../src/gas-fee-utils.js'

// Alice mnemonic from Ignite output (for local/dev use only)
const ALICE_MNEMONIC =
  'car knock victory oval pulse practice draw bulb fiction bulb involve dumb stairs discover update spatial blouse perfect match property wheat defense host fortune'

const ALICE_SEED = bip39.mnemonicToSeedSync(ALICE_MNEMONIC)

// Alice address from Ignite output (Bech32 with `wdk` prefix)
const ALICE_ADDRESS = 'wdk1jvjy9gpu95k9uaez7ncydkaurcqpcpye7znlz5'
const ALICE_ADDRESS_INDEX_1 = 'wdk15zu5gul0vcukzgyzg4skv3dcdtat528k5v2gzp'

// Default cosmos prefix address for Alice
const ALICE_COSMOS_ADDRESS = 'cosmos1jvjy9gpu95k9uaez7ncydkaurcqpcpye30dj9q'

describe('WalletManagerCosmos', () => {
  let wallet: InstanceType<typeof WalletManagerCosmos>

  beforeEach(() => {
    wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
      rpcEndpoints: ['http://localhost:26657'],
      addressPrefix: 'wdk',
    })
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('constructor', () => {
    it('should successfully initialize a wallet with a seed phrase', async () => {
      const testWallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })

      const account = await testWallet.getAccount(0)
      const address = await account.getAddress()

      expect(testWallet).toBeInstanceOf(WalletManagerCosmos)
      expect(testWallet.isDisposed).toBe(false)
      expect(address).toBe(ALICE_ADDRESS)

      testWallet.dispose()
    })

    it('should successfully initialize a wallet with a Cosmos signer', async () => {
      const signer = new SeedSignerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })
      const testWallet = new WalletManagerCosmos(signer, {
        addressPrefix: 'wdk',
      })

      const account = await testWallet.getAccount(0)

      expect(await account.getAddress()).toBe(ALICE_ADDRESS)
      expect(testWallet.getSigner()).toBe(signer)

      testWallet.dispose()
    })

    it('should successfully initialize a wallet with seed bytes', async () => {
      // .dispose() should not affect the original seed
      const _seedCopy = new Uint8Array(ALICE_SEED)
      const testWallet = new WalletManagerCosmos(_seedCopy, {
        addressPrefix: 'wdk',
      })

      const account = await testWallet.getAccount(0)
      const address = await account.getAddress()

      expect(testWallet).toBeInstanceOf(WalletManagerCosmos)
      expect(address).toBe(ALICE_ADDRESS)

      testWallet.dispose()
    })

    it("should use 'cosmos' as default address prefix", async () => {
      const testWallet = new WalletManagerCosmos(ALICE_MNEMONIC, {})
      const account = await testWallet.getAccount(0)
      const address = await account.getAddress()

      expect(address).toBe(ALICE_COSMOS_ADDRESS)
      expect(address.startsWith('cosmos')).toBe(true)

      testWallet.dispose()
    })
  })

  describe('getAccount', () => {
    it('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()

      expect(account).toBeInstanceOf(WalletAccountCosmos)

      const address = await account.getAddress()
      expect(address).toBe(ALICE_ADDRESS)
    })

    it('should return the account at the given index', async () => {
      const account0 = await wallet.getAccount(0)
      const account1 = await wallet.getAccount(1)

      const address0 = await account0.getAddress()
      const address1 = await account1.getAddress()

      expect(address0).not.toBe(address1)
      expect(address0).toBe(ALICE_ADDRESS)
      expect(address1).toBe(ALICE_ADDRESS_INDEX_1)
      expect(address1.startsWith('wdk')).toBe(true)
    })

    it('should cache accounts and return the same instance', async () => {
      const account1 = await wallet.getAccount(0)
      const account2 = await wallet.getAccount(0)

      expect(account1).toBe(account2)
    })

    it('should isolate accounts derived by different named signers', async () => {
      const namedSigner = new SeedSignerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })
      wallet.addSigner('cosmos', namedSigner)

      const defaultAccount = await wallet.getAccount(0)
      const namedAccount = await wallet.getAccount(0, {
        signerName: 'cosmos',
      })

      expect(defaultAccount).not.toBe(namedAccount)
      expect(await defaultAccount.getAddress()).toBe(ALICE_ADDRESS)
      expect(await namedAccount.getAddress()).toBe(ALICE_ADDRESS)
    })

    it('should return the account associated with a named signer', async () => {
      const rootSigner = new SeedSignerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })
      const accountSigner = await rootSigner.derive("0'/0/1")
      rootSigner.dispose()
      wallet.addSigner('account', accountSigner)

      const account = await wallet.getAccount('account')

      expect(await account.getAddress()).toBe(ALICE_ADDRESS_INDEX_1)
      expect(await wallet.getAccount('account')).toBe(account)
    })

    it('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1)).rejects.toThrow()
    })
  })

  describe('getAccountByPath', () => {
    it('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("0'/0/1")

      expect(account).toBeInstanceOf(WalletAccountCosmos)

      const address = await account.getAddress()
      expect(address).toBe(ALICE_ADDRESS_INDEX_1)
      expect(address.startsWith('wdk')).toBe(true)
    })

    it('should cache accounts by path and return the same instance', async () => {
      const account1 = await wallet.getAccountByPath("0'/0/1")
      const account2 = await wallet.getAccountByPath("0'/0/1")

      expect(account1).toBe(account2)
    })

    it('should return different accounts for different paths', async () => {
      const account1 = await wallet.getAccountByPath("0'/0/0")
      const account2 = await wallet.getAccountByPath("0'/0/1")

      const address1 = await account1.getAddress()
      const address2 = await account2.getAddress()

      expect(address1).not.toBe(address2)
      expect(address1).toBe(ALICE_ADDRESS)
      expect(address2).toBe(ALICE_ADDRESS_INDEX_1)
    })

    it('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c")).rejects.toThrow()
    })
  })

  describe('getFeeRates', () => {
    it('should return the fee rates', async () => {
      const feeRates = await wallet.getFeeRates()
      const expectedNormalFeeRate = calculateFeeAmountFromGasPrice(
        DEFAULT_GAS_PRICE_STEP.average,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      const expectedFastFeeRate = calculateFeeAmountFromGasPrice(
        DEFAULT_GAS_PRICE_STEP.high,
        DEFAULT_TRANSFER_GAS_LIMIT
      )

      expect(feeRates.normal).toBeDefined()
      expect(feeRates.fast).toBeDefined()
      expect(typeof feeRates.normal).toBe('bigint')
      expect(typeof feeRates.fast).toBe('bigint')
      expect(expectedNormalFeeRate).toBeDefined()
      expect(expectedFastFeeRate).toBeDefined()
      expect(feeRates.normal).toBe(expectedNormalFeeRate)
      expect(feeRates.fast).toBe(expectedFastFeeRate)
      expect(feeRates.fast).toBeGreaterThan(feeRates.normal)
    })

    it('should throw if the wallet is not connected to an RPC endpoint', async () => {
      const walletWithoutRpc = new WalletManagerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })

      await expect(walletWithoutRpc.getFeeRates()).rejects.toThrow(
        'The wallet must be configured with an RPC endpoint to get fee rates.'
      )

      walletWithoutRpc.dispose()
    })
  })

  describe('error types', () => {
    it('should throw InvalidSignerError for a non-derivable default signer', async () => {
      const rootSigner = new SeedSignerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })
      const childSigner = await rootSigner.derive("0'/0/0")
      rootSigner.dispose()

      expect(childSigner.isDerivable).toBe(false)
      expect(() => new WalletManagerCosmos(childSigner, {})).toThrow(
        InvalidSignerError
      )

      childSigner.dispose()
    })

    it('should throw UnsupportedOperationError when deriving from a child signer', async () => {
      const rootSigner = new SeedSignerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })
      const childSigner = await rootSigner.derive("0'/0/0")
      rootSigner.dispose()

      await expect(childSigner.derive("0'/0/1")).rejects.toThrow(
        UnsupportedOperationError
      )

      childSigner.dispose()
    })

    it('should throw ProviderRequiredError without an RPC endpoint', async () => {
      const walletWithoutRpc = new WalletManagerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })

      await expect(walletWithoutRpc.getFeeRates()).rejects.toThrow(
        ProviderRequiredError
      )

      walletWithoutRpc.dispose()
    })
  })

  describe('dispose', () => {
    it('should mark the wallet as disposed', () => {
      const testWallet = new WalletManagerCosmos(ALICE_MNEMONIC, {})

      expect(testWallet.isDisposed).toBe(false)

      testWallet.dispose()

      expect(testWallet.isDisposed).toBe(true)
    })

    it('should throw when trying to use a disposed wallet', async () => {
      const testWallet = new WalletManagerCosmos(ALICE_MNEMONIC, {})
      testWallet.dispose()

      await expect(testWallet.getAccount(0)).rejects.toThrow(
        'Cannot use disposed wallet manager'
      )
    })

    it('should dispose registered signers', () => {
      const signer = new SeedSignerCosmos(ALICE_MNEMONIC, {
        addressPrefix: 'wdk',
      })
      const testWallet = new WalletManagerCosmos(ALICE_MNEMONIC, {})
      testWallet.addSigner('other', signer)

      testWallet.dispose()

      expect(signer.isDerivable).toBe(false)
    })

    it('should be idempotent (calling dispose multiple times is safe)', () => {
      const testWallet = new WalletManagerCosmos(ALICE_MNEMONIC, {})

      testWallet.dispose()
      testWallet.dispose()
      testWallet.dispose()

      expect(testWallet.isDisposed).toBe(true)
    })
  })
})
