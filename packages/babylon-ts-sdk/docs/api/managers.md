[@babylonlabs-io/ts-sdk](README.md) / managers

# managers

Manager Layer - Wallet Orchestration (Level 2)

High-level managers that orchestrate complex flows using primitives and utilities.
These managers accept wallet interfaces and handle the complete operation lifecycle.

## Classes

### PayoutManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:92](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L92)

High-level manager for payout transaction signing.

#### Constructors

##### Constructor

```ts
new PayoutManager(config): PayoutManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:100](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L100)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:174](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L174)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network-3)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### signPayoutTransaction()

```ts
signPayoutTransaction(params): Promise<PayoutSignatureResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:121](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L121)

Signs a payout transaction and extracts the Schnorr signature.

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:265](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L265)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:273](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L273)

Creates a new PeginManager instance.

###### Parameters

###### config

[`PeginManagerConfig`](#peginmanagerconfig)

Manager configuration including wallets and contract addresses

###### Returns

[`PeginManager`](#peginmanager)

#### Methods

##### estimateEthGas()

```ts
estimateEthGas(params): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:596](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L596)

Estimates the ETH gas required for registering a peg-in on Ethereum.

This method encodes the contract calldata using a dummy signature (since
the actual signature isn't available before signing) and estimates gas
using eth_estimateGas. The dummy signature has the same size as a real
Schnorr signature (64 bytes), so the gas estimate is accurate.

Use this to show users the estimated ETH fee before they confirm the deposit.

###### Parameters

###### params

[`EstimateEthGasParams`](#estimateethgasparams)

Parameters for gas estimation

###### Returns

`Promise`\<`bigint`\>

Estimated gas in gas units (as bigint)

###### Throws

Error if estimation fails

##### getNetwork()

```ts
getNetwork(): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:635](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L635)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network-3)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:644](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L644)

Gets the configured BTCVaultsManager contract address.

###### Returns

`` `0x${string}` ``

The Ethereum address of the BTCVaultsManager contract

##### preparePegin()

```ts
preparePegin(params): Promise<PeginResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:293](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L293)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:472](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L472)

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

`Promise`\<[`RegisterPeginResult`](#registerpeginresult)\>

Result containing Ethereum transaction hash and vault ID

###### Throws

Error if signing or transaction fails

###### Throws

Error if vault already exists

##### signAndBroadcast()

```ts
signAndBroadcast(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:360](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L360)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:89](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L89)

Parameters for creating a peg-in transaction.

#### Properties

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:93](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L93)

Amount to peg in (in satoshis).

##### availableUTXOs

```ts
availableUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:115](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L115)

Available UTXOs from the depositor's wallet for funding the transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:125](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L125)

Bitcoin address for receiving change from the transaction.

##### feeRate

```ts
feeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:120](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L120)

Fee rate in satoshis per vbyte for the transaction.

##### liquidatorBtcPubkeys

```ts
liquidatorBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:110](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L110)

Liquidator BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:98](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L98)

Vault provider's Ethereum address.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:104](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L104)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

***

### EstimateEthGasParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:235](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L235)

Parameters for estimating ETH gas for peg-in registration.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:240](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L240)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.

##### unsignedBtcTx

```ts
unsignedBtcTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:246](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L246)

Funded but unsigned BTC transaction hex.
Can be provided with or without "0x" prefix.

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:251](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L251)

Vault provider's Ethereum address.

***

### PayoutManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:22](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L22)

Configuration for the PayoutManager.

#### Properties

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:31](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L31)

Bitcoin wallet for signing payout transactions.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:26](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L26)

Bitcoin network to use for transactions.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:77](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L77)

Result of signing a payout transaction.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:86](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L86)

Depositor's BTC public key used for signing.

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:81](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L81)

64-byte Schnorr signature (128 hex characters).

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:45](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L45)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:49](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L49)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:54](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L54)

Bitcoin wallet for signing peg-in transactions.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:66](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L66)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:60](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L60)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### mempoolApiUrl

```ts
mempoolApiUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:83](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L83)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:71](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L71)

Vault contract addresses.

###### btcVaultsManager

```ts
btcVaultsManager: `0x${string}`;
```

BTCVaultsManager contract address on Ethereum.

***

### PeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:131](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L131)

Result of a peg-in preparation.

#### Properties

##### btcTxHash

```ts
btcTxHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:137](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L137)

Bitcoin transaction hash (without 0x prefix).
This is the hash of the unsigned transaction and will NOT change after signing.
Used as the unique vault identifier in the contract.

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:163](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L163)

Change amount in satoshis (if any).

##### ethTxHash

```ts
ethTxHash: `0x${string}` | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:169](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L169)

Ethereum transaction hash (peg-in registration).
Will be null until registerPeginOnChain is called.

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:158](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L158)

Transaction fee in satoshis.

##### fundedTxHex

```ts
fundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:143](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L143)

Funded but unsigned transaction hex.
This transaction has inputs and outputs but is not yet signed.

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:153](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L153)

UTXOs selected for funding the transaction.

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:148](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L148)

Vault script pubkey hex.

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:192](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L192)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:197](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L197)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.

##### onPopSigned()?

```ts
optional onPopSigned: () => void | Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:212](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L212)

Optional callback invoked after PoP signing completes but before ETH transaction.

###### Returns

`void` \| `Promise`\<`void`\>

##### unsignedBtcTx

```ts
unsignedBtcTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:202](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L202)

Funded but unsigned BTC transaction hex.

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:207](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L207)

Vault provider's Ethereum address.

***

### RegisterPeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:218](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L218)

Result of registering a peg-in on Ethereum.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:222](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L222)

Ethereum transaction hash for the peg-in registration.

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:229](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L229)

Vault identifier used in the BTCVaultsManager contract.
This is the Bitcoin transaction hash with 0x prefix for Ethereum compatibility.
Corresponds to btcTxHash from PeginResult, but formatted as Hex with '0x' prefix.

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:175](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L175)

Parameters for signing and broadcasting a transaction.

#### Properties

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:186](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L186)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.
Required for Taproot signing.

##### fundedTxHex

```ts
fundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:179](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L179)

Funded transaction hex from preparePegin().

***

### SignPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:37](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L37)

Parameters for signing a payout transaction.

#### Properties

##### claimTxHex

```ts
claimTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:54](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L54)

Claim transaction hex.
Required for payout script generation, obtained from vault provider.

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:71](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L71)

Depositor's BTC public key (x-only, 64-char hex).
This should be the public key that was used when creating the vault,
as stored on-chain. If not provided, will be fetched from the wallet.

##### liquidatorBtcPubkeys

```ts
liquidatorBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:64](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L64)

Liquidator BTC public keys (x-only, 64-char hex).

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:42](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L42)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:48](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L48)

Peg-in transaction hex.
The original transaction that created the vault output being spent.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:59](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L59)

Vault provider's BTC public key (x-only, 64-char hex).
