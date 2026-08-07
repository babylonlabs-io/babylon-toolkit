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
| 5 | Sign payout authorisations | `runDepositorPresignFlow()` (services, delegates to `PayoutManager`) | `PENDING` → `VERIFIED` |
| 6 | Activate by revealing HTLC secret | `activateVault()` (services) | `VERIFIED` → `ACTIVE` |

Optional exit after the CSV timelock expires: `buildAndBroadcastRefund()` (services).

## Classes

### PayoutManager

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:189](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L189)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:197](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L197)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L223)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:290](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L290)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### supportsBatchSigning()

```ts
supportsBatchSigning(): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:299](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L299)

Checks if the wallet supports batch signing (signPsbts).

###### Returns

`boolean`

true if batch signing is supported

##### signPayoutTransactionsBatch()

```ts
signPayoutTransactionsBatch(transactions): Promise<object[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:312](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L312)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:674](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L674)

#### Constructors

##### Constructor

```ts
new PeginManager(config): PeginManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:682](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L682)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:696](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L696)

Prepare a peg-in: sizing pass → vault-root derivation (one wallet
popup) → per-vault WOTS / hashlock derivation → commit pass with
PSBT signing (signPsbt for a single vault, one batch popup for a
split). Returns broadcast-ready txs, the pubkey snapshot, and the
sensitive derived material.

###### Parameters

###### params

[`PreparePeginParams`](#preparepeginparams)

###### Returns

`Promise`\<[`PreparePeginResult`](#preparepeginresult)\>

###### Throws

If the wallet rejects, insufficient funds, or an internal
        invariant violation.

##### signAndBroadcast()

```ts
signAndBroadcast(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1108](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1108)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1259](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1259)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1445](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1445)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1765](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1765)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1821](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1821)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1830](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1830)

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

##### deriveContextHash()

```ts
deriveContextHash(appName, context): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:144](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L144)

Derives a deterministic 32-byte value per
`docs/specs/derive-context-hash.md` rev 1.0. Throws with code
`WALLET_METHOD_NOT_SUPPORTED` if unimplemented.

###### Parameters

###### appName

`string`

###### context

`string`

###### Returns

`Promise`\<`string`\>

64-char lowercase hex (32 bytes).

***

### PayoutManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L34)

Configuration for the PayoutManager.

#### Properties

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L38)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L43)

Bitcoin wallet for signing payout transactions.

***

### SignPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:139](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L139)

Parameters for signing a Payout transaction.

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Extends

- `SignPayoutBaseParams`

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L55)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion`. Forwarded to
[buildPayoutPsbt](primitives.md#buildpayoutpsbt) to derive the matching graph's payout scripts.

###### Inherited from

```ts
SignPayoutBaseParams.vaultCoreVersion
```

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L61)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L66)

Vault provider's BTC public key (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L71)

Vault keeper BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:76](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L76)

Universal challenger BTC public keys (x-only, 64-char hex).

###### Inherited from

```ts
SignPayoutBaseParams.universalChallengerBtcPubkeys
```

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L81)

CSV timelock in blocks for the PegIn output.

###### Inherited from

```ts
SignPayoutBaseParams.timelockPegin
```

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L83)

btc-vault `timelock_assert`; payout input 1's sequence.

###### Inherited from

```ts
SignPayoutBaseParams.timelockAssert
```

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L94)

Depositor's BTC public key (x-only, 64-char hex). This MUST be the
key registered on-chain for the vault — typically read from
`BTCVaultRegistry.getBtcVaultBasicInfo(...).depositorBtcPubKey`.

Required: omitting it would degrade `validateWalletPubkey` to a
self-comparison, allowing the wrong wallet to produce a signature
over a script tree that doesn't match the on-chain UTXO.

###### Inherited from

```ts
SignPayoutBaseParams.depositorBtcPubkey
```

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L101)

The on-chain registered depositor payout scriptPubKey (hex, with or without 0x prefix).
Used to validate that the VP-provided payout transaction actually pays to the
correct depositor payout address before signing.

###### Inherited from

```ts
SignPayoutBaseParams.registeredPayoutScriptPubKey
```

##### claimerBtcPubkey

```ts
claimerBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L107)

The claimer's x-only BTC public key for this payout (64-char hex, no prefix).
Forwarded to [buildPayoutPsbt](primitives.md#buildpayoutpsbt) for per-role output validation.

###### Inherited from

```ts
SignPayoutBaseParams.claimerBtcPubkey
```

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L112)

VP commission in basis points (`1..=9999`). Forwarded to [buildPayoutPsbt](primitives.md#buildpayoutpsbt).

###### Inherited from

```ts
SignPayoutBaseParams.commissionBps
```

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:118](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L118)

Version-locked tx-graph fee rate (sat/vB) the graph was built with.
Forwarded to [buildPayoutPsbt](primitives.md#buildpayoutpsbt) for the fee band.

###### Inherited from

```ts
SignPayoutBaseParams.protocolFeeRate
```

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:121](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L121)

Security council member count; forwarded to the fee floor (see PayoutParams).

###### Inherited from

```ts
SignPayoutBaseParams.councilSize
```

##### vkClaimerPayoutScriptPubKeys

```ts
vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:128](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L128)

RFC-006 resolved payout destinations, keyed by lowercased x-only operation
pubkey. Forwarded verbatim to [buildPayoutPsbt](primitives.md#buildpayoutpsbt); every VK claimer
must be present.

###### Inherited from

```ts
SignPayoutBaseParams.vkClaimerPayoutScriptPubKeys
```

##### vpCommissionScriptPubKey

```ts
vpCommissionScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L130)

RFC-006 VP commission destination. Forwarded to [buildPayoutPsbt](primitives.md#buildpayoutpsbt).

###### Inherited from

```ts
SignPayoutBaseParams.vpCommissionScriptPubKey
```

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:144](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L144)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L150)

Assert transaction hex.
Payout input 1 references Assert output 0.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:156](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L156)

Result of signing a payout transaction.

#### Properties

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L160)

64-byte Schnorr signature (128 hex characters).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L165)

Depositor's BTC public key used for signing.

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L165)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:169](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L169)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:174](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L174)

Bitcoin wallet for signing peg-in transactions.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:180](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L180)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L186)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### publicClient

```ts
publicClient: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:194](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L194)

Public client used for read calls (`readContract`, `estimateGas`,
`waitForTransactionReceipt`). Pass a client configured with the
caller's RPC URL so reads hit the same endpoint as the rest of the
application instead of viem's stock chain default.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:199](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L199)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:211](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L211)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

***

### PreparePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:217](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L217)

Parameters for the pegin flow (pre-pegin + pegin transactions).

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:224](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L224)

Vault core (tx-graph) version to build — the contract's
`ProtocolParams.activeVaultCoreVersion()` at build time. Stamped onto
the vault at registration; every Pre-PegIn/PegIn artifact this manager
constructs derives from this graph version.

##### amounts

```ts
amounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:231](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L231)

Amounts to peg in per HTLC (in satoshis).
Must have the same length as `hashlocks`.
For single deposits, pass a single-element array.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:237](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L237)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:244](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L244)

VP commission quoted for this deposit (bps). Capped to the approval
ceiling before it sizes the terms' commissionFee, so the user approves
the most the VP can take — not the quote.

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:250](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L250)

Vault keeper BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:256](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L256)

Universal challenger BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:261](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L261)

CSV timelock in blocks for the PegIn vault output.

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:269](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L269)

btc-vault `timelock_assert` (t2) — the Assert:0 payout-leaf CSV. Carried
into DepositTerms as its own field. Production collapses the two: the SDK
derives timelockPegin from the same on-chain timelockAssert
(`protocol-params-reader.ts` deriveTimelockPegin), mirroring vaultd
(`pegin_validation.rs`). The terms never assume that identity.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:274](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L274)

CSV timelock in blocks for the Pre-PegIn HTLC refund path.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:280](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L280)

TX-graph fee rate in sat/vB from the contract offchain params.
Used by WASM to size the depositor claim value (graph transactions).

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:286](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L286)

Minimum PegIn fee rate in sat/vB from the contract offchain params.
Used by WASM to size the PegIn transaction fee.

##### mempoolFeeRate

```ts
mempoolFeeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:292](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L292)

Mempool fee rate in sat/vB for funding the Pre-PegIn transaction.
Used for UTXO selection and change calculation.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:297](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L297)

M in M-of-N council multisig (from contract params).

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:302](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L302)

N in M-of-N council multisig (from contract params).

##### availableUTXOs

```ts
availableUTXOs: readonly UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:307](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L307)

Available UTXOs from the depositor's wallet for funding the Pre-PegIn transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:312](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L312)

Bitcoin address for receiving change from the Pre-PegIn transaction.

***

### PerVaultPeginData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:319](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L319)

Per-vault PegIn data derived from a shared Pre-PegIn transaction

#### Properties

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:321](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L321)

Index of the HTLC output in the Pre-PegIn transaction (0, 1, 2, ...)

##### htlcValue

```ts
htlcValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:323](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L323)

HTLC output value in satoshis

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:325](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L325)

Depositor-signed PegIn transaction hex (for contract registration)

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:327](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L327)

PegIn transaction ID

##### peginInputSignature

```ts
peginInputSignature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:329](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L329)

Depositor's Schnorr signature over PegIn input (HTLC leaf 0)

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:331](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L331)

Vault output scriptPubKey hex

***

### PreparePeginTransaction

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:338](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L338)

Broadcast-ready transaction output of [PeginManager.preparePegin](#preparepegin).
Safe to log / persist — contains no sensitive material.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:344](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L344)

Funded, pre-witness Pre-PegIn tx hex. Pass this for register calls'
`unsignedPrePeginTx` — despite the contract-side name, the registry
stores the funded form so indexers can rebuild refund PSBTs.

##### prePeginTxid

```ts
prePeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:346](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L346)

Funded Pre-PegIn transaction ID

##### perVault

```ts
perVault: PerVaultPeginData[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:348](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L348)

Per-vault PegIn data — one entry per amount

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:350](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L350)

UTXOs selected to fund the Pre-PegIn transaction

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:352](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L352)

Transaction fee in satoshis

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:354](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L354)

Change amount in satoshis (if any)

***

### PreparePeginDerivedSecrets

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:362](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L362)

Sensitive material derived from the wallet root. Do not log; do not
persist beyond the activation flow. Strings are immutable in JS, so
lifetime is GC-only — secrets stay live until the result is dropped.

#### Properties

##### perVaultWotsKeys

```ts
perVaultWotsKeys: WotsBlockPublicKey[][];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:364](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L364)

Per-vault WOTS block public keys (one array per vault).

##### wotsPkHashes

```ts
wotsPkHashes: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:366](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L366)

Per-vault keccak256 of WOTS keys, ready as `depositorWotsPkHash`.

##### htlcSecretHexes

```ts
htlcSecretHexes: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:371](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L371)

Per-vault HTLC preimage hex (no 0x prefix). Re-derivable any time
via `expandHashlockSecret(root, htlcVout)`; not persisted.

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:382](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L382)

Raw 32-byte auth-anchor preimage as 64-char lowercase hex (no `0x`).
Sent to the VP via `auth_createDepositorToken` to obtain a bearer
token; the VP validates `SHA256(authAnchorHex) === OP_RETURN_PUSH32`
in the broadcast Pre-PegIn. Reveal is intentional: once exposed
the anchor is public, but its scope is bound to a single
`peginTxid`. Domain-separated from `htlcSecretHexes` and
`perVaultWotsKeys` via the HKDF `info` label, so revealing it does
not weaken the other derived secrets.

***

### PreparePeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:385](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L385)

#### Properties

##### transaction

```ts
transaction: PreparePeginTransaction;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:387](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L387)

Broadcast-ready Pre-PegIn + per-vault PegIn txs. Safe to log.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:394](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L394)

x-only depositor pubkey snapshot used end-to-end across sizing,
vault-root derivation, and PSBT signing. Safe to persist; not
sensitive. Reusing this snapshot downstream guarantees that
derived secrets and signed PSBTs reference the same identity.

##### derivedSecrets

```ts
derivedSecrets: PreparePeginDerivedSecrets;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:396](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L396)

Sensitive derived material — see [PreparePeginDerivedSecrets](#preparepeginderivedsecrets).

##### depositTerms

```ts
depositTerms: DepositTerms;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:403](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L403)

Protocol-level deposit terms for this Pre-PegIn. Always built, regardless
of wallet capability — [supportsDepositApproval](deposit-terms.md#supportsdepositapproval) wallets get it via
`approveDepositTerms` before PegIn signing; others just get it back for
reference.

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:409](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L409)

Parameters for signing and broadcasting a transaction.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:413](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L413)

Funded Pre-PegIn transaction hex from preparePegin().

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:420](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L420)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:428](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L428)

Optional pre-fetched prevout data for inputs not yet in the mempool.
Key format: "txid:vout" (e.g. "abc123...def:0").
When provided, matching inputs skip the mempool API fetch.
Useful for split transactions where outputs are unconfirmed.

***

### PopSignature

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:437](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L437)

BIP-322 BTC Proof-of-Possession binding a depositor's BTC key to their
Ethereum account. Produced by [PeginManager.signProofOfPossession](#signproofofpossession)
and reusable across every register call in the same session — the
embedded identities are re-checked at register time.

#### Properties

##### btcPopSignature

```ts
btcPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:439](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L439)

BIP-322 signature over the PoP message (0x-prefixed hex).

##### depositorEthAddress

```ts
depositorEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:441](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L441)

Ethereum address the PoP was signed for.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:443](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L443)

BTC x-only public key (64-char hex, no 0x prefix).

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:449](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L449)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:456](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L456)

Funded, pre-witness Pre-PegIn tx hex — pass
[PreparePeginTransaction.fundedPrePeginTxHex](#fundedprepegintxhex) from
[PreparePeginResult.transaction](#transaction). The contract-side parameter
is named `unsignedPrePeginTx` but it stores the funded form.

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:461](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L461)

Depositor-signed PegIn transaction hex (submitted to contract; vault ID derived from this).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:466](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L466)

Vault provider's Ethereum address.

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:471](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L471)

SHA256 hashlock for HTLC activation (bytes32 hex with 0x prefix).

##### depositorPayoutBtcAddress?

```ts
optional depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:480](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L480)

Depositor's BTC payout address (e.g. bc1p..., bc1q...).
Converted to scriptPubKey internally via bitcoinjs-lib.

If omitted, defaults to the connected BTC wallet's address
via `btcWallet.getAddress()`.

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:483](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L483)

Keccak256 hash of the depositor's WOTS public key (bytes32)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:486](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L486)

Proof of possession from [PeginManager.signProofOfPossession](#signproofofpossession).

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:493](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L493)

Zero-based index of the HTLC output in the Pre-PegIn transaction that
this PegIn spends. In a batch Pre-PegIn with N HTLC outputs, each vault
registration references a different htlcVout (0..N-1).

##### quotedCommissionBps?

```ts
optional quotedCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:500](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L500)

Bounds the registration's maxAcceptableCommissionBps (#1691). REQUIRED
when the wallet approved terms — the ceiling must anchor to the approved
quote. Optional otherwise; falls back to chain-current.

***

### RegisterPeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:506](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L506)

Result of registering a peg-in on Ethereum.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:510](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L510)

Ethereum transaction hash for the peg-in registration.

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:516](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L516)

Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)).
Used for contract reads/writes and indexer queries.

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:522](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L522)

Raw Bitcoin pegin transaction hash (double-SHA256 of the signed pegin tx).
Used for VP RPC operations which key on the BTC transaction ID.

***

### BatchPeginRequestItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:530](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L530)

Single request in a batch pegin registration.
All requests in a batch share the same vault provider, depositor BTC
pubkey, and Pre-PegIn transaction.

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:532](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L532)

Signed PegIn tx hex for this vault

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:534](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L534)

SHA256 hashlock for HTLC activation (bytes32 hex)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:536](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L536)

Zero-based HTLC output index in the Pre-PegIn tx (unique per request)

##### depositorPayoutBtcAddress

```ts
depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:538](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L538)

Depositor's BTC payout address (required — funds are sent here on payout)

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:540](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L540)

Keccak256 hash of the depositor's WOTS public key (bytes32)

***

### RegisterPeginBatchParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:546](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L546)

Parameters for registerPeginBatchOnChain.

#### Properties

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:548](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L548)

Vault provider address (shared across all vaults in batch)

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:553](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L553)

Funded, pre-witness Pre-PegIn tx hex — shared across every request in
the batch. See [RegisterPeginParams.unsignedPrePeginTx](#unsignedprepegintx).

##### requests

```ts
requests: BatchPeginRequestItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:555](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L555)

Individual pegin requests (one per vault)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:557](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L557)

Proof of possession from [PeginManager.signProofOfPossession](#signproofofpossession).

##### quotedCommissionBps?

```ts
optional quotedCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:559](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L559)

See [RegisterPeginParams.quotedCommissionBps](#quotedcommissionbps).

***

### BatchPeginResultItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:565](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L565)

Per-vault result from a batch pegin registration.

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:567](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L567)

Derived vault ID: keccak256(abi.encode(peginTxHash, depositor))

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:569](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L569)

Raw BTC pegin transaction hash

***

### RegisterPeginBatchResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:575](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L575)

Result of registering a batch of pegins on Ethereum in a single transaction.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:577](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L577)

Ethereum transaction hash

##### vaults

```ts
vaults: BatchPeginResultItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:579](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L579)

Per-vault results (same order as input requests)

***

### EstimateSubmitPeginRequestBatchGasParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1900](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1900)

#### Properties

##### publicClient

```ts
publicClient: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1901](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1901)

##### btcVaultRegistry

```ts
btcVaultRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1902](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1902)

##### depositorEthAddress

```ts
depositorEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1903](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1903)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1904](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1904)

##### batchSize

```ts
batchSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1905](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1905)

## Type Aliases

### BitcoinNetwork

```ts
type BitcoinNetwork = "mainnet" | "testnet" | "signet";
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:5](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L5)

Bitcoin network types.
Using string literal union for maximum compatibility with wallet providers.

## Functions

### estimateSubmitPeginRequestBatchGas()

```ts
function estimateSubmitPeginRequestBatchGas(params): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1925](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1925)

Estimate gas for a `submitPeginRequestBatch` call before the depositor has
signed anything. Synthesizes calldata using representative dummy bytes for
fields the depositor would normally produce (signed PegIn tx, PoP sig,
WOTS hash, payout script). The estimate is approximate — calldata-byte
gas is correct, contract-side branches that depend on the real values may
diverge — but it lands within the usual gas-estimate margin.

Passes MAX\_ACCEPTABLE\_COMMISSION\_BPS\_CAP for the
`maxAcceptableCommissionBps` argument so the simulation does not revert on
the contract's commission-drift check regardless of the VP's current
commission. The real submit path resolves an accurate, drift-checked value
via PeginManager.resolveMaxAcceptableCommissionBps.

Throws if the contract reverts during simulation; callers should treat the
thrown error as "unable to estimate" and decide how to surface it.

#### Parameters

##### params

[`EstimateSubmitPeginRequestBatchGasParams`](#estimatesubmitpeginrequestbatchgasparams)

#### Returns

`Promise`\<`bigint`\>

## References

### UTXO

Re-exports [UTXO](utils.md#utxo)
