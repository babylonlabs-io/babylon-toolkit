[@babylonlabs-io/ts-sdk](README.md) / managers

# managers

Manager Layer - Wallet Orchestration (Level 2)

High-level managers that orchestrate complex flows using primitives and utilities.
These managers accept wallet interfaces and handle the complete operation lifecycle.

## Classes

### PayoutManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:134](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L134)

High-level manager for payout transaction signing.

Supports both payout paths:
- Optimistic path: Use `signPayoutOptimisticTransaction()` with Claim tx
- Challenge path: Use `signPayoutTransaction()` with Assert tx

#### Constructors

##### Constructor

```ts
new PayoutManager(config): PayoutManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:142](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L142)

Creates a new PayoutManager instance.

###### Parameters

###### config

[`PayoutManagerConfig`](#payoutmanagerconfig)

Manager configuration including wallet

###### Returns

[`PayoutManager`](#payoutmanager)

#### Methods

##### getNetwork()

```ts
getNetwork(): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:294](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L294)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network-4)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### signPayoutOptimisticTransaction()

```ts
signPayoutOptimisticTransaction(params): Promise<PayoutSignatureResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:168](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L168)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:240](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L240)

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

***

### PeginManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:245](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L245)

Manager for orchestrating peg-in operations.

This manager provides a high-level API for creating peg-in transactions
by coordinating between SDK primitives, utilities, and wallet interfaces.

The complete peg-in flow consists of:
1. preparePegin() - Build and fund the transaction
2. registerPeginOnChain() - Submit to Ethereum contract
3. signAndBroadcast() - Sign and broadcast to Bitcoin network

#### Constructors

##### Constructor

```ts
new PeginManager(config): PeginManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:253](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L253)

Creates a new PeginManager instance.

###### Parameters

###### config

[`PeginManagerConfig`](#peginmanagerconfig)

Manager configuration including wallets and contract addresses

###### Returns

[`PeginManager`](#peginmanager)

#### Methods

##### getNetwork()

```ts
getNetwork(): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:585](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L585)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network-4)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:594](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L594)

Gets the configured BTCVaultsManager contract address.

###### Returns

`` `0x${string}` ``

The Ethereum address of the BTCVaultsManager contract

##### preparePegin()

```ts
preparePegin(params): Promise<PeginResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:273](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L273)

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

##### registerPeginOnChain()

```ts
registerPeginOnChain(params): Promise<RegisterPeginResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:455](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L455)

Registers a peg-in on Ethereum by calling the BTCVaultsManager contract.

This method:
1. Gets depositor ETH address from wallet
2. Creates proof of possession (BTC signature of ETH address)
3. Checks if vault already exists (pre-flight check)
4. Encodes the contract call using viem
5. Sends transaction via ethWallet.sendTransaction()

###### Parameters

###### params

[`RegisterPeginParams`](#registerpeginparams)

Registration parameters including BTC pubkey and unsigned tx

###### Returns

`Promise`\<`RegisterPeginResult`\>

Result containing Ethereum transaction hash and vault ID

###### Throws

Error if signing or transaction fails

###### Throws

Error if vault already exists

##### signAndBroadcast()

```ts
signAndBroadcast(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:343](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L343)

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

## Interfaces

### CreatePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:85](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L85)

Parameters for creating a peg-in transaction.

#### Properties

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:89](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L89)

Amount to peg in (in satoshis).

##### availableUTXOs

```ts
availableUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:117](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L117)

Available UTXOs from the depositor's wallet for funding the transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:127](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L127)

Bitcoin address for receiving change from the transaction.

##### feeRate

```ts
feeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:122](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L122)

Fee rate in satoshis per vbyte for the transaction.

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:112](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L112)

Universal challenger BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:106](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L106)

Vault keeper BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:94](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L94)

Vault provider's Ethereum address.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:100](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L100)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

***

### PayoutManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:27](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L27)

Configuration for the PayoutManager.

#### Properties

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:36](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L36)

Bitcoin wallet for signing payout transactions.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:31](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L31)

Bitcoin network to use for transactions.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:115](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L115)

Result of signing a payout transaction.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:124](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L124)

Depositor's BTC public key used for signing.

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:119](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L119)

64-byte Schnorr signature (128 hex characters).

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:41](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L41)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:45](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L45)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:50](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L50)

Bitcoin wallet for signing peg-in transactions.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:62](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L62)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:56](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L56)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### mempoolApiUrl

```ts
mempoolApiUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:79](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L79)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:67](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L67)

Vault contract addresses.

###### btcVaultsManager

```ts
btcVaultsManager: `0x${string}`;
```

BTCVaultsManager contract address on Ethereum.

***

### PeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:133](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L133)

Result of a peg-in preparation.

#### Properties

##### btcTxHash

```ts
btcTxHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:139](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L139)

Bitcoin transaction hash (without 0x prefix).
This is the hash of the unsigned transaction and will NOT change after signing.
Used as the unique vault identifier in the contract.

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:165](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L165)

Change amount in satoshis (if any).

##### ethTxHash

```ts
ethTxHash: `0x${string}` | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:171](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L171)

Ethereum transaction hash (peg-in registration).
Will be null until registerPeginOnChain is called.

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:160](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L160)

Transaction fee in satoshis.

##### fundedTxHex

```ts
fundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:145](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L145)

Funded but unsigned transaction hex.
This transaction has inputs and outputs but is not yet signed.

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:155](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L155)

UTXOs selected for funding the transaction.

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:150](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L150)

Vault script pubkey hex.

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:194](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L194)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:199](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L199)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.

##### onPopSigned()?

```ts
optional onPopSigned: () => void | Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:214](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L214)

Optional callback invoked after PoP signing completes but before ETH transaction.

###### Returns

`void` \| `Promise`\<`void`\>

##### unsignedBtcTx

```ts
unsignedBtcTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:204](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L204)

Funded but unsigned BTC transaction hex.

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:209](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L209)

Vault provider's Ethereum address.

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:177](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L177)

Parameters for signing and broadcasting a transaction.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:188](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L188)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.
Required for Taproot signing.

##### fundedTxHex

```ts
fundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:181](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L181)

Funded transaction hex from preparePegin().

***

### SignPayoutOptimisticParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:78](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L78)

Parameters for signing a PayoutOptimistic transaction.

PayoutOptimistic is used in the optimistic path when no challenge occurs.
Input 1 references the Claim transaction.

#### Extends

- `SignPayoutBaseParams`

#### Properties

##### claimTxHex

```ts
claimTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:89](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L89)

Claim transaction hex.
PayoutOptimistic input 1 references Claim output 0.

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:69](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L69)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:83](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L83)

PayoutOptimistic transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:47](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L47)

Peg-in transaction hex.
The original transaction that created the vault output being spent.

###### Inherited from

```ts
SignPayoutBaseParams.peginTxHex
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:62](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L62)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:57](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L57)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:52](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L52)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

***

### SignPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:98](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L98)

Parameters for signing a Payout transaction (challenge path).

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Extends

- `SignPayoutBaseParams`

#### Properties

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:109](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L109)

Assert transaction hex.
Payout input 1 references Assert output 0.

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:69](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L69)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:103](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L103)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:47](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L47)

Peg-in transaction hex.
The original transaction that created the vault output being spent.

###### Inherited from

```ts
SignPayoutBaseParams.peginTxHex
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:62](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L62)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:57](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L57)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:52](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L52)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

