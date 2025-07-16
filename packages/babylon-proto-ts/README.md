<p align="center">
    <img alt="Babylon Logo" src="https://github.com/user-attachments/assets/dc74271e-90f1-44bd-9122-2b7438ab375c" width="100" />
    <h3 align="center">@babylonlabs-io/babylon-proto-ts</h3>
    <p align="center">Babylon Bitcoin Staking Protocol</p>
    <p align="center"><strong>TypeScript</strong> library</p>
    <p align="center">
      <a href="https://www.npmjs.com/package/@babylonlabs-io/babylon-proto-ts"><img src="https://badge.fury.io/js/babylon-proto-ts.svg" alt="npm version" height="18"></a>
    </p>
</p>
<br/>

## 👨🏻‍💻 Installation

```console
npm i @babylonlabs-io/babylon-proto-ts
```

## 🚀 Quick Start

This library provides TypeScript bindings for the Babylon Bitcoin Staking Protocol, offering both low-level protobuf exports and high-level client abstractions.

### Basic Usage

Use the SDK to access the client, messages, and utilities:

```typescript
import { createBabylonSDK } from "@babylonlabs-io/babylon-proto-ts";

const sdk = createBabylonSDK({ rpcUrl: "https://babylon-rpc.example.com" });

// Connect the client
await sdk.connect();

// Query rewards for an address
const rewards = await sdk.client.getRewards("bbn1...");

// Query balance
const balance = await sdk.client.getBalance("bbn1...", "ubbn");

// Get Bitcoin tip height
const btcTipHeight = await sdk.client.getBTCTipHeight();
```

### Wallet Integration

For applications that need to create and sign transactions, use the provided registry and amino types:

```typescript
import { createBabylonSDK } from "@babylonlabs-io/babylon-proto-ts";
import { SigningStargateClient } from "@cosmjs/stargate";

const sdk = createBabylonSDK({ rpcUrl: "https://babylon-rpc.example.com" });

// Create signing client with Babylon support
const client = await SigningStargateClient.connectWithSigner(
  rpc,
  offlineSigner as OfflineSigner,
  {
    registry: sdk.utils.createRegistry(),
    aminoTypes: sdk.utils.createAminoTypes(),
  },
);

// Create messages using the SDK
const withdrawMsg = sdk.messages.createWithdrawRewardMsg("bbn1...");

// Sign and broadcast
const result = await client.signAndBroadcast("bbn1...", [withdrawMsg], "auto");
```

### Direct Protobuf Access

For advanced use cases, you can import protobuf types directly:

```typescript
import { btcstaking, incentivequery } from "@babylonlabs-io/babylon-proto-ts"

// Use protobuf types directly
const stakingParams = btcstaking.Params.fromPartial({...})
const rewardQuery = incentivequery.QueryRewardGaugesRequest.fromPartial({...})
```

## 📚 API Reference

### SDK Functions

#### `createBabylonSDK(config: BabylonConfig): BabylonSDK`

Creates a comprehensive SDK instance with client, messages, and utilities.

- **Parameters:**
  - `config.rpcUrl`: RPC endpoint URL for the Babylon network
- **Returns:** SDK object with `client`, `messages`, `utils`, and `connect()` method

### SDK Methods

#### `sdk.connect(): Promise<void>`

Initializes the client connection to the Babylon network.

### Client Methods (via sdk.client)

#### `sdk.client.getRewards(address: string): Promise<number>`

Retrieves the total rewards for a given address.

- **Parameters:**
  - `address`: The Babylon address to query
- **Returns:** Total rewards amount (number)

#### `sdk.client.getBalance(address: string, denom?: string): Promise<number>`

Gets the balance of a specific token for an address.

- **Parameters:**
  - `address`: The Babylon address to query
  - `denom`: Token denomination (defaults to "ubbn")
- **Returns:** Balance amount (number)

#### `sdk.client.getBTCTipHeight(): Promise<number>`

Retrieves the current Bitcoin blockchain tip height.

- **Returns:** Bitcoin tip height (number)

### SDK Messages

#### `sdk.messages.createWithdrawRewardMsg(address: string)`

Creates a message for withdrawing rewards from Bitcoin staking.

- **Parameters:**
  - `address`: The Babylon address to withdraw rewards for
- **Returns:** Message object with proper typeUrl and value, ready for signing and broadcasting

### SDK Utilities

#### `sdk.utils.createRegistry(): Registry`

Creates a CosmJS registry with all Babylon message types registered.

#### `sdk.utils.createAminoTypes(): AminoTypes`

Creates amino types for Babylon messages, required for hardware wallet compatibility.

### Protobuf Exports

The library exports all generated protobuf types directly, allowing for advanced use cases

## 📝 Commit Format & Automated Releases

This project uses [**Conventional Commits**](https://www.conventionalcommits.org/en/v1.0.0/)
and [**semantic-release**](https://semantic-release.gitbook.io/) to automate
versioning, changelog generation, and npm publishing.

### ✅ How It Works

1. All commits must follow the **Conventional Commits** format.
2. When changes are merged into the `main` branch:
   - `semantic-release` analyzes commit messages
   - Determines the appropriate semantic version bump (`major`, `minor`, `patch`)
   - Updates the `CHANGELOG.md`
   - Tags the release in Git
   - Publishes the new version to npm (if configured)

### 🧱 Commit Message Examples

```console
feat: add support for slashing script
fix: handle invalid staking tx gracefully
docs: update README with commit conventions
refactor!: remove deprecated method and cleanup types
```

> **Note:** For breaking changes, add a `!` after the type (
> e.g. `feat!:` or `refactor!:`) and include a description of the breaking
> change in the commit body.

### 🚀 Releasing

Just commit your changes using the proper format and merge to `main`.
The CI pipeline will handle versioning and releasing automatically — no manual
tagging or version bumps needed. 
