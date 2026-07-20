# @base58-io/wdk-wallet-cosmos

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage BIP-44 wallets for Cosmos-compatible blockchains. This package provides a clean API for creating, managing, and interacting with Cosmos-compatible wallets using BIP-39 seed phrases and Cosmos-specific derivation paths.

## About WDK

This module was created with the aim of integrating with the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## Features

- **BIP-39 Seed Phrase Support**: Generate and validate BIP-39 mnemonic seed phrases
- **Cosmos Derivation Paths**: Support for BIP-44 standard derivation paths for Cosmos (m/44'/118')
- **Multi-Account Management**: Create and manage multiple accounts from a single seed phrase
- **Transaction Management**: Send token transfers via RPC
- **Token Support**: Query native token balances (uatom, etc.)
- **Chain Registry Integration**: Auto-configure from [chain-registry](https://github.com/hyperweb-io/chain-registry) or use custom chain config
- **RPC Fallback**: Automatic failover across multiple RPC endpoints with exponential backoff retry logic
- **IBC Development Environment**: Local testnet with two chains and Hermes relayer for IBC testing

## Installation

To install the `@base58-io/wdk-wallet-cosmos` package, follow these instructions:

You can install it using npm:

```bash
npm install @base58-io/wdk-wallet-cosmos
```

## Quick Start

### Importing from `@base58-io/wdk-wallet-cosmos`

### Creating a New Wallet

```javascript
import WalletManagerCosmos, {
  SeedSignerCosmos,
  WalletAccountCosmos,
} from '@base58-io/wdk-wallet-cosmos'

// Use a BIP-39 seed phrase (replace with your own secure phrase)
const seedPhrase =
  'test only example nut use this real life secret phrase must random'

// Option 1: Use chain-registry (recommended for public chains)
const wallet = new WalletManagerCosmos(seedPhrase, {
  chainName: 'cosmoshub', // Auto-fetches config from chain-registry
})

// Option 2: Custom/local chain configuration
const localWallet = new WalletManagerCosmos(seedPhrase, {
  rpcEndpoints: ['http://localhost:26657'],
  addressPrefix: 'cosmos',
  nativeDenom: 'uatom',
  gasPrice: '0.025uatom',
})

// Option 3: Hybrid - chain-registry with custom RPC fallbacks
const hybridWallet = new WalletManagerCosmos(seedPhrase, {
  chainName: 'osmosis',
  rpcEndpoints: ['https://my-primary-rpc.com', 'https://my-backup-rpc.com'],
})

// Option 4: Use a derivable Cosmos signer
const signer = new SeedSignerCosmos(seedPhrase, {
  chainName: 'cosmoshub',
})
const signerWallet = new WalletManagerCosmos(signer, {
  chainName: 'cosmoshub',
})

// Get a full access account
const account = await wallet.getAccount(0)
```

### Managing Multiple Accounts

```javascript
import WalletManagerCosmos from '@base58-io/wdk-wallet-cosmos'

// Assume wallet is already created
// Get the first account (index 0)
const account = await wallet.getAccount(0)
const address = await account.getAddress()
console.log('Account 0 address:', address)

// Get the second account (index 1)
const account1 = await wallet.getAccount(1)
const address1 = await account1.getAddress()
console.log('Account 1 address:', address1)

// Get account by custom derivation path
// Full path will be m/44'/118'/0'/0/5
const customAccount = await wallet.getAccountByPath("0'/0/5")
const customAddress = await customAccount.getAddress()
console.log('Custom account address:', customAddress)

// Register another derivable signer and select it by name
wallet.addSigner('hardware', hardwareSigner)
const hardwareAccount = await wallet.getAccount(0, {
  signerName: 'hardware',
})

// A named non-derivable signer represents one account directly
wallet.addSigner('account', accountSigner)
const signerAccount = await wallet.getAccount('account')

// Note: All addresses are Bech32 Cosmos addresses (cosmos1...)
// All accounts inherit the configuration from the wallet manager
```

### Checking Balances

```javascript
import WalletManagerCosmos from '@base58-io/wdk-wallet-cosmos'

// Assume wallet and account are already created
// Get native token balance (in base units, e.g., uatom)
const balance = await account.getBalance()
console.log('Native balance:', balance, 'uatom')

// Get specific token balance
const tokenBalance = await account.getTokenBalance('uatom')
console.log('Token balance:', tokenBalance)

// Note: RPC endpoint is required for balance checks
// Make sure wallet was created with rpcEndpoints configuration
```

### Sending Transfers

Transfer tokens using `WalletAccountCosmos`.

```javascript
// Transfer tokens
const transferResult = await account.transfer({
  token: 'uatom', // Token denomination
  recipient: 'cosmos1...', // Recipient's address
  amount: 1000000n, // Amount in base units (use BigInt for large numbers)
})
console.log('Transfer hash:', transferResult.hash)
console.log('Transfer fee:', transferResult.fee)

// Quote token transfer fee
const transferQuote = await account.quoteTransfer({
  token: 'uatom', // Token denomination
  recipient: 'cosmos1...', // Recipient's address
  amount: 1000000n, // Amount in base units
})
console.log('Transfer fee estimate:', transferQuote.fee)
```

### Fee Management

Retrieve current fee rates using `WalletManagerCosmos`.

```javascript
// Get current fee rates
const feeRates = await wallet.getFeeRates()
console.log('Normal fee rate:', feeRates.normal)
console.log('Fast fee rate:', feeRates.fast)
```

Fee estimation uses a deterministic fallback chain shared by `transfer`,
`quoteTransfer`, `sendTransaction`, and `quoteSendTransaction`:

1. `gasPriceStep` from chain-registry (`average` / `high`)
2. explicit `gasPrice` from config (for example `0.025uatom`)
3. default Cosmos-compatible gas price tiers (`0.01 / 0.025 / 0.04`)

Estimated fee is calculated as:

```text
ceil(gasPriceAmount * gasLimit)
```

with a default transfer gas limit of `200000`.

### Memory Management

Clear sensitive data from memory using `dispose` methods in `WalletAccountCosmos` and `WalletManagerCosmos`.

```javascript
// Dispose wallet accounts to clear private keys from memory
account.dispose()

// Dispose entire wallet manager
wallet.dispose()
```

## API Reference

### Table of Contents

| Class                                       | Description                                                                                               | Methods                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [WalletManagerCosmos](#walletmanagercosmos) | Main class for managing Cosmos wallets. Extends `WalletManager` from `@tetherto/wdk-wallet`.              | [Constructor](#constructor), [Methods](#methods)     |
| [WalletAccountCosmos](#walletaccountcosmos) | Individual Cosmos wallet account implementation. Implements `IWalletAccount<TxRaw>`.                        | [Creation](#creation), [Methods](#methods-1)          |
| `SeedSignerCosmos`                          | Memory-safe, derivable Cosmos signer backed by a BIP-39 seed.                                               | `derive`, `getAddress`, `sign`, `dispose`             |

### WalletManagerCosmos

The main class for managing Cosmos wallets.  
Extends `WalletManager` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletManagerCosmos(seedOrSigner, config)
```

**Parameters:**

- `seedOrSigner` (string | Uint8Array | ISignerCosmos): BIP-39 mnemonic, seed bytes, or a derivable Cosmos signer
- `config` (object, optional): Configuration object
  - `chainName` (string, optional): Chain name from chain-registry (e.g. "cosmoshub", "osmosis", "juno")
  - `rpcEndpoints` (string[], optional): Array of RPC endpoint URLs for fallback (overrides registry)
  - `retryCount` (number, optional): Max retry rounds for RPC fallback (default: 3)
  - `retryDelay` (number, optional): Base delay in ms for exponential backoff (default: 150)
  - `addressPrefix` (string, optional): Bech32 address prefix (overrides registry, default: "cosmos")
  - `nativeDenom` (string, optional): Native token denomination (overrides registry, default: "uatom")
  - `coinType` (number, optional): BIP-44 coin type (overrides registry, default: 118)
  - `gasPrice` (string, optional): Gas price with denom (e.g. "0.025uatom")
  - `transferMaxFee` (number | bigint, optional): Maximum fee amount for transfer operations
  - `transactionMaxFee` (number | bigint, optional): Maximum fee amount for transaction operations

**Example:**

```javascript
// Using chain-registry
const wallet = new WalletManagerCosmos(seedPhrase, {
  chainName: 'juno',
})

// Using custom config with fallback endpoints
const wallet = new WalletManagerCosmos(seedPhrase, {
  rpcEndpoints: ['http://localhost:26657', 'http://backup:26657'],
  addressPrefix: 'mychain',
  nativeDenom: 'stake',
  gasPrice: '0.025stake',
})
```

#### Methods

| Method                   | Description                                                      | Returns                                   |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| `getAccount(index, options?)`      | Returns an account, optionally using `options.signerName`         | `Promise<WalletAccountCosmos>`            |
| `getAccount(signerName)`           | Returns the account represented by a named signer                 | `Promise<WalletAccountCosmos>`            |
| `getAccountByPath(path, options?)` | Returns an account by path, optionally using `options.signerName` | `Promise<WalletAccountCosmos>`            |
| `getFeeRates()`          | Returns current fee rates for transactions                       | `Promise<{normal: bigint, fast: bigint}>` |
| `dispose()`              | Disposes all wallet accounts, clearing private keys from memory  | `void`                                    |

### Helper Functions

The package exports helper functions for working with chain-registry:

```javascript
import {
  resolveChainConfig,
  getAvailableChains,
  isKnownChain,
} from '@base58-io/wdk-wallet-cosmos'

// Resolve configuration from chain name or custom config
const config = resolveChainConfig({ chainName: 'juno' })
console.log(config.addressPrefix) // "juno"
console.log(config.nativeDenom) // "ujuno"
console.log(config.coinType) // 118
console.log(config.rpcEndpoints) // ["https://rpc.juno.network", ...]

// Get list of available chains from registry
const chains = getAvailableChains()
console.log(chains) // ["cosmoshub", "osmosis", "juno", ...]

// Check if a chain is in the registry
const exists = isKnownChain('osmosis') // true
const notExists = isKnownChain('mylocal') // false
```

### WalletAccountCosmos

Represents an individual wallet account. Implements `IWalletAccount<TxRaw>` from `@tetherto/wdk-wallet`.

#### Creation

Create accounts through `WalletManagerCosmos`, or directly with the asynchronous factories:

```javascript
const account = await WalletAccountCosmos.create(seed, "0'/0/0", config)
const signerAccount = await WalletAccountCosmos.fromSigner(signer, config)
```

**Parameters:**

- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `signer` (ISignerCosmos): Initialized Cosmos signer
- `path` (string): Relative BIP-44 derivation path (e.g., "0'/0/0")
- `config` (object, optional): Configuration object (same as WalletManagerCosmos)
  - `chainName` (string, optional): Chain name from chain-registry
  - `rpcEndpoints` (string[], optional): Array of RPC endpoint URLs for fallback
  - `retryCount` (number, optional): Max retry rounds for RPC fallback (default: 3)
  - `retryDelay` (number, optional): Base delay in ms for exponential backoff (default: 150)
  - `addressPrefix` (string, optional): Bech32 address prefix
  - `nativeDenom` (string, optional): Native token denomination
  - `coinType` (number, optional): BIP-44 coin type
  - `gasPrice` (string, optional): Gas price with denom
  - `transferMaxFee` (number | bigint, optional): Maximum transfer fee amount
  - `transactionMaxFee` (number | bigint, optional): Maximum transaction fee amount

#### Methods

| Method                     | Description                                                                                | Returns                                |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| `getAddress()`             | Returns the account's address                                                              | `Promise<string>`                      |
| `transfer(options)`        | Transfers tokens to another address                                                        | `Promise<{hash: string, fee: bigint}>` |
| `quoteTransfer(options)`   | Estimates the fee for a transfer                                                           | `Promise<{fee: bigint}>`               |
| `sign(message)`            | Signs a UTF-8 message using Cosmos ADR-36 arbitrary message signing                         | `Promise<string>`                      |
| `verify(message, sig)`     | Verifies a JSON-encoded Cosmos ADR-36 `StdSignature` against this account                   | `Promise<boolean>`                     |
| `signTransaction(tx)`      | Signs a transaction and returns a Cosmos `TxRaw`                                            | `Promise<TxRaw>`                       |
| `sendTransaction(tx)`      | Sends an unsigned transaction or broadcasts a signed `TxRaw`                               | `Promise<{hash: string, fee: bigint}>` |
| `quoteSendTransaction(tx)` | Estimates an unsigned fee or reads the fee from a signed `TxRaw`                            | `Promise<{fee: bigint}>`               |
| `getBalance(denom?)`       | Returns the token balance (in base units). Uses `nativeDenom` from config if not specified | `Promise<bigint>`                      |
| `getTokenBalance(denom)`   | Returns the balance of a specific token                                                    | `Promise<bigint>`                      |
| `getTokenBalances(denoms)` | Returns balances of multiple specified tokens                                              | `Promise<Record<string, bigint>>`      |
| `dispose()`                | Disposes the wallet account, clearing private keys from memory                             | `void`                                 |

##### `transfer(options)`

Transfers tokens to another address.

**Parameters:**

- `options` (object): Transfer options
  - `token` (string): Token denomination (e.g. "uatom")
  - `recipient` (string): Recipient address
  - `amount` (bigint): Amount in base units

**Returns:** `Promise<{hash: string, fee: bigint}>` - Object containing hash and fee

##### Fee estimation behavior

- Fee is derived from gas price metadata and default gas limit (`200000`).
- `transferMaxFee` applies only to `transfer` and `quoteTransfer`.
- `transactionMaxFee` applies to signing, sending, and quoting transactions.
- Operations throw before signing or broadcasting when their fee exceeds the configured limit.

> **Note**: Message signing (`sign`) uses Cosmos ADR-36, compatible with wallet arbitrary-message signing flows such as Keplr `signArbitrary`. It returns a JSON-encoded `StdSignature`; `verify` expects the same format.

## Supported Networks

This package works with Cosmos-compatible blockchains, including:

- **Cosmos Hub**
- **Osmosis**
- **Juno**
- **Other Cosmos SDK Chains**

## Security Considerations

- **Seed Phrase Security**: Always store your seed phrase securely and never share it
- **Private Key Management**: The package handles private keys internally with memory safety features
- **RPC Security**: Use trusted RPC endpoints and consider running your own node for production
- **Transaction Validation**: Always validate transaction details before signing
- **Memory Cleanup**: Use the `dispose()` method to clear private keys from memory when done
- **Fee Limits**: Set `transferMaxFee` and `transactionMaxFee` to prevent excessive fees

### Memory-Safe Key Handling

This package uses `sodium-universal` for cryptographically secure memory zeroing. When you call `dispose()`:

1. All seed data is overwritten with zeros using `sodium_memzero()`
2. Derived private keys are securely erased
3. The wallet becomes unusable (throws errors on further operations)

```javascript
// Always dispose wallets when done
wallet.dispose()

// Check if wallet was disposed
console.log(wallet.isDisposed) // true

// This will throw an error
await wallet.getAccount(0) // Error: Cannot use disposed wallet manager
```

## Platform Support

| Platform     | Status | Notes              |
| ------------ | ------ | ------------------ |
| Node.js      | ✅     | Full support       |
| Browser      | ✅     | Full support       |
| React Native | ⚠️     | Requires polyfills |

### React Native Setup

React Native requires crypto polyfills. Add these to your entry point **before** importing this package:

```javascript
import 'react-native-get-random-values'
import '@ethersproject/shims' // or similar crypto polyfill

// Now you can import the wallet
import WalletManagerCosmos from '@base58-io/wdk-wallet-cosmos'
```

## Development

### Prerequisites

- Node.js 20.19+
- Docker (for local testnet)

### Installation

```bash
npm install
```

### Running Tests

> ⚠️ **Important**: Tests require a running Ignite chain. You must start the local testnet before running tests.
>
> Currently, there is no snapshot/restore mechanism, so **the chain must be reset before each test run** to ensure consistent initial balances.

```bash
# 1. Start the local testnet (in a separate terminal)
docker compose up

# 2. Run tests
npm test

# To reset the chain before running tests again:
docker compose down -v
docker compose up
```

### Local Testnet

Start two local Cosmos-compatible blockchains with IBC support using Docker:

```bash
docker compose up -d
```

This starts two Ignite chains and a Hermes IBC relayer:

| Service    | Chain ID | Prefix | RPC                    | REST                  | gRPC                  | Faucet                |
| ---------- | -------- | ------ | ---------------------- | --------------------- | --------------------- | --------------------- |
| wdk-chain  | wdkdev   | `wdk`  | http://localhost:26657 | http://localhost:1317 | http://localhost:9090 | http://localhost:4500 |
| wdk-chain2 | wdkdev2  | `wdk2` | http://localhost:26658 | http://localhost:1318 | http://localhost:9091 | http://localhost:4501 |

#### Setting up IBC

After starting the chains, run the IBC setup script to create clients, connections, and channels:

```bash
# Wait ~30-60s for chains to fully start, then:
./scripts/setup-ibc.sh
```

This creates:

- IBC clients on both chains
- Connection between wdkdev and wdkdev2
- Transfer channel (channel-0) on both chains

#### Test IBC Transfer

```bash
# Transfer from wdkdev to wdkdev2
docker exec wdk-chain wdkdevd tx ibc-transfer transfer transfer channel-0 \
  wdk21m9l358xunhhwds0568za49mzhvuxx9uxs7puwd 1000stake \
  --from alice --chain-id wdkdev -y

# Transfer from wdkdev2 to wdkdev
docker exec wdk-chain2 wdkdev2d tx ibc-transfer transfer transfer channel-0 \
  wdk1m9l358xunhhwds0568za49mzhvuxx9uxv52xme 1000stake \
  --from alice --chain-id wdkdev2 -y
```

#### Reset Environment

To fully reset the testnet (including IBC state):

```bash
docker compose down -v
rm -rf ignite-home ignite-home2 hermes/keys/*
docker compose up -d
# Wait for chains to start, then:
./scripts/setup-ibc.sh
```

#### Test Accounts

The local testnet includes pre-funded accounts with fixed mnemonics and addresses:

**Chain 1 (wdkdev)**:

| Account | Address                                      | Coins                                    |
| ------- | -------------------------------------------- | ---------------------------------------- |
| alice   | `wdk1jvjy9gpu95k9uaez7ncydkaurcqpcpye7znlz5` | 20000token, 200000000stake (100M bonded) |
| bob     | `wdk1m9l358xunhhwds0568za49mzhvuxx9uxv52xme` | 10000token, 100000000stake               |
| relayer | `wdk1yxex3ssqukyqaph57dptyctsurv47zl07ju94v` | 10000000stake                            |

**Chain 2 (wdkdev2)**:

| Account | Address                                       | Coins                                    |
| ------- | --------------------------------------------- | ---------------------------------------- |
| alice   | `wdk21jvjy9gpu95k9uaez7ncydkaurcqpcpyezgc9hq` | 20000token, 200000000stake (100M bonded) |
| bob     | `wdk21m9l358xunhhwds0568za49mzhvuxx9uxs7puwd` | 10000token, 100000000stake               |
| relayer | `wdk21yxex3ssqukyqaph57dptyctsurv47zl0zchlqc` | 10000000stake                            |

**Relayer mnemonic**: `thumb subway until asthma diesel visa supply brush relief control amused bonus grace great flavor initial drum loud circle crowd topple box novel biology`

### Building Types

Generate TypeScript declaration files:

```bash
npm run build:types
```

### Project Structure

```
├── src/
│   ├── memory-safe/
│   │   └── secure-buffer.js       # Memory-safe buffer wrapper
│   ├── chain-config-resolver.js   # Chain registry integration
│   ├── gas-fee-utils.js           # Shared fee/gas estimation helpers and defaults
│   ├── rpc-fallback.js            # RPC fallback with retry logic
│   ├── wallet-account-cosmos.js
│   └── wallet-manager-cosmos.js
├── tests/
├── types/                         # Generated TypeScript declarations
├── ignite-chain/                  # Local testnet chain configurations
│   ├── wdkdev/                    # Chain 1 (prefix: wdk)
│   │   └── config.yml
│   └── wdkdev2/                   # Chain 2 (prefix: wdk2)
│       └── config.yml
├── hermes/                        # Hermes IBC relayer configuration
│   └── config.toml
├── scripts/
│   └── setup-ibc.sh               # IBC setup script
└── docker-compose.yml
```

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue on the GitHub repository.

## Additional Resources

- **[WDK Documentation](https://docs.wallet.tether.io)** - Wallet Development Kit guides
- **[WDK Browser Extension Starter](https://github.com/base58-io/wdk-starter-browser-extension)** - A starter template for building browser extension wallets with the Tether Wallet Development Kit (WDK). Clone, customize, and ship your own self-custodial wallet.
