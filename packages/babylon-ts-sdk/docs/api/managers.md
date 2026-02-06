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
Orchestrates the peg-in deposit flow:
- [preparePegin()](#preparepegin) - Build and fund transaction
- [registerPeginOnChain()](#registerpeginonchain) - Submit to Ethereum
- [signAndBroadcast()](#signandbroadcast) - Broadcast to Bitcoin

### [PayoutManager](#payoutmanager)
Signs payout authorization transactions (Step 3 of peg-in).
The depositor must sign **BOTH** payout transactions for each claimer:
- [signPayoutOptimisticTransaction()](#signpayoutoptimistictransaction) - Sign optimistic path (uses Claim tx as reference)
- [signPayoutTransaction()](#signpayouttransaction) - Sign challenge path (uses Assert tx as reference)

## Complete Peg-in Flow

The 4-step peg-in flow uses both managers:

| Step | Manager | Method |
|------|---------|--------|
| 1 | PeginManager | `preparePegin()` |
| 2 | PeginManager | `registerPeginOnChain()` |
| 3 | PayoutManager | `signPayoutOptimisticTransaction()` + `signPayoutTransaction()` |
| 4 | PeginManager | `signAndBroadcast()` |

**Step 3 Details:** The vault provider provides 4 transactions per claimer:
- `claim_tx` - Claim transaction
- `payout_optimistic_tx` - PayoutOptimistic transaction
- `assert_tx` - Assert transaction
- `payout_tx` - Payout transaction

You must sign both PayoutOptimistic (uses claim_tx as input reference) and
Payout (uses assert_tx as input reference) for each claimer.

## See

[Managers Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md)

## Classes

### PayoutManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:156](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L156)

High-level manager for payout transaction signing.

Supports both payout paths:
- Optimistic path: Use [signPayoutOptimisticTransaction](#signpayoutoptimistictransaction) with Claim tx
- Challenge path: Use [signPayoutTransaction](#signpayouttransaction) with Assert tx

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
(from the peg-in tx). Input 1 (from the claim/assert tx) is signed by the vault provider.

#### See

 - [PeginManager](#peginmanager) - For the complete peg-in flow context
 - [buildPayoutPsbt](primitives.md#buildpayoutpsbt) - Lower-level primitive used internally
 - [extractPayoutSignature](primitives.md#extractpayoutsignature) - Signature extraction primitive

#### Constructors

##### Constructor

```ts
new PayoutManager(config): PayoutManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:164](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L164)

Creates a new PayoutManager instance.

###### Parameters

###### config

[`PayoutManagerConfig`](#payoutmanagerconfig)

Manager configuration including wallet

###### Returns

[`PayoutManager`](#payoutmanager)

#### Methods

##### signPayoutOptimisticTransaction()

```ts
signPayoutOptimisticTransaction(params): Promise<PayoutSignatureResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:190](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L190)

Signs a PayoutOptimistic transaction and extracts the Schnorr signature.

PayoutOptimistic is used in the **optimistic path** when no challenge occurs:
1. Vault provider submits Claim transaction
2. Challenge period passes without challenge
3. PayoutOptimistic can be executed (references Claim tx)

This method orchestrates the following steps:
1. Get wallet's public key and convert to x-only format
2. Validate wallet pubkey matches on-chain depositor pubkey (if provided)
3. Build unsigned PSBT using primitives
4. Sign PSBT via btcWallet.signPsbt()
5. Extract 64-byte Schnorr signature using primitives

The returned signature can be submitted to the vault provider API.

###### Parameters

###### params

[`SignPayoutOptimisticParams`](#signpayoutoptimisticparams)

PayoutOptimistic signing parameters

###### Returns

`Promise`\<[`PayoutSignatureResult`](#payoutsignatureresult)\>

Signature result with 64-byte Schnorr signature and depositor pubkey

###### Throws

Error if wallet pubkey doesn't match depositor pubkey

###### Throws

Error if wallet operations fail or signature extraction fails

##### signPayoutTransaction()

```ts
signPayoutTransaction(params): Promise<PayoutSignatureResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:262](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L262)

Signs a Payout transaction (challenge path) and extracts the Schnorr signature.

Payout is used in the **challenge path** when the claimer proves validity:
1. Vault provider submits Claim transaction
2. Challenge is raised during challenge period
3. Claimer submits Assert transaction to prove validity
4. Payout can be executed (references Assert tx)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:316](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L316)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### supportsBatchSigning()

```ts
supportsBatchSigning(): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:325](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L325)

Checks if the wallet supports batch signing (signPsbts).

###### Returns

`boolean`

true if batch signing is supported

##### signPayoutTransactionsBatch()

```ts
signPayoutTransactionsBatch(transactions): Promise<object[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:338](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L338)

Batch signs multiple payout transactions (both PayoutOptimistic and Payout).
This allows signing all transactions with a single wallet interaction.

###### Parameters

###### transactions

`object`[]

Array of transaction pairs to sign

###### Returns

`Promise`\<`object`[]\>

Array of signature results matching input order

###### Throws

Error if wallet doesn't support batch signing

###### Throws

Error if any signing operation fails

***

### PeginManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:277](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L277)

Manager for orchestrating peg-in operations.

This manager provides a high-level API for creating peg-in transactions
by coordinating between SDK primitives, utilities, and wallet interfaces.

#### Remarks

The complete peg-in flow consists of 4 steps:

| Step | Method | Description |
|------|--------|-------------|
| 1 | [preparePegin](#preparepegin) | Build and fund the transaction |
| 2 | [registerPeginOnChain](#registerpeginonchain) | Submit to Ethereum contract with PoP |
| 3 | [PayoutManager](#payoutmanager) | Sign BOTH payout authorizations |
| 4 | [signAndBroadcast](#signandbroadcast) | Sign and broadcast to Bitcoin network |

**Important:** Step 3 uses [PayoutManager](#payoutmanager), not this class. After step 2,
the vault provider prepares 4 transactions per claimer:
- `claim_tx` - Claim transaction
- `payout_optimistic_tx` - PayoutOptimistic transaction
- `assert_tx` - Assert transaction
- `payout_tx` - Payout transaction

You must sign **BOTH** PayoutOptimistic and Payout transactions for each claimer:
- [PayoutManager.signPayoutOptimisticTransaction](#signpayoutoptimistictransaction) - uses claim_tx as input reference
- [PayoutManager.signPayoutTransaction](#signpayouttransaction) - uses assert_tx as input reference

Submit all signatures to the vault provider before proceeding to step 4.

#### See

 - [PayoutManager](#payoutmanager) - Required for Step 3 (payout authorization)
 - [buildPeginPsbt](primitives.md#buildpeginpsbt) - Lower-level primitive for custom implementations
 - [Managers Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md)

#### Constructors

##### Constructor

```ts
new PeginManager(config): PeginManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:285](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L285)

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
preparePegin(params): Promise<PeginResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:305](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L305)

Prepares a peg-in transaction by building and funding it.

This method orchestrates the following steps:
1. Get depositor BTC public key from wallet
2. Build unfunded PSBT using primitives
3. Select UTXOs using iterative fee calculation
4. Fund transaction by adding inputs and change output

The returned transaction is funded but unsigned. Use `signAndBroadcast()`
to complete the Bitcoin side, and `registerPeginOnChain()` for Ethereum.

###### Parameters

###### params

[`CreatePeginParams`](#createpeginparams)

Peg-in parameters including amount, provider, UTXOs, and fee rate

###### Returns

`Promise`\<[`PeginResult`](#peginresult)\>

Peg-in result with funded transaction and selection details

###### Throws

Error if wallet operations fail or insufficient funds

##### signAndBroadcast()

```ts
signAndBroadcast(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:375](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L375)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:489](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L489)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:640](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L640)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:649](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L649)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L31)

Configuration for the PayoutManager.

#### Properties

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L35)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L40)

Bitcoin wallet for signing payout transactions.

***

### SignPayoutOptimisticParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L82)

Parameters for signing a PayoutOptimistic transaction.

PayoutOptimistic is used in the optimistic path when no challenge occurs.
Input 1 references the Claim transaction.

#### Extends

- `SignPayoutBaseParams`

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L51)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L56)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L61)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L66)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L73)

Depositor's BTC public key (x-only, 64-char hex).
This should be the public key that was used when creating the vault,
as stored on-chain. If not provided, will be fetched from the wallet.

###### Inherited from

```ts
SignPayoutBaseParams.depositorBtcPubkey
```

##### payoutOptimisticTxHex

```ts
payoutOptimisticTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L87)

PayoutOptimistic transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### claimTxHex

```ts
claimTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:93](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L93)

Claim transaction hex.
PayoutOptimistic input 1 references Claim output 0.

***

### SignPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L102)

Parameters for signing a Payout transaction (challenge path).

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Extends

- `SignPayoutBaseParams`

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L51)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L56)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L61)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L66)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L73)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L107)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:113](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L113)

Assert transaction hex.
Payout input 1 references Assert output 0.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:119](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L119)

Result of signing a payout transaction.

#### Properties

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:123](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L123)

64-byte Schnorr signature (128 hex characters).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:128](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L128)

Depositor's BTC public key used for signing.

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L51)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L55)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L60)

Bitcoin wallet for signing peg-in transactions.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L66)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L72)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L77)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L89)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

***

### CreatePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:95](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L95)

Parameters for creating a peg-in transaction.

#### Properties

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L99)

Amount to peg in (in satoshis).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L104)

Vault provider's Ethereum address.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L110)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:116](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L116)

Vault keeper BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L122)

Universal challenger BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### availableUTXOs

```ts
availableUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:127](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L127)

Available UTXOs from the depositor's wallet for funding the transaction.

##### feeRate

```ts
feeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:132](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L132)

Fee rate in satoshis per vbyte for the transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:137](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L137)

Bitcoin address for receiving change from the transaction.

***

### PeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L143)

Result of a peg-in preparation.

#### Properties

##### btcTxHash

```ts
btcTxHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L149)

Bitcoin transaction hash (without 0x prefix).
This is the hash of the unsigned transaction and will NOT change after signing.
Used as the unique vault identifier in the contract.

##### fundedTxHex

```ts
fundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:155](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L155)

Funded but unsigned transaction hex.
This transaction has inputs and outputs but is not yet signed.

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L160)

Vault script pubkey hex.

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L165)

UTXOs selected for funding the transaction.

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L170)

Transaction fee in satoshis.

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:175](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L175)

Change amount in satoshis (if any).

##### ethTxHash

```ts
ethTxHash: `0x${string}` | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:181](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L181)

Ethereum transaction hash (peg-in registration).
Will be null until registerPeginOnChain is called.

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:187](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L187)

Parameters for signing and broadcasting a transaction.

#### Properties

##### fundedTxHex

```ts
fundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:191](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L191)

Funded transaction hex from preparePegin().

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:198](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L198)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.
Required for Taproot signing.

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:204](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L204)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:209](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L209)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.

##### unsignedBtcTx

```ts
unsignedBtcTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:214](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L214)

Funded but unsigned BTC transaction hex.

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:219](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L219)

Vault provider's Ethereum address.

##### onPopSigned()?

```ts
optional onPopSigned: () => void | Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:224](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L224)

Optional callback invoked after PoP signing completes but before ETH transaction.

###### Returns

`void` \| `Promise`\<`void`\>

***

### RegisterPeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:230](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L230)

Result of registering a peg-in on Ethereum.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:234](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L234)

Ethereum transaction hash for the peg-in registration.

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:241](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L241)

Vault identifier used in the BTCVaultsManager contract.
This is the Bitcoin transaction hash with 0x prefix for Ethereum compatibility.
Corresponds to btcTxHash from PeginResult, but formatted as Hex with '0x' prefix.

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
