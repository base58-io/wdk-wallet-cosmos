export type FeeRates = import('@tetherto/wdk-wallet').FeeRates;
export type KeyPair = import('@tetherto/wdk-wallet').KeyPair;
export type TransactionResult = import('@tetherto/wdk-wallet').TransactionResult;
export type TransferOptions = import('@tetherto/wdk-wallet').TransferOptions;
export type TransferResult = import('@tetherto/wdk-wallet').TransferResult;
export type Finality = import('@tetherto/wdk-wallet').Finality;
export type TransactionReceipt = import('@tetherto/wdk-wallet').TransactionReceipt;
export type WaitForTransactionOptions = import('@tetherto/wdk-wallet').WaitForTransactionOptions;
export type CosmosWalletConfig = import('./src/wallet-account-cosmos.js').CosmosWalletConfig;
export type ResolvedChainConfig = import('./src/chain-config-resolver.js').ResolvedChainConfig;
export type CosmosTransactionReceipt = import('./src/wallet-account-cosmos-read-only.js').CosmosTransactionReceipt;
export type DirectSignDocJson = import('./src/wallet-account-cosmos.js').DirectSignDocJson;
export type SignDirectParams = import('./src/wallet-account-cosmos.js').SignDirectParams;
export type SignDirectResult = import('./src/wallet-account-cosmos.js').SignDirectResult;
export type SignAminoParams = import('./src/wallet-account-cosmos.js').SignAminoParams;
export type SignAminoResult = import('./src/wallet-account-cosmos.js').SignAminoResult;
/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet').Finality} Finality */
/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').WaitForTransactionOptions} WaitForTransactionOptions */
/** @typedef {import('./src/wallet-account-cosmos.js').CosmosWalletConfig} CosmosWalletConfig */
/** @typedef {import('./src/chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig */
/** @typedef {import('./src/wallet-account-cosmos-read-only.js').CosmosTransactionReceipt} CosmosTransactionReceipt */
/** @typedef {import('./src/wallet-account-cosmos.js').DirectSignDocJson} DirectSignDocJson */
/** @typedef {import('./src/wallet-account-cosmos.js').SignDirectParams} SignDirectParams */
/** @typedef {import('./src/wallet-account-cosmos.js').SignDirectResult} SignDirectResult */
/** @typedef {import('./src/wallet-account-cosmos.js').SignAminoParams} SignAminoParams */
/** @typedef {import('./src/wallet-account-cosmos.js').SignAminoResult} SignAminoResult */
export { default } from "./src/wallet-manager-cosmos.js";
export { default as WalletAccountCosmos } from "./src/wallet-account-cosmos.js";
export { default as WalletAccountCosmosReadOnly } from "./src/wallet-account-cosmos-read-only.js";
export { default as SeedSignerCosmos, ISignerCosmos, } from "./src/signers/seed-signer-cosmos.js";
export { resolveChainConfig, getAvailableChains, isKnownChain, } from "./src/chain-config-resolver.js";
