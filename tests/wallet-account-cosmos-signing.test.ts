import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'
import { Secp256k1, Secp256k1Signature, sha256 } from '@cosmjs/crypto'
import { fromBase64, toBase64 } from '@cosmjs/encoding'
import { makeSignBytes, makeSignDoc as makeDirectSignDoc } from '@cosmjs/proto-signing'
import { AuthInfo, TxBody } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { WalletAccountCosmos } from '../index.js'

// Alice mnemonic from Ignite output (for local/dev use only)
const ALICE_MNEMONIC =
  'car knock victory oval pulse practice draw bulb fiction bulb involve dumb stairs discover update spatial blouse perfect match property wheat defense host fortune'

const ALICE_ADDRESS = 'wdk1jvjy9gpu95k9uaez7ncydkaurcqpcpye7znlz5'
const BOB_ADDRESS = 'wdk1m9l358xunhhwds0568za49mzhvuxx9uxv52xme'

// No RPC endpoints: every method exercised here is offline.
const OFFLINE_CONFIG = { addressPrefix: 'wdk' }

const CHAIN_ID = 'wdkdev-1'

const BODY_BYTES = toBase64(
  TxBody.encode(TxBody.fromPartial({ memo: 'offline' })).finish()
)

const AUTH_INFO_BYTES = toBase64(
  AuthInfo.encode(
    AuthInfo.fromPartial({
      signerInfos: [],
      fee: {
        amount: [{ denom: 'stake', amount: '500' }],
        gasLimit: BigInt(200000),
        payer: '',
        granter: '',
      },
    })
  ).finish()
)

function buildDirectSignDoc() {
  return {
    chainId: CHAIN_ID,
    accountNumber: '12',
    bodyBytes: BODY_BYTES,
    authInfoBytes: AUTH_INFO_BYTES,
  }
}

function buildAminoSignDoc() {
  return makeSignDoc(
    [
      {
        type: 'cosmos-sdk/MsgSend',
        value: {
          from_address: ALICE_ADDRESS,
          to_address: BOB_ADDRESS,
          amount: [{ denom: 'stake', amount: '1000' }],
        },
      },
    ],
    { amount: [{ denom: 'stake', amount: '500' }], gas: '200000' },
    CHAIN_ID,
    'offline',
    12,
    3
  )
}

/** Verifies a Cosmos `StdSignature` against a hash and the account's public key. */
async function verifySignature(
  account: WalletAccountCosmos,
  signature: string,
  messageHash: Uint8Array
): Promise<boolean> {
  const publicKey = fromBase64(await account.getPublicKey())

  return Secp256k1.verifySignature(
    Secp256k1Signature.fromFixedLength(fromBase64(signature)),
    messageHash,
    publicKey
  )
}

describe('WalletAccountCosmos direct and amino signing', () => {
  let account: WalletAccountCosmos

  beforeEach(async () => {
    account = await WalletAccountCosmos.create(
      ALICE_MNEMONIC,
      "0'/0/0",
      OFFLINE_CONFIG
    )
  })

  afterEach(() => {
    account.dispose()
  })

  describe('getPublicKey', () => {
    it('should return the base64-encoded compressed public key', async () => {
      const publicKey = await account.getPublicKey()

      expect(publicKey).toBeTypeOf('string')
      expect(fromBase64(publicKey)).toHaveLength(33)
      expect(publicKey).toBe(toBase64(account.keyPair.publicKey))
    })
  })

  describe('signAmino', () => {
    it('should produce a signature over the serialized sign doc', async () => {
      const signDoc = buildAminoSignDoc()

      const { signature, signed } = await account.signAmino({
        signerAddress: ALICE_ADDRESS,
        signDoc,
      })

      expect(signed).toEqual(signDoc)
      expect(signature.pub_key.value).toBe(await account.getPublicKey())
      await expect(
        verifySignature(
          account,
          signature.signature,
          sha256(serializeSignDoc(signed))
        )
      ).resolves.toBe(true)
    })

    it('should return JSON-safe values only', async () => {
      const result = await account.signAmino({
        signerAddress: ALICE_ADDRESS,
        signDoc: buildAminoSignDoc(),
      })

      expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    })

    it('should throw if the signer address does not match the account', async () => {
      await expect(
        account.signAmino({
          signerAddress: BOB_ADDRESS,
          signDoc: buildAminoSignDoc(),
        })
      ).rejects.toThrow(
        `Invalid signAmino params: signerAddress ${BOB_ADDRESS} does not belong to this account.`
      )
    })

    it('should throw if the sign doc is missing', async () => {
      await expect(
        account.signAmino({ signerAddress: ALICE_ADDRESS } as never)
      ).rejects.toThrow('Invalid signAmino params: signDoc must be an object.')
    })

    it('should throw if numeric fields are not decimal strings', async () => {
      await expect(
        account.signAmino({
          signerAddress: ALICE_ADDRESS,
          signDoc: { ...buildAminoSignDoc(), account_number: 12 } as never,
        })
      ).rejects.toThrow(
        'Invalid signAmino params: signDoc.account_number must be a decimal string.'
      )

      await expect(
        account.signAmino({
          signerAddress: ALICE_ADDRESS,
          signDoc: { ...buildAminoSignDoc(), sequence: '' } as never,
        })
      ).rejects.toThrow(
        'Invalid signAmino params: signDoc.sequence must be a decimal string.'
      )
    })

    it('should throw if the fee is malformed', async () => {
      await expect(
        account.signAmino({
          signerAddress: ALICE_ADDRESS,
          signDoc: {
            ...buildAminoSignDoc(),
            fee: { amount: [{ denom: 'stake', amount: 500 }], gas: '200000' },
          } as never,
        })
      ).rejects.toThrow(
        'Invalid signAmino params: signDoc.fee.amount must be an array of { denom, amount } coins.'
      )
    })

    it('should throw if the messages are malformed', async () => {
      await expect(
        account.signAmino({
          signerAddress: ALICE_ADDRESS,
          signDoc: { ...buildAminoSignDoc(), msgs: [{ type: 'MsgSend' }] } as never,
        })
      ).rejects.toThrow(
        'Invalid signAmino params: signDoc.msgs must be an array of { type, value } messages.'
      )
    })
  })

  describe('signDirect', () => {
    it('should produce a signature over the proto sign doc', async () => {
      const { signature, signed } = await account.signDirect({
        signerAddress: ALICE_ADDRESS,
        signDoc: buildDirectSignDoc(),
      })

      const signBytes = makeSignBytes(
        makeDirectSignDoc(
          fromBase64(signed.bodyBytes),
          fromBase64(signed.authInfoBytes),
          signed.chainId,
          Number(signed.accountNumber)
        )
      )

      await expect(
        verifySignature(account, signature.signature, sha256(signBytes))
      ).resolves.toBe(true)
    })

    it('should round-trip the sign doc as strings', async () => {
      const signDoc = buildDirectSignDoc()

      const { signed } = await account.signDirect({
        signerAddress: ALICE_ADDRESS,
        signDoc,
      })

      expect(signed).toEqual(signDoc)
      expect(signed.accountNumber).toBeTypeOf('string')
    })

    it('should return JSON-safe values only', async () => {
      const result = await account.signDirect({
        signerAddress: ALICE_ADDRESS,
        signDoc: buildDirectSignDoc(),
      })

      expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    })

    it('should throw if the signer address does not match the account', async () => {
      await expect(
        account.signDirect({
          signerAddress: BOB_ADDRESS,
          signDoc: buildDirectSignDoc(),
        })
      ).rejects.toThrow(
        `Invalid signDirect params: signerAddress ${BOB_ADDRESS} does not belong to this account.`
      )
    })

    it('should throw if the signer address is missing', async () => {
      await expect(
        account.signDirect({ signDoc: buildDirectSignDoc() } as never)
      ).rejects.toThrow(
        'Invalid signDirect params: signerAddress must be a non-empty string.'
      )
    })

    it('should throw if byte fields are not base64', async () => {
      await expect(
        account.signDirect({
          signerAddress: ALICE_ADDRESS,
          signDoc: { ...buildDirectSignDoc(), bodyBytes: '0xdeadbeef' },
        })
      ).rejects.toThrow(
        'Invalid signDirect params: signDoc.bodyBytes is not valid base64.'
      )
    })

    it('should reject byte fields that crossed the bridge as typed arrays', async () => {
      await expect(
        account.signDirect({
          signerAddress: ALICE_ADDRESS,
          signDoc: {
            ...buildDirectSignDoc(),
            authInfoBytes: { 0: 10, 1: 20 },
          } as never,
        })
      ).rejects.toThrow(
        'Invalid signDirect params: signDoc.authInfoBytes must be a non-empty base64 string.'
      )
    })

    it('should throw if the account number is not a decimal string', async () => {
      await expect(
        account.signDirect({
          signerAddress: ALICE_ADDRESS,
          signDoc: { ...buildDirectSignDoc(), accountNumber: 12 } as never,
        })
      ).rejects.toThrow(
        'Invalid signDirect params: signDoc.accountNumber must be a decimal string.'
      )
    })
  })
})
