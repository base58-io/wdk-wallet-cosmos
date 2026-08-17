/**
 * Offline `WalletAccountCosmos` tests. Nothing here reaches a chain: RPC
 * clients are either stubbed or never constructed, so this suite runs in CI.
 * Chain-backed assertions live in wallet-account-cosmos.integration.test.ts.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest'
import WalletManagerCosmos, {
  WalletAccountCosmos,
  WalletAccountCosmosReadOnly,
} from '../index.js'
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { SigningStargateClient, StargateClient } from '@cosmjs/stargate'
import {
  MaximumFeeExceededError,
  NoSuchElementError,
  ProviderRequiredError,
} from '@tetherto/wdk-wallet'
import {
  AuthInfo,
  TxRaw,
} from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import {
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
} from '../src/gas-fee-utils.js'
import {
  ALICE_ADDRESS,
  ALICE_MNEMONIC,
  ALICE_SEED,
  BOB_ADDRESS,
  BOB_ADDRESS_CHAIN_2,
  BOB_MNEMONIC,
  DEFAULT_TEST_GAS_PRICE_AMOUNT,
  IBC_CHAIN_1_CONFIG,
  INVALID_MNEMONIC,
} from './fixtures.js'

// A caller-supplied memo, expected to replace the default on transfers.
const CUSTOM_MEMO = 'order-12345'

function createSignedTransaction(fee: string): TxRaw {
  return TxRaw.fromPartial({
    bodyBytes: new Uint8Array(),
    authInfoBytes: AuthInfo.encode(
      AuthInfo.fromPartial({
        signerInfos: [],
        fee: {
          amount: [{ denom: 'stake', amount: fee }],
          gasLimit: BigInt(DEFAULT_TRANSFER_GAS_LIMIT),
          payer: '',
          granter: '',
        },
      })
    ).finish(),
    signatures: [new Uint8Array()],
  })
}

/** Builds the `IndexedTx` shape `StargateClient.getTx` resolves with. */
function createIndexedTx(overrides: Record<string, unknown> = {}) {
  return {
    hash: 'INDEXED_TRANSACTION_HASH',
    height: 42,
    txIndex: 0,
    code: 0,
    events: [],
    rawLog: '',
    tx: TxRaw.encode(createSignedTransaction('123')).finish(),
    msgResponses: [],
    gasUsed: BigInt(90_000),
    gasWanted: BigInt(200_000),
    ...overrides,
  }
}

/** Runs `operation` with `StargateClient.connect` stubbed to return `client`. */
async function withStubbedClient<T>(
  client: Record<string, unknown>,
  operation: () => Promise<T>
): Promise<T> {
  const connect = vi
    .spyOn(StargateClient, 'connect')
    .mockResolvedValue(client as never)

  try {
    return await operation()
  } finally {
    connect.mockRestore()
  }
}

/**
 * Runs `operation` with `SigningStargateClient.connectWithSigner` stubbed to
 * return `client`, so signing paths can be inspected without a chain.
 */
async function withStubbedSigningClient<T>(
  client: Record<string, unknown>,
  operation: (connectWithSigner: MockInstance) => Promise<T>
): Promise<T> {
  const connectWithSigner = vi
    .spyOn(SigningStargateClient, 'connectWithSigner')
    .mockResolvedValue(client as never)

  try {
    return await operation(connectWithSigner)
  } finally {
    connectWithSigner.mockRestore()
  }
}

describe('WalletAccountCosmos', () => {
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

  describe('create', () => {
    it('should throw if the seed phrase is invalid', async () => {
      await expect(
        WalletAccountCosmos.create(INVALID_MNEMONIC, "0'/0/0", {})
      ).rejects.toThrow('The seed phrase is invalid.')
    })

    it('should throw if the path is invalid', async () => {
      await expect(
        WalletAccountCosmos.create(ALICE_MNEMONIC, "a'/b/c", {})
      ).rejects.toThrow()
    })

    it('should successfully initialize with seed bytes', async () => {
      const seedCopy = new Uint8Array(ALICE_SEED)
      const testAccount = await WalletAccountCosmos.create(seedCopy, "0'/0/0", {
        addressPrefix: 'wdk',
      })

      const address = await testAccount.getAddress()
      expect(address).toBe(ALICE_ADDRESS)

      testAccount.dispose()
    })
  })

  describe('getAddress', () => {
    it('should return the correct address for Alice', async () => {
      const address = await aliceAccount.getAddress()

      expect(address).toBe(ALICE_ADDRESS)
    })

    it('should return the correct address for Bob', async () => {
      const address = await bobAccount.getAddress()

      expect(address).toBe(BOB_ADDRESS)
    })
  })

  describe('index', () => {
    it('should return the derivation path index', async () => {
      const account0 = await aliceWallet.getAccount(0)
      const account5 = await aliceWallet.getAccount(5)

      expect(account0.index).toBe(0)
      expect(account5.index).toBe(5)
    })
  })

  describe('path', () => {
    it('should return the full derivation path', async () => {
      const account0 = await aliceWallet.getAccount(0)

      expect(account0.path).toBe("m/44'/118'/0'/0/0")
    })
  })

  describe('keyPair', () => {
    it("should return the account's key pair", () => {
      const keyPair = aliceAccount.keyPair

      expect(keyPair.privateKey).toBeDefined()
      expect(keyPair.publicKey).toBeDefined()
    })

    it('account should have same public key when recreated using private key', async () => {
      const keyPair = aliceAccount.keyPair

      const newWallet = await DirectSecp256k1Wallet.fromKey(
        keyPair.privateKey!,
        'wdk'
      )

      const newAccount = await newWallet.getAccounts()
      const newAddress = newAccount[0].address

      expect(newAddress).toBe(ALICE_ADDRESS)
    })
  })

  describe('sign and verify', () => {
    it('should sign and verify a message', async () => {
      const message = 'hello cosmos'
      const signature = await aliceAccount.sign(message)
      const stdSignature = JSON.parse(signature)

      expect(stdSignature.pub_key).toBeDefined()
      expect(stdSignature.signature).toBeTypeOf('string')
      await expect(aliceAccount.verify(message, signature)).resolves.toBe(true)
    })

    it('should reject a signature for a different message', async () => {
      const signature = await aliceAccount.sign('hello cosmos')

      await expect(
        aliceAccount.verify('hello different cosmos', signature)
      ).resolves.toBe(false)
    })

    it('should reject malformed signatures', async () => {
      await expect(
        aliceAccount.verify('hello cosmos', 'not-json')
      ).resolves.toBe(false)
    })

    it("should reject another account's signature", async () => {
      const signature = await bobAccount.sign('hello cosmos')

      await expect(aliceAccount.verify('hello cosmos', signature)).resolves.toBe(
        false
      )
    })
  })

  describe('getBalance', () => {
    it('should throw if RPC endpoint is not configured', async () => {
      const accountWithoutRpc = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        { addressPrefix: 'wdk' }
      )

      await expect(accountWithoutRpc.getBalance()).rejects.toThrow(
        'The wallet must be configured with an RPC endpoint.'
      )

      accountWithoutRpc.dispose()
    })
  })

  describe('getTokenBalance', () => {
    it('should throw if RPC endpoint is not configured', async () => {
      const accountWithoutRpc = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        { addressPrefix: 'wdk' }
      )

      await expect(accountWithoutRpc.getTokenBalance('stake')).rejects.toThrow(
        'The wallet must be configured with an RPC endpoint.'
      )

      accountWithoutRpc.dispose()
    })
  })

  describe('getTokenBalances', () => {
    it('should throw if RPC endpoint is not configured', async () => {
      const accountWithoutRpc = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        { addressPrefix: 'wdk' }
      )

      await expect(
        accountWithoutRpc.getTokenBalances(['stake'])
      ).rejects.toThrow('The wallet must be configured with an RPC endpoint.')

      accountWithoutRpc.dispose()
    })
  })

  describe('quoteTransfer', () => {
    it('should return estimated fee', async () => {
      const quote = await aliceAccount.quoteTransfer({
        token: 'stake',
        recipient: BOB_ADDRESS,
        amount: 1000,
      })

      const expectedFee = calculateFeeAmountFromGasPrice(
        DEFAULT_TEST_GAS_PRICE_AMOUNT,
        DEFAULT_TRANSFER_GAS_LIMIT
      )

      expect(expectedFee).toBeDefined()
      expect(quote.fee).toBe(expectedFee)
    })
  })

  describe('quoteSendTransaction', () => {
    it('should quote the fee encoded in a signed transaction', async () => {
      const quote = await aliceAccount.quoteSendTransaction(
        createSignedTransaction('123')
      )

      expect(quote.fee).toBe(BigInt(123))
    })

    it('should enforce transactionMaxFee for unsigned transactions', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        transactionMaxFee: 1,
      })
      const account = await wallet.getAccount(0)

      await expect(
        account.quoteSendTransaction({
          to: BOB_ADDRESS,
          value: 1000,
        })
      ).rejects.toThrow('Exceeded maximum fee cost for transaction operation.')

      wallet.dispose()
    })

    it('should broadcast a signed transaction', async () => {
      const broadcastTx = vi.fn().mockResolvedValue({
        transactionHash: 'SIGNED_TRANSACTION_HASH',
      })

      const result = await withStubbedClient({ broadcastTx }, () =>
        aliceAccount.sendTransaction(createSignedTransaction('123'))
      )

      expect(result).toEqual({
        hash: 'SIGNED_TRANSACTION_HASH',
        fee: BigInt(123),
      })
      expect(broadcastTx).toHaveBeenCalledOnce()
    })

    it('should enforce transactionMaxFee before broadcasting a signed transaction', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        transactionMaxFee: 100,
      })
      const account = await wallet.getAccount(0)

      await expect(
        account.sendTransaction(createSignedTransaction('123'))
      ).rejects.toThrow('Exceeded maximum fee cost for transaction operation.')

      wallet.dispose()
    })
  })

  describe('transfer', () => {
    it('should throw if RPC endpoint is not configured', async () => {
      const accountWithoutRpc = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        { addressPrefix: 'wdk' }
      )

      await expect(
        accountWithoutRpc.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS,
          amount: 1000,
        })
      ).rejects.toThrow(
        'The wallet must be configured with an RPC endpoint to transfer tokens.'
      )

      accountWithoutRpc.dispose()
    })

    it('should throw if fee exceeds transferMaxFee', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        transferMaxFee: 1, // Very low limit
      })
      const account = await wallet.getAccount(0)

      await expect(
        account.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS,
          amount: 1000,
        })
      ).rejects.toThrow('Exceeded maximum fee cost')

      wallet.dispose()
    })

    it('should pass a caller-supplied memo through the same-prefix branch', async () => {
      const sendTokens = vi.fn().mockResolvedValue({ transactionHash: 'HASH' })

      await withStubbedSigningClient({ sendTokens }, () =>
        aliceAccount.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS,
          amount: 1000,
          memo: CUSTOM_MEMO,
        })
      )

      expect(sendTokens).toHaveBeenCalledWith(
        ALICE_ADDRESS,
        BOB_ADDRESS,
        [{ denom: 'stake', amount: '1000' }],
        expect.anything(),
        CUSTOM_MEMO
      )
    })

    it('should default the memo when the same-prefix branch gets none', async () => {
      const sendTokens = vi.fn().mockResolvedValue({ transactionHash: 'HASH' })

      await withStubbedSigningClient({ sendTokens }, () =>
        aliceAccount.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS,
          amount: 1000,
        })
      )

      expect(sendTokens.mock.calls[0][4]).toBe('Transfer via WDK')
    })

    it('should pass a caller-supplied memo through the IBC branch', async () => {
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ transactionHash: 'HASH' })

      await withStubbedSigningClient({ signAndBroadcast }, () =>
        aliceAccount.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS_CHAIN_2,
          amount: 1000,
          memo: CUSTOM_MEMO,
        })
      )

      const [, messages, , txMemo] = signAndBroadcast.mock.calls[0]

      // The memo has to reach both the MsgTransfer payload (where the
      // destination chain reads it) and the transaction itself.
      expect(messages[0].value.memo).toBe(CUSTOM_MEMO)
      expect(txMemo).toBe(CUSTOM_MEMO)
    })

    it('should default the memo when the IBC branch gets none', async () => {
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ transactionHash: 'HASH' })

      await withStubbedSigningClient({ signAndBroadcast }, () =>
        aliceAccount.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS_CHAIN_2,
          amount: 1000,
        })
      )

      const [, messages, , txMemo] = signAndBroadcast.mock.calls[0]

      expect(messages[0].value.memo).toBe('Transfer via WDK (IBC)')
      expect(txMemo).toBe('Transfer via WDK (IBC)')
    })
  })

  describe('getTransactionReceipt', () => {
    it('should return null when the transaction is not in a block yet', async () => {
      const getTx = vi.fn().mockResolvedValue(null)

      const receipt = await withStubbedClient({ getTx }, () =>
        aliceAccount.getTransactionReceipt('UNKNOWN_HASH')
      )

      expect(receipt).toBeNull()
      expect(getTx).toHaveBeenCalledWith('UNKNOWN_HASH')
    })
  })

  describe('getTransaction', () => {
    it('should map an included transaction to a final receipt', async () => {
      const getTx = vi.fn().mockResolvedValue(createIndexedTx())

      const receipt = await withStubbedClient({ getTx }, () =>
        aliceAccount.getTransaction('INDEXED_TRANSACTION_HASH')
      )

      expect(receipt).toMatchObject({
        hash: 'INDEXED_TRANSACTION_HASH',
        finality: 'final',
        success: true,
        block: 42,
        fee: BigInt(123),
      })
    })

    it('should report a non-zero ABCI code as an unsuccessful transaction', async () => {
      const getTx = vi.fn().mockResolvedValue(createIndexedTx({ code: 5 }))

      const receipt = await withStubbedClient({ getTx }, () =>
        aliceAccount.getTransaction('INDEXED_TRANSACTION_HASH')
      )

      expect(receipt.success).toBe(false)
      expect(receipt.finality).toBe('final')
    })

    it('should throw NoSuchElementError when the transaction is unknown', async () => {
      const getTx = vi.fn().mockResolvedValue(null)

      await withStubbedClient({ getTx }, async () => {
        await expect(
          aliceAccount.getTransaction('UNKNOWN_HASH')
        ).rejects.toThrow(NoSuchElementError)
      })
    })
  })

  describe('toReadOnlyAccount', () => {
    it('should return a read-only account exposing no key material', async () => {
      const readOnlyAccount = await aliceAccount.toReadOnlyAccount()

      expect(readOnlyAccount).toBeInstanceOf(WalletAccountCosmosReadOnly)
      expect(readOnlyAccount).not.toBeInstanceOf(WalletAccountCosmos)
      expect(await readOnlyAccount.getAddress()).toBe(ALICE_ADDRESS)
      expect('keyPair' in readOnlyAccount).toBe(false)
      expect('_signer' in readOnlyAccount).toBe(false)
    })

    it('should verify signatures from the account it was derived from', async () => {
      const signature = await aliceAccount.sign('hello cosmos')
      const readOnlyAccount = await aliceAccount.toReadOnlyAccount()

      await expect(
        readOnlyAccount.verify('hello cosmos', signature)
      ).resolves.toBe(true)
      await expect(
        readOnlyAccount.verify('hello different cosmos', signature)
      ).resolves.toBe(false)
    })

    it("should reject another account's signature", async () => {
      const signature = await bobAccount.sign('hello cosmos')
      const readOnlyAccount = await aliceAccount.toReadOnlyAccount()

      await expect(
        readOnlyAccount.verify('hello cosmos', signature)
      ).resolves.toBe(false)
    })

    it('should outlive the disposal of the account it came from', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, IBC_CHAIN_1_CONFIG)
      const readOnlyAccount = await (
        await wallet.getAccount(0)
      ).toReadOnlyAccount()

      wallet.dispose()

      expect(readOnlyAccount.isDisposed).toBe(false)
      expect(await readOnlyAccount.getAddress()).toBe(ALICE_ADDRESS)
    })
  })

  describe('error types', () => {
    it('should throw ProviderRequiredError without an RPC endpoint', async () => {
      const accountWithoutRpc = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        { addressPrefix: 'wdk' }
      )

      await expect(accountWithoutRpc.getBalance()).rejects.toThrow(
        ProviderRequiredError
      )

      accountWithoutRpc.dispose()
    })

    it('should throw MaximumFeeExceededError without broadcasting a transfer', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        transferMaxFee: 1,
      })
      const account = await wallet.getAccount(0)
      const connectWithSigner = vi.spyOn(
        SigningStargateClient,
        'connectWithSigner'
      )

      try {
        await expect(
          account.transfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
          })
        ).rejects.toThrow(MaximumFeeExceededError)

        expect(connectWithSigner).not.toHaveBeenCalled()
      } finally {
        connectWithSigner.mockRestore()
        wallet.dispose()
      }
    })

    it('should throw MaximumFeeExceededError without broadcasting a transaction', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        transactionMaxFee: 100,
      })
      const account = await wallet.getAccount(0)
      const connect = vi.spyOn(StargateClient, 'connect')

      try {
        await expect(
          account.sendTransaction(createSignedTransaction('123'))
        ).rejects.toThrow(MaximumFeeExceededError)

        expect(connect).not.toHaveBeenCalled()
      } finally {
        connect.mockRestore()
        wallet.dispose()
      }
    })
  })

  describe('dispose', () => {
    it('should mark the account as disposed', async () => {
      const testAccount = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        {}
      )

      expect(testAccount.isDisposed).toBe(false)

      testAccount.dispose()

      expect(testAccount.isDisposed).toBe(true)
    })

    it('should throw when trying to use a disposed account', async () => {
      const testAccount = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        {}
      )
      testAccount.dispose()

      await expect(testAccount.getAddress()).rejects.toThrow(
        'Cannot use disposed wallet account'
      )
    })

    it('should be idempotent (calling dispose multiple times is safe)', async () => {
      const testAccount = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        {}
      )

      testAccount.dispose()
      testAccount.dispose()
      testAccount.dispose()

      expect(testAccount.isDisposed).toBe(true)
    })
  })
})
