// Hand-rolled protobuf encoders/decoders for THORChain's
// `types.MsgDeposit` and its constituent `Asset` / `Coin` messages.
//
// THORChain and MAYAChain (the latter forked from THORChain) use the
// same proto schema for swap-deposit transactions — only the chain ID
// and bech32 prefix differ at runtime — so a single set of generated
// types serves both networks.
//
// proto definitions (canonical, copied from mayanode/thornode source):
//
//   message Asset {
//     string chain = 1;
//     string symbol = 2;
//     string ticker = 3;
//     bool synth = 4;
//     bool trade = 5;
//     bool secured = 6;
//   }
//
//   message Coin {
//     Asset asset = 1;
//     string amount = 2;
//     int64 decimals = 3;
//   }
//
//   message MsgDeposit {
//     repeated Coin coins = 1;
//     string memo = 2;
//     bytes signer = 3;
//   }
//
// We register `MsgDeposit` under typeUrl `/types.MsgDeposit` — the same
// URL THORChain and MAYAChain nodes recognise.

// @ts-nocheck — hand-rolled proto encoder/decoder; mirrors generated-code
// shape from `protoc-gen-ts_proto` and is not worth strict-typing.

'use strict'

// `protobufjs/minimal.js` is CommonJS (`module.exports = require(...)`) so
// Node's strict ESM loader can't pick out named exports from it. Default
// import + destructure is the portable form that works in both ESM and CJS
// runtimes; vitest is more permissive than Node so the named-import form
// passed unit tests but failed when the published package was imported by
// a real ESM consumer.
import minimal from 'protobufjs/minimal.js'
const { Reader, Writer } = minimal

export const TYPE_URL_MSG_DEPOSIT = '/types.MsgDeposit'

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

function createBaseAsset() {
  return { chain: '', symbol: '', ticker: '', synth: false, trade: false, secured: false }
}

export const Asset = {
  encode(message, writer = Writer.create()) {
    if (message.chain !== '') writer.uint32(10).string(message.chain)
    if (message.symbol !== '') writer.uint32(18).string(message.symbol)
    if (message.ticker !== '') writer.uint32(26).string(message.ticker)
    if (message.synth) writer.uint32(32).bool(message.synth)
    if (message.trade) writer.uint32(40).bool(message.trade)
    if (message.secured) writer.uint32(48).bool(message.secured)
    return writer
  },
  decode(input, length) {
    const reader = input instanceof Reader ? input : Reader.create(input)
    const end = length === undefined ? reader.len : reader.pos + length
    const message = createBaseAsset()
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1: message.chain = reader.string(); break
        case 2: message.symbol = reader.string(); break
        case 3: message.ticker = reader.string(); break
        case 4: message.synth = reader.bool(); break
        case 5: message.trade = reader.bool(); break
        case 6: message.secured = reader.bool(); break
        default: reader.skipType(tag & 7); break
      }
    }
    return message
  },
  fromPartial(o) {
    const m = createBaseAsset()
    if (o.chain !== undefined && o.chain !== null) m.chain = o.chain
    if (o.symbol !== undefined && o.symbol !== null) m.symbol = o.symbol
    if (o.ticker !== undefined && o.ticker !== null) m.ticker = o.ticker
    if (o.synth !== undefined && o.synth !== null) m.synth = o.synth
    if (o.trade !== undefined && o.trade !== null) m.trade = o.trade
    if (o.secured !== undefined && o.secured !== null) m.secured = o.secured
    return m
  },
}

// ---------------------------------------------------------------------------
// Coin
// ---------------------------------------------------------------------------

function createBaseCoin() {
  return { asset: undefined, amount: '', decimals: 0n }
}

export const Coin = {
  encode(message, writer = Writer.create()) {
    if (message.asset !== undefined) {
      Asset.encode(message.asset, writer.uint32(10).fork()).ldelim()
    }
    if (message.amount !== '') writer.uint32(18).string(message.amount)
    if (message.decimals !== undefined && message.decimals !== 0n && message.decimals !== 0) {
      writer.uint32(24).int64(BigInt(message.decimals))
    }
    return writer
  },
  decode(input, length) {
    const reader = input instanceof Reader ? input : Reader.create(input)
    const end = length === undefined ? reader.len : reader.pos + length
    const message = createBaseCoin()
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1: message.asset = Asset.decode(reader, reader.uint32()); break
        case 2: message.amount = reader.string(); break
        case 3: message.decimals = reader.int64(); break
        default: reader.skipType(tag & 7); break
      }
    }
    return message
  },
  fromPartial(o) {
    const m = createBaseCoin()
    if (o.asset !== undefined && o.asset !== null) m.asset = Asset.fromPartial(o.asset)
    if (o.amount !== undefined && o.amount !== null) m.amount = String(o.amount)
    if (o.decimals !== undefined && o.decimals !== null) m.decimals = BigInt(o.decimals)
    return m
  },
}

// ---------------------------------------------------------------------------
// MsgDeposit
// ---------------------------------------------------------------------------

function createBaseMsgDeposit() {
  return { coins: [], memo: '', signer: new Uint8Array() }
}

export const MsgDeposit = {
  encode(message, writer = Writer.create()) {
    for (const c of message.coins ?? []) {
      Coin.encode(c, writer.uint32(10).fork()).ldelim()
    }
    if (message.memo !== '') writer.uint32(18).string(message.memo)
    if (message.signer.length > 0) writer.uint32(26).bytes(message.signer)
    return writer
  },
  decode(input, length) {
    const reader = input instanceof Reader ? input : Reader.create(input)
    const end = length === undefined ? reader.len : reader.pos + length
    const message = createBaseMsgDeposit()
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1: message.coins.push(Coin.decode(reader, reader.uint32())); break
        case 2: message.memo = reader.string(); break
        case 3: message.signer = reader.bytes(); break
        default: reader.skipType(tag & 7); break
      }
    }
    return message
  },
  fromPartial(o) {
    const m = createBaseMsgDeposit()
    if (o.coins) m.coins = o.coins.map(c => Coin.fromPartial(c))
    if (o.memo !== undefined && o.memo !== null) m.memo = o.memo
    if (o.signer !== undefined && o.signer !== null) m.signer = o.signer
    return m
  },
}

// ---------------------------------------------------------------------------
// Asset string parsing
// ---------------------------------------------------------------------------

/**
 * Parse a SwapKit-style asset string (e.g. "THOR.RUNE", "MAYA.CACAO",
 * "BTC.BTC", "ETH.USDC-0xA0b86991…") into an {@link Asset} object suitable
 * for inclusion in a `Coin`. Returns the parsed Asset, or throws if the
 * string can't be recognised as a valid asset reference.
 *
 * For our use case the asset is almost always THOR.RUNE or MAYA.CACAO
 * (because that's what the user is depositing for a swap), but the parser
 * handles any chain/symbol pair so it's reusable for future flows.
 *
 * @param {string} input - SwapKit asset string.
 * @returns {ReturnType<typeof Asset.fromPartial>}
 */
export function parseAssetString(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error(`parseAssetString: expected a non-empty string, got ${input}`)
  }
  const [chain, rest] = input.split('.')
  if (!chain || !rest) {
    throw new Error(`parseAssetString: expected "CHAIN.SYMBOL[-ID]", got ${input}`)
  }
  const dashIdx = rest.indexOf('-')
  const symbol = dashIdx === -1 ? rest : rest.slice(0, dashIdx)
  // Ticker is the symbol stripped of trailing identifier; for simple cases
  // (THOR.RUNE, MAYA.CACAO, BTC.BTC) ticker == symbol. For ERC-20-style
  // (ETH.USDC-0xA0b…) ticker is still "USDC".
  const ticker = symbol
  return Asset.fromPartial({ chain: chain.toUpperCase(), symbol, ticker })
}
