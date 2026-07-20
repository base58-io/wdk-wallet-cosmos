"use strict";

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./src/wallet-account-cosmos.js').CosmosWalletConfig} CosmosWalletConfig */
/** @typedef {import('./src/chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig */

export { default } from "./src/wallet-manager-cosmos.js";

export { default as WalletAccountCosmos } from "./src/wallet-account-cosmos.js";

export {
  default as SeedSignerCosmos,
  ISignerCosmos,
} from "./src/signers/seed-signer-cosmos.js";

export {
  resolveChainConfig,
  getAvailableChains,
  isKnownChain,
} from "./src/chain-config-resolver.js";
