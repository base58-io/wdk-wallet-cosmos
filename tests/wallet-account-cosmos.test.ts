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
  type Mock,
} from 'vitest'
import WalletManagerCosmos, {
  SeedSignerCosmos,
  WalletAccountCosmos,
  WalletAccountCosmosReadOnly,
} from '../index.js'
import {
  DirectSecp256k1Wallet,
  Registry,
  type EncodeObject,
} from '@cosmjs/proto-signing'
import {
  SigningStargateClient,
  StargateClient,
  defaultRegistryTypes,
} from '@cosmjs/stargate'
import { connectComet } from '@cosmjs/tendermint-rpc'
import { ServiceClientImpl } from 'cosmjs-types/cosmos/tx/v1beta1/service'
import {
  DisposalError,
  MaximumFeeExceededError,
  NoSuchElementError,
  ProviderError,
  ProviderRequiredError,
  TransferError,
  TransferErrorReason,
  ValueError,
} from '@tetherto/wdk-wallet'
import {
  AuthInfo,
  Tx,
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

vi.mock('@cosmjs/tendermint-rpc', async importOriginal => ({
  ...(await importOriginal<typeof import('@cosmjs/tendermint-rpc')>()),
  connectComet: vi.fn(),
}))

// A caller-supplied memo, expected to replace the default on transfers.
const CUSTOM_MEMO = 'order-12345'

// 77,777 gas used × the default 1.3 adjustment = 101,110.1, rounded up; the fee
// is that limit × the 0.025stake fixture gas price, rounded up.
const SIMULATED_GAS_USED = 77_777
const SIMULATED_GAS_LIMIT = 101_111
const SIMULATED_FEE = BigInt(2528)

const REGISTRY = new Registry(defaultRegistryTypes)

/**
 * A `simulate` stub reporting `gasUsed`. {@link withStubbedSigningClient}
 * routes the chain's Simulate query to it, with the `SimulateRequest`.
 */
function simulating(gasUsed = SIMULATED_GAS_USED) {
  return vi.fn().mockResolvedValue(gasUsed)
}

/**
 * Asserts that `simulate` received exactly `messages` and `memo`, with a
 * non-zero fee attached.
 */
function expectSimulated(
  simulate: Mock,
  messages: EncodeObject[],
  memo: string
) {
  const tx = Tx.decode(simulate.mock.calls[0][0].txBytes)

  expect(tx.body?.messages).toEqual(
    messages.map(message => REGISTRY.encodeAsAny(message))
  )
  expect(tx.body?.memo).toBe(memo)
  expect(tx.authInfo?.fee?.amount).toEqual([{ denom: 'stake', amount: '1' }])
}

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
 * return `client`, so signing paths can be inspected without a chain. The
 * simulation's Comet connection and sequence lookup are stubbed too, and the
 * chain's Simulate query resolves with the gas used `client.simulate` reports.
 */
async function withStubbedSigningClient<T>(
  { simulate, ...client }: Record<string, unknown> & { simulate?: Mock },
  operation: () => Promise<T>
): Promise<T> {
  const connectWithSigner = vi
    .spyOn(SigningStargateClient, 'connectWithSigner')
    .mockResolvedValue(client as never)
  vi.mocked(connectComet).mockResolvedValue({} as never)
  const createClient = vi.spyOn(StargateClient, 'create').mockReturnValue({
    getSequence: vi.fn().mockResolvedValue({ accountNumber: 0, sequence: 0 }),
  } as never)
  const simulateQuery = vi
    .spyOn(ServiceClientImpl.prototype, 'Simulate')
    .mockImplementation(async request => ({
      gasInfo: {
        gasWanted: BigInt(0),
        gasUsed: BigInt(await simulate?.(request)),
      },
    }))

  try {
    return await operation()
  } finally {
    connectWithSigner.mockRestore()
    vi.mocked(connectComet).mockReset()
    createClient.mockRestore()
    simulateQuery.mockRestore()
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

  describe('path', () => {
    it('should return the full derivation path', async () => {
      const account0 = await aliceWallet.getAccount(0)
      const account5 = await aliceWallet.getAccount(5)

      expect(account0.path).toBe("m/44'/118'/0'/0/0")
      expect(account5.path).toBe("m/44'/118'/0'/0/5")
    })
  })

  describe('keyPair', () => {
    it("should return the account's key pair", () => {
      const keyPair = aliceAccount.keyPair!

      expect(keyPair.privateKey).toBeDefined()
      expect(keyPair.publicKey).toBeDefined()
    })

    it('account should have same public key when recreated using private key', async () => {
      const keyPair = aliceAccount.keyPair!

      const newWallet = await DirectSecp256k1Wallet.fromKey(
        keyPair.privateKey!,
        'wdk'
      )

      const newAccount = await newWallet.getAccounts()
      const newAddress = newAccount[0].address

      expect(newAddress).toBe(ALICE_ADDRESS)
    })

    it('should read the public key from the signer when it exposes no key pair', async () => {
      const wallet = await DirectSecp256k1Wallet.fromKey(
        aliceAccount.keyPair!.privateKey!,
        'wdk'
      )
      const signer = {
        keyPair: null,
        getAddress: async () => ALICE_ADDRESS,
        getAccounts: () => wallet.getAccounts(),
      }
      const account = await WalletAccountCosmos.fromSigner(
        signer as never,
        IBC_CHAIN_1_CONFIG
      )

      expect(await account.getPublicKey()).toBe(
        await aliceAccount.getPublicKey()
      )

      const quote = await withStubbedSigningClient(
        { simulate: simulating() },
        () =>
          account.quoteTransfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
          })
      )

      expect(quote.fee).toBe(SIMULATED_FEE)
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
    it('should quote the fee at the simulated gas limit', async () => {
      const simulate = simulating()

      const quote = await withStubbedSigningClient({ simulate }, () =>
        aliceAccount.quoteTransfer({
          token: 'stake',
          recipient: BOB_ADDRESS,
          amount: 1000,
        })
      )

      expect(quote.fee).toBe(SIMULATED_FEE)
      expect(simulate).toHaveBeenCalledOnce()
    })

    it('should quote a read-only account at the fixed gas limit without simulating', async () => {
      const readOnlyAccount = WalletAccountCosmosReadOnly.fromAddress(
        ALICE_ADDRESS,
        IBC_CHAIN_1_CONFIG
      )

      const quote = await readOnlyAccount.quoteTransfer({
        token: 'stake',
        recipient: BOB_ADDRESS,
        amount: 1000,
      })

      expect(quote.fee).toBe(
        calculateFeeAmountFromGasPrice(
          DEFAULT_TEST_GAS_PRICE_AMOUNT,
          DEFAULT_TRANSFER_GAS_LIMIT
        )
      )
      expect(connectComet).not.toHaveBeenCalled()
    })
  })

  describe('gasAdjustment', () => {
    it('should scale the simulated gas by the configured adjustment', async () => {
      const account = await WalletAccountCosmos.create(ALICE_MNEMONIC, "0'/0/0", {
        ...IBC_CHAIN_1_CONFIG,
        gasAdjustment: 2,
      })

      const quote = await withStubbedSigningClient(
        { simulate: simulating(100_000) },
        () =>
          account.quoteTransfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
          })
      )

      // 100,000 × 2 = 200,000 gas at 0.025stake.
      expect(quote.fee).toBe(BigInt(5000))

      account.dispose()
    })

    it('should reject a gasAdjustment that is not a positive finite number', () => {
      for (const gasAdjustment of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() =>
          WalletAccountCosmosReadOnly.fromAddress(ALICE_ADDRESS, {
            ...IBC_CHAIN_1_CONFIG,
            gasAdjustment,
          })
        ).toThrow(ValueError)
      }
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

      await withStubbedSigningClient({ simulate: simulating() }, async () => {
        await expect(
          account.quoteSendTransaction({
            to: BOB_ADDRESS,
            value: 1000,
          })
        ).rejects.toThrow('Exceeded maximum fee cost for transaction operation.')
      })

      wallet.dispose()
    })

    it('should sign an unsigned transaction at the simulated gas limit', async () => {
      const simulate = simulating()
      const sign = vi.fn().mockResolvedValue(createSignedTransaction('0'))

      await withStubbedSigningClient({ simulate, sign }, () =>
        aliceAccount.signTransaction({ to: BOB_ADDRESS, value: 1000 })
      )

      const [, messages, fee, memo] = sign.mock.calls[0]

      expectSimulated(simulate, messages, memo)
      expect(messages[0].typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend')
      expect(fee).toEqual({
        amount: [{ denom: 'stake', amount: SIMULATED_FEE.toString() }],
        gas: String(SIMULATED_GAS_LIMIT),
      })
    })

    it('should broadcast a signed transaction', async () => {
      const broadcastTx = vi.fn().mockResolvedValue({
        code: 0,
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

    it('should throw when a broadcast transaction fails on chain', async () => {
      const broadcastTx = vi.fn().mockResolvedValue({
        code: 11,
        transactionHash: 'SIGNED_TRANSACTION_HASH',
        rawLog: 'out of gas in location: WritePerByte',
      })

      await expect(
        withStubbedClient({ broadcastTx }, () =>
          aliceAccount.sendTransaction(createSignedTransaction('123'))
        )
      ).rejects.toThrow(
        'The transaction SIGNED_TRANSACTION_HASH failed on chain with code 11: out of gas in location: WritePerByte'
      )
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

    it('should sign the simulated messages at the simulated gas limit', async () => {
      const simulate = simulating()
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      const result = await withStubbedSigningClient(
        { simulate, signAndBroadcast },
        () =>
          aliceAccount.transfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
          })
      )

      const [, messages, fee, memo] = signAndBroadcast.mock.calls[0]

      expectSimulated(simulate, messages, memo)
      expect(messages).toEqual([
        {
          typeUrl: '/cosmos.bank.v1beta1.MsgSend',
          value: {
            fromAddress: ALICE_ADDRESS,
            toAddress: BOB_ADDRESS,
            amount: [{ denom: 'stake', amount: '1000' }],
          },
        },
      ])
      expect(fee).toEqual({
        amount: [{ denom: 'stake', amount: SIMULATED_FEE.toString() }],
        gas: String(SIMULATED_GAS_LIMIT),
      })
      expect(result).toEqual({ hash: 'HASH', fee: SIMULATED_FEE })
    })

    it('should throw TransferError when the transfer fails on chain for insufficient funds', async () => {
      const signAndBroadcast = vi.fn().mockResolvedValue({
        code: 5,
        transactionHash: 'HASH',
        rawLog: 'spendable balance 10stake is smaller than 1000stake: insufficient funds',
      })

      const transfer = withStubbedSigningClient(
        { simulate: simulating(), signAndBroadcast },
        () =>
          aliceAccount.transfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
          })
      )

      await expect(transfer).rejects.toThrow(TransferError)
      await expect(transfer).rejects.toMatchObject({
        reason: TransferErrorReason.INSUFFICIENT_BALANCE,
      })
    })

    it('should simulate the IBC MsgTransfer it signs', async () => {
      const simulate = simulating()
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      await withStubbedSigningClient({ simulate, signAndBroadcast }, () =>
        aliceAccount.transfer({
          token: 'stake',
          recipient: BOB_ADDRESS_CHAIN_2,
          amount: 1000,
        })
      )

      const [, messages, , memo] = signAndBroadcast.mock.calls[0]

      expectSimulated(simulate, messages, memo)
      expect(messages[0].typeUrl).toBe(
        '/ibc.applications.transfer.v1.MsgTransfer'
      )
    })

    it('should enforce transferMaxFee against the simulated fee', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        transferMaxFee: 2000,
      })
      const account = await wallet.getAccount(0)
      const options = { token: 'stake', recipient: BOB_ADDRESS, amount: 1000 }
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      try {
        // 50,000 gas used prices at 1,625stake, under the limit.
        await withStubbedSigningClient(
          { simulate: simulating(50_000), signAndBroadcast },
          () => account.transfer(options)
        )
        expect(signAndBroadcast).toHaveBeenCalledOnce()

        // 100,000 gas used prices at 3,250stake, over it.
        await withStubbedSigningClient(
          { simulate: simulating(100_000), signAndBroadcast },
          async () => {
            await expect(account.transfer(options)).rejects.toThrow(
              MaximumFeeExceededError
            )
          }
        )
        expect(signAndBroadcast).toHaveBeenCalledOnce()
      } finally {
        wallet.dispose()
      }
    })

    it('should throw a rejected simulation at once, without retrying or broadcasting', async () => {
      const abciError = new Error(
        'Query failed with (5): rpc error: code = Unknown desc = 1000stake is smaller than 99999999stake: insufficient funds'
      )
      const simulate = vi.fn().mockRejectedValue(abciError)
      const signAndBroadcast = vi.fn()

      await withStubbedSigningClient({ simulate, signAndBroadcast }, async () => {
        await expect(
          aliceAccount.transfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 99_999_999,
          })
        ).rejects.toBe(abciError)
      })

      expect(simulate).toHaveBeenCalledOnce()
      expect(signAndBroadcast).not.toHaveBeenCalled()
    })

    it('should throw ProviderError when every endpoint fails to simulate', async () => {
      const wallet = new WalletManagerCosmos(ALICE_MNEMONIC, {
        ...IBC_CHAIN_1_CONFIG,
        rpcEndpoints: ['http://rpc-1.invalid', 'http://rpc-2.invalid'],
        retryCount: 0,
      })
      const account = await wallet.getAccount(0)
      const simulate = vi.fn().mockRejectedValue(new Error('fetch failed'))

      try {
        await withStubbedSigningClient({ simulate }, async () => {
          await expect(
            account.quoteTransfer({
              token: 'stake',
              recipient: BOB_ADDRESS,
              amount: 1000,
            })
          ).rejects.toThrow(ProviderError)
        })

        expect(simulate).toHaveBeenCalledTimes(2)
      } finally {
        wallet.dispose()
      }
    })

    it('should pass a caller-supplied memo through the same-prefix branch', async () => {
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      await withStubbedSigningClient(
        { simulate: simulating(), signAndBroadcast },
        () =>
          aliceAccount.transfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
            memo: CUSTOM_MEMO,
          })
      )

      expect(signAndBroadcast.mock.calls[0][3]).toBe(CUSTOM_MEMO)
    })

    it('should default the memo when the same-prefix branch gets none', async () => {
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      await withStubbedSigningClient(
        { simulate: simulating(), signAndBroadcast },
        () =>
          aliceAccount.transfer({
            token: 'stake',
            recipient: BOB_ADDRESS,
            amount: 1000,
          })
      )

      expect(signAndBroadcast.mock.calls[0][3]).toBe('Transfer via WDK')
    })

    it('should pass a caller-supplied memo through the IBC branch', async () => {
      const signAndBroadcast = vi
        .fn()
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      await withStubbedSigningClient(
        { simulate: simulating(), signAndBroadcast },
        () =>
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
        .mockResolvedValue({ code: 0, transactionHash: 'HASH' })

      await withStubbedSigningClient(
        { simulate: simulating(), signAndBroadcast },
        () =>
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

      expect(readOnlyAccount.disposed).toBe(false)
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

      expect(testAccount.disposed).toBe(false)

      testAccount.dispose()

      expect(testAccount.disposed).toBe(true)
    })

    it('should throw when trying to use a disposed account', async () => {
      const testAccount = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        {}
      )
      testAccount.dispose()

      await expect(testAccount.getAddress()).rejects.toThrow(DisposalError)
    })

    it('should dispose only signers it owns', async () => {
      const ownedAccount = await WalletAccountCosmos.create(
        ALICE_MNEMONIC,
        "0'/0/0",
        {}
      )
      const ownedSigner = ownedAccount['_signer']
      const signer = new SeedSignerCosmos(ALICE_MNEMONIC)
      const account = await WalletAccountCosmos.fromSigner(signer)

      ownedAccount.dispose()
      account.dispose()

      expect(ownedSigner.disposed).toBe(true)
      expect(account.disposed).toBe(true)
      expect(signer.disposed).toBe(false)

      signer.dispose()
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

      expect(testAccount.disposed).toBe(true)
    })
  })
})
