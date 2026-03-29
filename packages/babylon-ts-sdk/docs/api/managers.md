[@babylonlabs-io/ts-sdk](README.md) / managers

# managers

# Manager Layer - Wallet Orchestration (Level 2)

High-level managers that orchestrate complex flows using primitives and utilities.
These managers accept wallet interfaces and handle the complete operation lifecycle.

## Architecture

Managers sit between your application and the primitives layer:

```
Your Application
      ↓
Managers (Level 2)    ← This module
      ↓
Primitives (Level 1)  ← Pure functions
      ↓
WASM (Rust Core)      ← Cryptographic operations
```

## When to Use Managers

Use managers when you have:
- **Frontend apps** with browser wallet integration (UniSat, OKX, etc.)
- **Quick integration** needs with minimal code
- **Standard flows** that don't require custom signing logic

Use primitives instead when you need:
- Backend services with KMS/HSM signing
- Full control over every operation
- Custom wallet integrations

## Available Managers

### [PeginManager](#peginmanager)
Orchestrates the peg-in flow:
- [preparePegin()](#preparepegin) - Build Pre-PegIn HTLC and sign PegIn input
- [registerPeginOnChain()](#registerpeginonchain) - Submit to Ethereum
- [signAndBroadcast()](#signandbroadcast) - Broadcast to Bitcoin

### [PayoutManager](#payoutmanager)
Signs payout authorization transactions (Step 3 of peg-in).
- [signPayoutTransaction()](#signpayouttransaction) - Sign payout (uses Assert tx as reference)

## Complete Peg-in Flow

The 4-step peg-in flow uses both managers:

| Step | Manager | Method |
|------|---------|--------|
| 1 | PeginManager | `preparePegin()` |
| 2 | PeginManager | `registerPeginOnChain()` |
| 3 | PayoutManager | `signPayoutTransaction()` |
| 4 | PeginManager | `signAndBroadcast()` |

**Step 3 Details:** The vault provider provides 3 transactions per claimer:
- `claim_tx` - Claim transaction
- `assert_tx` - Assert transaction
- `payout_tx` - Payout transaction

You must sign the Payout transaction (uses assert_tx as input reference) for each claimer.

## See

[Managers Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md)

## Classes

### PayoutManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L134)

High-level manager for payout transaction signing.

#### Remarks

After registering your peg-in on Ethereum (Step 2), the vault provider prepares
claim/payout transaction pairs. You must sign each payout transaction using this
manager and submit the signatures to the vault provider's RPC API.

**What happens internally:**
1. Validates your wallet's public key matches the vault's depositor
2. Builds an unsigned PSBT with taproot script path spend info
3. Signs input 0 (the vault UTXO) with your wallet
4. Extracts the 64-byte Schnorr signature

**Note:** The payout transaction has 2 inputs. PayoutManager only signs input 0
(from the peg-in tx). Input 1 (from the assert tx) is signed by the vault provider.

#### See

 - [PeginManager](#peginmanager) - For the complete peg-in flow context
 - [buildPayoutPsbt](primitives.md#buildpayoutpsbt) - Lower-level primitive used internally
 - [extractPayoutSignature](primitives.md#extractpayoutsignature) - Signature extraction primitive

#### Constructors

##### Constructor

```ts
new PayoutManager(config): PayoutManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L142)

Creates a new PayoutManager instance.

###### Parameters

###### config

[`PayoutManagerConfig`](#payoutmanagerconfig)

Manager configuration including wallet

###### Returns

[`PayoutManager`](#payoutmanager)

#### Methods

##### signPayoutTransaction()

```ts
signPayoutTransaction(params): Promise<PayoutSignatureResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:168](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L168)

Signs a Payout transaction and extracts the Schnorr signature.

Flow:
1. Vault provider submits Claim transaction
2. Claimer submits Assert transaction to prove validity
3. Payout can be executed (references Assert tx)

This method orchestrates the following steps:
1. Get wallet's public key and convert to x-only format
2. Validate wallet pubkey matches on-chain depositor pubkey (if provided)
3. Build unsigned PSBT using primitives
4. Sign PSBT via btcWallet.signPsbt()
5. Extract 64-byte Schnorr signature using primitives

The returned signature can be submitted to the vault provider API.

###### Parameters

###### params

[`SignPayoutParams`](#signpayoutparams)

Payout signing parameters

###### Returns

`Promise`\<[`PayoutSignatureResult`](#payoutsignatureresult)\>

Signature result with 64-byte Schnorr signature and depositor pubkey

###### Throws

Error if wallet pubkey doesn't match depositor pubkey

###### Throws

Error if wallet operations fail or signature extraction fails

##### getNetwork()

```ts
getNetwork(): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L223)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### supportsBatchSigning()

```ts
supportsBatchSigning(): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:232](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L232)

Checks if the wallet supports batch signing (signPsbts).

###### Returns

`boolean`

true if batch signing is supported

##### signPayoutTransactionsBatch()

```ts
signPayoutTransactionsBatch(transactions): Promise<object[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:245](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L245)

Batch signs multiple payout transactions (1 per claimer).
This allows signing all transactions with a single wallet interaction.

###### Parameters

###### transactions

[`SignPayoutParams`](#signpayoutparams)[]

Array of payout params to sign

###### Returns

`Promise`\<`object`[]\>

Array of signature results matching input order

###### Throws

Error if wallet doesn't support batch signing

###### Throws

Error if any signing operation fails

***

### PeginManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:376](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L376)

Manager for orchestrating peg-in operations.

This manager provides a high-level API for creating peg-in transactions
by coordinating between SDK primitives, utilities, and wallet interfaces.

#### Remarks

The complete peg-in flow consists of 4 steps:

| Step | Method | Description |
|------|--------|-------------|
| 1 | [preparePegin](#preparepegin) | Build Pre-PegIn HTLC, fund it, sign PegIn input |
| 2 | [registerPeginOnChain](#registerpeginonchain) | Submit to Ethereum contract with PoP |
| 3 | [PayoutManager](#payoutmanager) | Sign BOTH payout authorizations |
| 4 | [signAndBroadcast](#signandbroadcast) | Sign and broadcast Pre-PegIn tx to Bitcoin network |

**Important:** Step 3 uses [PayoutManager](#payoutmanager), not this class. After step 2,
the vault provider prepares 3 transactions per claimer:
- `claim_tx` - Claim transaction
- `assert_tx` - Assert transaction
- `payout_tx` - Payout transaction

You must sign the Payout transaction for each claimer:
- [PayoutManager.signPayoutTransaction](#signpayouttransaction) - uses assert_tx as input reference

Submit all signatures to the vault provider before proceeding to step 4.

#### See

 - [PayoutManager](#payoutmanager) - Required for Step 3 (payout authorization)
 - [buildPrePeginPsbt](primitives.md#buildprepeginpsbt) - Lower-level primitive for custom implementations
 - [Managers Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md)

#### Constructors

##### Constructor

```ts
new PeginManager(config): PeginManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:384](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L384)

Creates a new PeginManager instance.

###### Parameters

###### config

[`PeginManagerConfig`](#peginmanagerconfig)

Manager configuration including wallets and contract addresses

###### Returns

[`PeginManager`](#peginmanager)

#### Methods

##### preparePegin()

```ts
preparePegin(params): Promise<PreparePeginResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:408](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L408)

Prepares a peg-in by building the Pre-PegIn HTLC transaction,
funding it, constructing the PegIn transaction, and signing the PegIn input.

This method orchestrates the following steps:
1. Get depositor BTC public key from wallet
2. Build unfunded Pre-PegIn transaction (HTLC output) using primitives
3. Select UTXOs to cover the HTLC value
4. Fund the Pre-PegIn transaction
5. Derive the PegIn transaction from the funded Pre-PegIn txid
6. Build PSBT for signing the PegIn input (HTLC leaf 0)
7. Sign via BTC wallet and extract depositor signature

The returned `fundedPrePeginTxHex` is funded but unsigned (inputs unsigned).
Use `signAndBroadcast()` AFTER registering on Ethereum to broadcast it.

###### Parameters

###### params

[`PreparePeginParams`](#preparepeginparams)

Pegin parameters including amount, HTLC params, UTXOs

###### Returns

`Promise`\<[`PreparePeginResult`](#preparepeginresult)\>

Pegin result with funded Pre-PegIn tx, signed PegIn input, and signatures

###### Throws

Error if wallet operations fail or insufficient funds

##### signAndBroadcast()

```ts
signAndBroadcast(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:538](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L538)

Signs and broadcasts a funded peg-in transaction to the Bitcoin network.

This method:
1. Parses the funded transaction hex
2. Fetches UTXO data from mempool for each input
3. Creates a PSBT with proper witnessUtxo/tapInternalKey
4. Signs via btcWallet.signPsbt()
5. Finalizes and extracts the transaction
6. Broadcasts via mempool API

###### Parameters

###### params

[`SignAndBroadcastParams`](#signandbroadcastparams)

Transaction hex and depositor public key

###### Returns

`Promise`\<`string`\>

The broadcasted Bitcoin transaction ID

###### Throws

Error if signing or broadcasting fails

##### registerPeginOnChain()

```ts
registerPeginOnChain(params): Promise<RegisterPeginResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:662](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L662)

Registers a peg-in on Ethereum by calling the BTCVaultsManager contract.

This method:
1. Gets depositor ETH address from wallet
2. Creates proof of possession (BTC signature of ETH address)
3. Checks if vault already exists (pre-flight check)
4. Encodes the contract call using viem
5. Estimates gas (catches contract errors early with proper revert reasons)
6. Sends transaction with pre-estimated gas via ethWallet.sendTransaction()

###### Parameters

###### params

[`RegisterPeginParams`](#registerpeginparams)

Registration parameters including BTC pubkey and unsigned tx

###### Returns

`Promise`\<[`RegisterPeginResult`](#registerpeginresult)\>

Result containing Ethereum transaction hash and vault ID

###### Throws

Error if signing or transaction fails

###### Throws

Error if vault already exists

###### Throws

Error if contract simulation fails (e.g., invalid signature, unauthorized)

##### getNetwork()

```ts
getNetwork(): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:898](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L898)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:907](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L907)

Gets the configured BTCVaultsManager contract address.

###### Returns

`` `0x${string}` ``

The Ethereum address of the BTCVaultsManager contract

## Interfaces

### SignInputOptions

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:19](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L19)

Options for signing a specific input in a PSBT.

#### Properties

##### index

```ts
index: number;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:21](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L21)

Input index to sign

##### address?

```ts
optional address: string;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:23](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L23)

Address for signing (optional)

##### publicKey?

```ts
optional publicKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:25](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L25)

Public key for signing (optional, hex string)

##### sighashTypes?

```ts
optional sighashTypes: number[];
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:27](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L27)

Sighash types (optional)

##### disableTweakSigner?

```ts
optional disableTweakSigner: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:29](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L29)

Disable tweak signer for Taproot script path spend (optional)

***

### SignPsbtOptions

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:35](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L35)

SignPsbt options for advanced signing scenarios.

#### Properties

##### autoFinalized?

```ts
optional autoFinalized: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:37](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L37)

Whether to automatically finalize the PSBT after signing

##### signInputs?

```ts
optional signInputs: SignInputOptions[];
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:43](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L43)

Specific inputs to sign.
If not provided, wallet will attempt to sign all inputs it can.
Use this to restrict signing to specific inputs (e.g., only depositor's input).

##### contracts?

```ts
optional contracts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:45](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L45)

Contract information for the signing operation.

###### id

```ts
id: string;
```

Contract identifier.

###### params

```ts
params: Record<string, string | number | string[] | number[]>;
```

Contract parameters.

##### action?

```ts
optional action: object;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:52](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L52)

Action metadata.

###### name

```ts
name: string;
```

Action name for tracking.

***

### BitcoinWallet

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:63](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L63)

This interface is designed to be compatible with @babylonlabs-io/wallet-connector's IBTCProvider

Supports Unisat, Ledger, OKX, OneKey, Keystone, and other Bitcoin wallets.

#### Methods

##### getPublicKeyHex()

```ts
getPublicKeyHex(): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:73](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L73)

Returns the wallet's public key as a hex string.

For Taproot addresses, this should return the x-only public key
(32 bytes = 64 hex characters without 0x prefix).

For compressed public keys (33 bytes = 66 hex characters),
consumers should strip the first byte to get x-only format.

###### Returns

`Promise`\<`string`\>

##### getAddress()

```ts
getAddress(): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:78](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L78)

Returns the wallet's Bitcoin address.

###### Returns

`Promise`\<`string`\>

##### signPsbt()

```ts
signPsbt(psbtHex, options?): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:87](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L87)

Signs a PSBT and returns the signed PSBT as hex.

###### Parameters

###### psbtHex

`string`

The PSBT to sign in hex format

###### options?

[`SignPsbtOptions`](#signpsbtoptions)

Optional signing parameters (e.g., autoFinalized, contracts)

###### Returns

`Promise`\<`string`\>

###### Throws

If the PSBT is invalid or signing fails

##### signPsbts()

```ts
signPsbts(psbtsHexes, options?): Promise<string[]>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:97](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L97)

Signs multiple PSBTs and returns the signed PSBTs as hex.
This allows batch signing with a single wallet interaction.

###### Parameters

###### psbtsHexes

`string`[]

Array of PSBTs to sign in hex format

###### options?

[`SignPsbtOptions`](#signpsbtoptions)[]

Optional array of signing parameters for each PSBT

###### Returns

`Promise`\<`string`[]\>

###### Throws

If any PSBT is invalid or signing fails

##### signMessage()

```ts
signMessage(message, type): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:109](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L109)

Signs a message for authentication or proof of ownership.

###### Parameters

###### message

`string`

The message to sign

###### type

The signing method: "ecdsa" for standard signatures, "bip322-simple" for BIP-322

`"bip322-simple"` | `"ecdsa"`

###### Returns

`Promise`\<`string`\>

Base64-encoded signature

##### getNetwork()

```ts
getNetwork(): Promise<BitcoinNetwork>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:119](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L119)

Returns the Bitcoin network the wallet is connected to.

###### Returns

`Promise`\<[`BitcoinNetwork`](#bitcoinnetwork)\>

BitcoinNetwork enum value (MAINNET, TESTNET, SIGNET)

***

### PayoutManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L28)

Configuration for the PayoutManager.

#### Properties

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L32)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L37)

Bitcoin wallet for signing payout transactions.

***

### SignPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L84)

Parameters for signing a Payout transaction.

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Extends

- `SignPayoutBaseParams`

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L48)

Peg-in transaction hex.
The original transaction that created the vault output being spent.

###### Inherited from

```ts
SignPayoutBaseParams.peginTxHex
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L53)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L58)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L63)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L68)

CSV timelock in blocks for the PegIn output.

###### Inherited from

```ts
SignPayoutBaseParams.timelockPegin
```

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L75)

Depositor's BTC public key (x-only, 64-char hex).
This should be the public key that was used when creating the vault,
as stored on-chain. If not provided, will be fetched from the wallet.

###### Inherited from

```ts
SignPayoutBaseParams.depositorBtcPubkey
```

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L89)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:95](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L95)

Assert transaction hex.
Payout input 1 references Assert output 0.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L101)

Result of signing a payout transaction.

#### Properties

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L105)

64-byte Schnorr signature (128 hex characters).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L110)

Depositor's BTC public key used for signing.

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L63)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L67)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L72)

Bitcoin wallet for signing peg-in transactions.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L78)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L84)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L89)

Vault contract addresses.

###### btcVaultsManager

```ts
btcVaultsManager: `0x${string}`;
```

BTCVaultsManager contract address on Ethereum.

##### mempoolApiUrl

```ts
mempoolApiUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L101)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

***

### PreparePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L107)

Parameters for the pegin flow (pre-pegin + pegin transactions).

#### Properties

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:111](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L111)

Amount to peg in (in satoshis).

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:117](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L117)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:123](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L123)

Vault keeper BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:129](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L129)

Universal challenger BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L134)

CSV timelock in blocks for the PegIn vault output.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:139](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L139)

CSV timelock in blocks for the Pre-PegIn HTLC refund path.

##### hashH

```ts
hashH: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:145](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L145)

SHA256 hash commitment for the HTLC (64 hex chars = 32 bytes).
Generated by the depositor as H = SHA256(secret).

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L150)

Protocol fee rate in sat/vB from the contract offchain params. Used by WASM for computing depositorClaimValue and min pegin fee.

##### mempoolFeeRate

```ts
mempoolFeeRate: number;
```

Mempool fee rate in sat/vB for funding the Pre-PegIn transaction. Used for UTXO selection and change calculation.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L160)

M in M-of-N council multisig (from contract params).

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L165)

N in M-of-N council multisig (from contract params).

##### availableUTXOs

```ts
availableUTXOs: readonly UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L170)

Available UTXOs from the depositor's wallet for funding the Pre-PegIn transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:175](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L175)

Bitcoin address for receiving change from the Pre-PegIn transaction.

***

### PreparePeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:181](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L181)

Result of preparing a pegin.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L186)

Funded but unsigned Pre-PegIn transaction hex.
Sign and broadcast this AFTER registering on Ethereum.

##### htlcValue

```ts
htlcValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:191](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L191)

Pre-PegIn HTLC value in satoshis (amount the UTXOs cover).

##### signedPeginInputPsbtHex

```ts
signedPeginInputPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:197](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L197)

PegIn transaction hex with depositor's HTLC leaf 0 signature embedded in the PSBT.
Submit the extracted signature to the vault provider.

##### peginInputSignature

```ts
peginInputSignature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:203](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L203)

Depositor's Schnorr signature over PegIn input 0 (HTLC leaf 0), 128 hex chars.
This is submitted to the contract via the VP's signPeginInput batch.

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:208](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L208)

Vault script pubkey hex — used in the ETH registration call.

##### prePeginTxid

```ts
prePeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:213](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L213)

Funded Pre-PegIn transaction ID.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:219](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L219)

PegIn transaction hex. Pass to registerPeginOnChain as `depositorSignedPeginTx`
so the contract computes the correct vault ID from the pegin txid.

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:224](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L224)

PegIn transaction ID (stable — signing does not change it).

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:229](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L229)

UTXOs selected to fund the Pre-PegIn transaction.

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:234](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L234)

Transaction fee in satoshis.

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:239](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L239)

Change amount in satoshis (if any).

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:246](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L246)

Parameters for signing and broadcasting a transaction.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:250](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L250)

Funded Pre-PegIn transaction hex from preparePegin().

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:257](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L257)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.
Required for Taproot signing.

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:263](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L263)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:268](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L268)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:273](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L273)

Unsigned Pre-PegIn transaction hex (submitted to contract for data availability).

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:278](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L278)

Depositor-signed PegIn transaction hex (submitted to contract; vault ID derived from this).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:283](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L283)

Vault provider's Ethereum address.

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:288](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L288)

SHA256 hashlock for HTLC activation (bytes32 hex with 0x prefix).

##### onPopSigned()?

```ts
optional onPopSigned: () => void | Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:293](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L293)

Optional callback invoked after PoP signing completes but before ETH transaction.

###### Returns

`void` \| `Promise`\<`void`\>

##### depositorPayoutBtcAddress?

```ts
optional depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:302](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L302)

Depositor's BTC payout address (e.g. bc1p..., bc1q...).
Converted to scriptPubKey internally via bitcoinjs-lib.

If omitted, defaults to the connected BTC wallet's address
via `btcWallet.getAddress()`.

##### depositorLamportPkHash

```ts
depositorLamportPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:305](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L305)

Keccak256 hash of the depositor's Lamport public key (bytes32)

##### preSignedBtcPopSignature?

```ts
optional preSignedBtcPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:312](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L312)

Pre-signed BTC PoP signature (hex with 0x prefix).
When provided, the BTC wallet signing step is skipped and this signature is used directly.
Useful for multi-vault deposits where PoP only needs to be signed once.

##### depositorSecretHash?

```ts
optional depositorSecretHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:319](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L319)

SHA-256 hash of the depositor's secret (bytes32).
Required for the new peg-in flow deposits.
TODO: Wire into submitPeginRequest contract call when contract ABI is updated to support the new peg-in flow.

***

### RegisterPeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:325](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L325)

Result of registering a peg-in on Ethereum.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:329](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L329)

Ethereum transaction hash for the peg-in registration.

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:336](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L336)

Vault identifier used in the BTCVaultsManager contract.
This is the Bitcoin transaction hash with 0x prefix for Ethereum compatibility.
Corresponds to btcTxHash from PeginResult, but formatted as Hex with '0x' prefix.

##### btcPopSignature

```ts
btcPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:342](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L342)

The BTC PoP signature used for this registration (hex with 0x prefix).
Returned so callers can reuse it for subsequent pegins without re-signing.

***

### UTXO

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L21)

Unspent Transaction Output (UTXO) for funding peg-in transactions.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L25)

Transaction ID of the UTXO (64-char hex without 0x prefix).

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L30)

Output index within the transaction.

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L35)

Value in satoshis.

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L40)

Script public key hex.

## Type Aliases

### BitcoinNetwork

```ts
type BitcoinNetwork = "mainnet" | "testnet" | "signet";
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:5](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L5)

Bitcoin network types.
Using string literal union for maximum compatibility with wallet providers.
