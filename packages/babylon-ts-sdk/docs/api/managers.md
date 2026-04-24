[@babylonlabs-io/ts-sdk](README.md) / managers

# managers

Wallet-owning orchestration for the vault lifecycle. A vault goes from creation
to `ACTIVE` through six phases — [Managers Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/managers.md)
walks through them. A vault at `VERIFIED` is not done: the depositor must
reveal the HTLC secret via `activateVault()` (services layer) or the vault
expires.

| # | Phase | SDK entry point | Contract status after |
|---|-------|-----------------|-----------------------|
| 1 | Prepare Pre-PegIn + PegIn txs | `PeginManager.preparePegin()` | n/a (off-chain) |
| 2 | Sign BTC proof-of-possession | `PeginManager.signProofOfPossession()` | n/a (off-chain, once per session) |
| 3 | Register on Ethereum | `PeginManager.registerPeginOnChain()` | `PENDING` |
| 4 | Broadcast Pre-PegIn on Bitcoin | `PeginManager.signAndBroadcast()` | still `PENDING` until VP observes the tx |
| 5 | Sign payout authorisations | `pollAndSignPayouts()` (services, delegates to `PayoutManager`) | `PENDING` → `VERIFIED` |
| 6 | Activate by revealing HTLC secret | `activateVault()` (services) | `VERIFIED` → `ACTIVE` |

Optional exit after the CSV timelock expires: `buildAndBroadcastRefund()` (services).

## Classes

### PayoutManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L151)

High-level manager for payout transaction signing.

#### Remarks

After registering your peg-in on Ethereum (Step 3), the vault provider prepares
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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:159](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L159)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:185](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L185)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:234](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L234)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### supportsBatchSigning()

```ts
supportsBatchSigning(): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:243](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L243)

Checks if the wallet supports batch signing (signPsbts).

###### Returns

`boolean`

true if batch signing is supported

##### signPayoutTransactionsBatch()

```ts
signPayoutTransactionsBatch(transactions): Promise<object[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:256](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L256)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:524](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L524)

#### Constructors

##### Constructor

```ts
new PeginManager(config): PeginManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:532](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L532)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:556](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L556)

Prepares a peg-in by building the Pre-PegIn HTLC transaction,
funding it, constructing the PegIn transaction, and signing the PegIn input.

This method orchestrates the following steps:
1. Get depositor BTC public key from wallet
2. Build unfunded Pre-PegIn transaction (HTLC output) using primitives
3. Select UTXOs to cover the HTLC value
4. Fund the Pre-PegIn transaction
5. Derive the PegIn transaction from the funded Pre-PegIn tx
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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:744](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L744)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:887](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L887)

Registers a peg-in on Ethereum by calling the BTCVaultRegistry contract.

This method:
1. Re-verifies the PopSignature against the currently connected ETH
   and BTC wallets — refuses to proceed if either has changed
2. Derives vault ID and checks if it already exists (pre-flight)
3. Encodes the contract call using viem
4. Estimates gas (catches contract errors early with proper revert
   reasons)
5. Sends transaction with pre-estimated gas via
   ethWallet.sendTransaction()

The PopSignature must be obtained via
[signProofOfPossession](#signproofofpossession) before this call.

###### Parameters

###### params

[`RegisterPeginParams`](#registerpeginparams)

Registration parameters including the PopSignature
                and the prepared Pre-PegIn / PegIn transactions

###### Returns

`Promise`\<[`RegisterPeginResult`](#registerpeginresult)\>

Result containing Ethereum transaction hash and vault ID

###### Throws

Error if the PopSignature does not match the connected wallets

###### Throws

Error if the vault already exists

###### Throws

Error if contract simulation fails (e.g., invalid signature,
        unauthorized)

##### registerPeginBatchOnChain()

```ts
registerPeginBatchOnChain(params): Promise<RegisterPeginBatchResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1048](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1048)

Register multiple pegins on Ethereum in a single transaction.

Uses the contract's submitPeginRequestBatch() to submit all vault
registrations atomically. All vaults must share the same vault provider.
The PoP signature is signed once and included in each request.

###### Parameters

###### params

[`RegisterPeginBatchParams`](#registerpeginbatchparams)

Batch registration parameters

###### Returns

`Promise`\<[`RegisterPeginBatchResult`](#registerpeginbatchresult)\>

Batch result with per-vault IDs and single ETH tx hash

##### signProofOfPossession()

```ts
signProofOfPossession(): Promise<PopSignature>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1278](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1278)

Sign a BIP-322 BTC Proof-of-Possession binding the connected BTC
wallet to the connected ETH account for this chain and vault
registry. The returned [PopSignature](#popsignature) can be reused across
every register call in the same session.

###### Returns

`Promise`\<[`PopSignature`](#popsignature)\>

##### getNetwork()

```ts
getNetwork(): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1326](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1326)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1335](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1335)

Gets the configured BTCVaultRegistry contract address.

###### Returns

`` `0x${string}` ``

The Ethereum address of the BTCVaultRegistry contract

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

##### useTweakedSigner?

```ts
optional useTweakedSigner: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:34](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L34)

Whether the wallet should sign with the tweaked (key-path) signer.
Set `false` for Taproot script-path spends, where signing uses the
untweaked internal key. If omitted, the wallet's default behavior
applies.

##### ~~disableTweakSigner?~~

```ts
optional disableTweakSigner: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:45](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L45)

###### Deprecated

Use `useTweakedSigner` instead. `disableTweakSigner: true`
is equivalent to `useTweakedSigner: false`; `useTweakedSigner` takes
precedence when both are set.

`useTweakedSigner` is the canonical field used by UniSat and newer OKX
wallet versions. Migrating aligns our interface with the wallet-side
convention and avoids the historical divergence in OKX's
`disableTweakSigner` implementation.

***

### SignPsbtOptions

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:51](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L51)

SignPsbt options for advanced signing scenarios.

#### Properties

##### autoFinalized?

```ts
optional autoFinalized: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:53](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L53)

Whether to automatically finalize the PSBT after signing

##### signInputs?

```ts
optional signInputs: SignInputOptions[];
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:59](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L59)

Specific inputs to sign.
If not provided, wallet will attempt to sign all inputs it can.
Use this to restrict signing to specific inputs (e.g., only depositor's input).

##### contracts?

```ts
optional contracts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:61](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L61)

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

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:68](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L68)

Action metadata.

###### name

```ts
name: string;
```

Action name for tracking.

***

### BitcoinWallet

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:79](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L79)

This interface is designed to be compatible with @babylonlabs-io/wallet-connector's IBTCProvider

Supports Unisat, Ledger, OKX, OneKey, Keystone, and other Bitcoin wallets.

#### Methods

##### getPublicKeyHex()

```ts
getPublicKeyHex(): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:89](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L89)

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

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:94](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L94)

Returns the wallet's Bitcoin address.

###### Returns

`Promise`\<`string`\>

##### signPsbt()

```ts
signPsbt(psbtHex, options?): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:103](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L103)

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

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:113](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L113)

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

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:125](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L125)

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

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:135](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L135)

Returns the Bitcoin network the wallet is connected to.

###### Returns

`Promise`\<[`BitcoinNetwork`](#bitcoinnetwork)\>

BitcoinNetwork enum value (MAINNET, TESTNET, SIGNET)

***

### PayoutManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L38)

Configuration for the PayoutManager.

#### Properties

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L42)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L47)

Bitcoin wallet for signing payout transactions.

***

### SignPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L101)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L58)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L63)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L68)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L73)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L78)

CSV timelock in blocks for the PegIn output.

###### Inherited from

```ts
SignPayoutBaseParams.timelockPegin
```

##### depositorBtcPubkey?

```ts
optional depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L85)

Depositor's BTC public key (x-only, 64-char hex).
This should be the public key that was used when creating the vault,
as stored on-chain. If not provided, will be fetched from the wallet.

###### Inherited from

```ts
SignPayoutBaseParams.depositorBtcPubkey
```

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L92)

The on-chain registered depositor payout scriptPubKey (hex, with or without 0x prefix).
Used to validate that the VP-provided payout transaction actually pays to the
correct depositor payout address before signing.

###### Inherited from

```ts
SignPayoutBaseParams.registeredPayoutScriptPubKey
```

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L106)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L112)

Assert transaction hex.
Payout input 1 references Assert output 0.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:118](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L118)

Result of signing a payout transaction.

#### Properties

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L122)

64-byte Schnorr signature (128 hex characters).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:127](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L127)

Depositor's BTC public key used for signing.

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L134)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:138](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L138)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L143)

Bitcoin wallet for signing peg-in transactions.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L149)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:155](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L155)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L160)

Vault contract addresses.

###### btcVaultRegistry

```ts
btcVaultRegistry: `0x${string}`;
```

BTCVaultRegistry contract address on Ethereum.

##### mempoolApiUrl

```ts
mempoolApiUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:172](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L172)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

***

### PreparePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:178](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L178)

Parameters for the pegin flow (pre-pegin + pegin transactions).

#### Properties

##### amounts

```ts
amounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:184](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L184)

Amounts to peg in per HTLC (in satoshis).
Must have the same length as `hashlocks`.
For single deposits, pass a single-element array.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:190](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L190)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:196](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L196)

Vault keeper BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:202](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L202)

Universal challenger BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:207](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L207)

CSV timelock in blocks for the PegIn vault output.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:212](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L212)

CSV timelock in blocks for the Pre-PegIn HTLC refund path.

##### hashlocks

```ts
hashlocks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:219](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L219)

SHA256 hash commitment(s) for the HTLC (64 hex chars = 32 bytes each).
Generated by the depositor as H = SHA256(secret).
For single deposits, pass a single-element array.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:225](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L225)

Protocol fee rate in sat/vB from the contract offchain params.
Used by WASM for computing depositorClaimValue and min pegin fee.

##### mempoolFeeRate

```ts
mempoolFeeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:231](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L231)

Mempool fee rate in sat/vB for funding the Pre-PegIn transaction.
Used for UTXO selection and change calculation.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:236](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L236)

M in M-of-N council multisig (from contract params).

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:241](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L241)

N in M-of-N council multisig (from contract params).

##### availableUTXOs

```ts
availableUTXOs: readonly UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:246](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L246)

Available UTXOs from the depositor's wallet for funding the Pre-PegIn transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:251](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L251)

Bitcoin address for receiving change from the Pre-PegIn transaction.

***

### PreparePeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:273](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L273)

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:279](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L279)

Funded, pre-witness Pre-PegIn tx hex. Pass this for register calls'
`unsignedPrePeginTx` — despite the contract-side name, the registry
stores the funded form so indexers can rebuild refund PSBTs.

##### prePeginTxid

```ts
prePeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:281](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L281)

Funded Pre-PegIn transaction ID

##### perVault

```ts
perVault: PerVaultPeginData[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:283](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L283)

Per-vault PegIn data — one entry per hashlock/amount

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:285](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L285)

UTXOs selected to fund the Pre-PegIn transaction

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:287](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L287)

Transaction fee in satoshis

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:289](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L289)

Change amount in satoshis (if any)

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:296](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L296)

Parameters for signing and broadcasting a transaction.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:300](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L300)

Funded Pre-PegIn transaction hex from preparePegin().

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:307](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L307)

Depositor's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix.
Required for Taproot signing.

##### localPrevouts?

```ts
optional localPrevouts: Record<string, {
  scriptPubKey: string;
  value: number;
}>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:315](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L315)

Optional pre-fetched prevout data for inputs not yet in the mempool.
Key format: "txid:vout" (e.g. "abc123...def:0").
When provided, matching inputs skip the mempool API fetch.
Useful for split transactions where outputs are unconfirmed.

***

### PopSignature

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:324](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L324)

BIP-322 BTC Proof-of-Possession binding a depositor's BTC key to their
Ethereum account. Produced by [PeginManager.signProofOfPossession](#signproofofpossession)
and reusable across every register call in the same session — the
embedded identities are re-checked at register time.

#### Properties

##### btcPopSignature

```ts
btcPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:326](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L326)

BIP-322 signature over the PoP message (0x-prefixed hex).

##### depositorEthAddress

```ts
depositorEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:328](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L328)

Ethereum address the PoP was signed for.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:330](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L330)

BTC x-only public key (64-char hex, no 0x prefix).

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:336](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L336)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:342](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L342)

Funded, pre-witness Pre-PegIn tx hex — pass
[PreparePeginResult.fundedPrePeginTxHex](#fundedprepegintxhex). The contract-side
parameter is named `unsignedPrePeginTx` but it stores the funded form.

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:347](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L347)

Depositor-signed PegIn transaction hex (submitted to contract; vault ID derived from this).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:352](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L352)

Vault provider's Ethereum address.

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:357](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L357)

SHA256 hashlock for HTLC activation (bytes32 hex with 0x prefix).

##### depositorPayoutBtcAddress?

```ts
optional depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:366](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L366)

Depositor's BTC payout address (e.g. bc1p..., bc1q...).
Converted to scriptPubKey internally via bitcoinjs-lib.

If omitted, defaults to the connected BTC wallet's address
via `btcWallet.getAddress()`.

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:369](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L369)

Keccak256 hash of the depositor's WOTS public key (bytes32)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:372](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L372)

Proof of possession from [PeginManager.signProofOfPossession](#signproofofpossession).

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:379](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L379)

Zero-based index of the HTLC output in the Pre-PegIn transaction that
this PegIn spends. In a batch Pre-PegIn with N HTLC outputs, each vault
registration references a different htlcVout (0..N-1).

***

### RegisterPeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:385](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L385)

Result of registering a peg-in on Ethereum.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:389](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L389)

Ethereum transaction hash for the peg-in registration.

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:395](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L395)

Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)).
Used for contract reads/writes and indexer queries.

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:401](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L401)

Raw Bitcoin pegin transaction hash (double-SHA256 of the signed pegin tx).
Used for VP RPC operations which key on the BTC transaction ID.

***

### BatchPeginRequestItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:409](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L409)

Single request in a batch pegin registration.
All requests in a batch share the same vault provider, depositor BTC
pubkey, and Pre-PegIn transaction.

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:411](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L411)

Signed PegIn tx hex for this vault

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:413](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L413)

SHA256 hashlock for HTLC activation (bytes32 hex)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:415](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L415)

Zero-based HTLC output index in the Pre-PegIn tx (unique per request)

##### depositorPayoutBtcAddress

```ts
depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:417](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L417)

Depositor's BTC payout address (required — funds are sent here on payout)

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:419](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L419)

Keccak256 hash of the depositor's WOTS public key (bytes32)

***

### RegisterPeginBatchParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:425](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L425)

Parameters for registerPeginBatchOnChain.

#### Properties

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:427](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L427)

Vault provider address (shared across all vaults in batch)

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:432](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L432)

Funded, pre-witness Pre-PegIn tx hex — shared across every request in
the batch. See [RegisterPeginParams.unsignedPrePeginTx](#unsignedprepegintx).

##### requests

```ts
requests: BatchPeginRequestItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:434](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L434)

Individual pegin requests (one per vault)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:436](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L436)

Proof of possession from [PeginManager.signProofOfPossession](#signproofofpossession).

***

### BatchPeginResultItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:442](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L442)

Per-vault result from a batch pegin registration.

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:444](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L444)

Derived vault ID: keccak256(abi.encode(peginTxHash, depositor))

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:446](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L446)

Raw BTC pegin transaction hash

***

### RegisterPeginBatchResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:452](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L452)

Result of registering a batch of pegins on Ethereum in a single transaction.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:454](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L454)

Ethereum transaction hash

##### vaults

```ts
vaults: BatchPeginResultItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:456](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L456)

Per-vault results (same order as input requests)

## Type Aliases

### BitcoinNetwork

```ts
type BitcoinNetwork = "mainnet" | "testnet" | "signet";
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:5](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L5)

Bitcoin network types.
Using string literal union for maximum compatibility with wallet providers.

## References

### UTXO

Re-exports [UTXO](utils.md#utxo)
