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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:169](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L169)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:177](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L177)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:203](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L203)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:265](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L265)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### supportsBatchSigning()

```ts
supportsBatchSigning(): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:274](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L274)

Checks if the wallet supports batch signing (signPsbts).

###### Returns

`boolean`

true if batch signing is supported

##### signPayoutTransactionsBatch()

```ts
signPayoutTransactionsBatch(transactions): Promise<object[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:287](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L287)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:633](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L633)

#### Constructors

##### Constructor

```ts
new PeginManager(config): PeginManager;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:641](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L641)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:655](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L655)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1048](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1048)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1199](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1199)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1385](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1385)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1697](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1697)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1753](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1753)

Gets the configured Bitcoin network.

###### Returns

[`Network`](primitives.md#network)

The Bitcoin network (mainnet, testnet, signet, regtest)

##### getVaultContractAddress()

```ts
getVaultContractAddress(): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1762](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1762)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:119](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L119)

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

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L92)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L99)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L105)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L110)

VP commission in basis points (`1..=9999`). Forwarded to [buildPayoutPsbt](primitives.md#buildpayoutpsbt).

###### Inherited from

```ts
SignPayoutBaseParams.commissionBps
```

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:124](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L124)

Payout transaction hex (unsigned).
This is the transaction from the vault provider that needs depositor signature.

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L130)

Assert transaction hex.
Payout input 1 references Assert output 0.

***

### PayoutSignatureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L136)

Result of signing a payout transaction.

#### Properties

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L140)

64-byte Schnorr signature (128 hex characters).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts:145](../../packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts#L145)

Depositor's BTC public key used for signing.

***

### PeginManagerConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L136)

Configuration for the PeginManager.

#### Properties

##### btcNetwork

```ts
btcNetwork: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L140)

Bitcoin network to use for transactions.

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:145](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L145)

Bitcoin wallet for signing peg-in transactions.

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L151)

Ethereum wallet for registering peg-in on-chain.
Uses viem's WalletClient directly for proper gas estimation.

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:157](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L157)

Ethereum chain configuration.
Required for proper gas estimation in contract calls.

##### publicClient

```ts
publicClient: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L165)

Public client used for read calls (`readContract`, `estimateGas`,
`waitForTransactionReceipt`). Pass a client configured with the
caller's RPC URL so reads hit the same endpoint as the rest of the
application instead of viem's stock chain default.

##### vaultContracts

```ts
vaultContracts: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L170)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:182](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L182)

Mempool API URL for fetching UTXO data and broadcasting transactions.
Use MEMPOOL_API_URLS constant for standard mempool.space URLs, or provide
a custom URL if running your own mempool instance.

***

### PreparePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:188](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L188)

Parameters for the pegin flow (pre-pegin + pegin transactions).

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:195](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L195)

Vault core (tx-graph) version to build — the contract's
`ProtocolParams.activeVaultCoreVersion()` at build time. Stamped onto
the vault at registration; every Pre-PegIn/PegIn artifact this manager
constructs derives from this graph version.

##### amounts

```ts
amounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:202](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L202)

Amounts to peg in per HTLC (in satoshis).
Must have the same length as `hashlocks`.
For single deposits, pass a single-element array.

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:208](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L208)

Vault provider's BTC public key (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### commissionBps?

```ts
optional commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:215](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L215)

VP commission in basis points; feeds the deposit terms' per-vault
commissionFee. Optional: when omitted, deposit terms carry no
commissionFee (see DepositTermsVaultGroup.commissionFee).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:221](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L221)

Vault keeper BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:227](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L227)

Universal challenger BTC public keys (x-only, 64-char hex).
Can be provided with or without "0x" prefix (will be stripped automatically).

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:232](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L232)

CSV timelock in blocks for the PegIn vault output.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:237](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L237)

CSV timelock in blocks for the Pre-PegIn HTLC refund path.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:243](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L243)

TX-graph fee rate in sat/vB from the contract offchain params.
Used by WASM to size the depositor claim value (graph transactions).

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:249](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L249)

Minimum PegIn fee rate in sat/vB from the contract offchain params.
Used by WASM to size the PegIn transaction fee.

##### mempoolFeeRate

```ts
mempoolFeeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:255](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L255)

Mempool fee rate in sat/vB for funding the Pre-PegIn transaction.
Used for UTXO selection and change calculation.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:260](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L260)

M in M-of-N council multisig (from contract params).

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:265](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L265)

N in M-of-N council multisig (from contract params).

##### availableUTXOs

```ts
availableUTXOs: readonly UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:270](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L270)

Available UTXOs from the depositor's wallet for funding the Pre-PegIn transaction.

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:275](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L275)

Bitcoin address for receiving change from the Pre-PegIn transaction.

***

### PerVaultPeginData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:282](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L282)

Per-vault PegIn data derived from a shared Pre-PegIn transaction

#### Properties

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:284](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L284)

Index of the HTLC output in the Pre-PegIn transaction (0, 1, 2, ...)

##### htlcValue

```ts
htlcValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:286](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L286)

HTLC output value in satoshis

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:288](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L288)

Depositor-signed PegIn transaction hex (for contract registration)

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:290](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L290)

PegIn transaction ID

##### peginInputSignature

```ts
peginInputSignature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:292](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L292)

Depositor's Schnorr signature over PegIn input (HTLC leaf 0)

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:294](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L294)

Vault output scriptPubKey hex

***

### PreparePeginTransaction

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:301](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L301)

Broadcast-ready transaction output of [PeginManager.preparePegin](#preparepegin).
Safe to log / persist — contains no sensitive material.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:307](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L307)

Funded, pre-witness Pre-PegIn tx hex. Pass this for register calls'
`unsignedPrePeginTx` — despite the contract-side name, the registry
stores the funded form so indexers can rebuild refund PSBTs.

##### prePeginTxid

```ts
prePeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:309](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L309)

Funded Pre-PegIn transaction ID

##### perVault

```ts
perVault: PerVaultPeginData[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:311](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L311)

Per-vault PegIn data — one entry per amount

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:313](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L313)

UTXOs selected to fund the Pre-PegIn transaction

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:315](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L315)

Transaction fee in satoshis

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:317](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L317)

Change amount in satoshis (if any)

***

### PreparePeginDerivedSecrets

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:325](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L325)

Sensitive material derived from the wallet root. Do not log; do not
persist beyond the activation flow. Strings are immutable in JS, so
lifetime is GC-only — secrets stay live until the result is dropped.

#### Properties

##### perVaultWotsKeys

```ts
perVaultWotsKeys: WotsBlockPublicKey[][];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:327](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L327)

Per-vault WOTS block public keys (one array per vault).

##### wotsPkHashes

```ts
wotsPkHashes: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:329](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L329)

Per-vault keccak256 of WOTS keys, ready as `depositorWotsPkHash`.

##### htlcSecretHexes

```ts
htlcSecretHexes: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:334](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L334)

Per-vault HTLC preimage hex (no 0x prefix). Re-derivable any time
via `expandHashlockSecret(root, htlcVout)`; not persisted.

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:345](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L345)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:348](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L348)

#### Properties

##### transaction

```ts
transaction: PreparePeginTransaction;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:350](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L350)

Broadcast-ready Pre-PegIn + per-vault PegIn txs. Safe to log.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:357](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L357)

x-only depositor pubkey snapshot used end-to-end across sizing,
vault-root derivation, and PSBT signing. Safe to persist; not
sensitive. Reusing this snapshot downstream guarantees that
derived secrets and signed PSBTs reference the same identity.

##### derivedSecrets

```ts
derivedSecrets: PreparePeginDerivedSecrets;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:359](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L359)

Sensitive derived material — see [PreparePeginDerivedSecrets](#preparepeginderivedsecrets).

##### depositTerms

```ts
depositTerms: DepositTerms;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:366](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L366)

Protocol-level deposit terms for this Pre-PegIn. Always built, regardless
of wallet capability — [supportsDepositApproval](deposit-terms.md#supportsdepositapproval) wallets get it via
`approveDepositTerms` before PegIn signing; others just get it back for
reference.

***

### SignAndBroadcastParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:372](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L372)

Parameters for signing and broadcasting a transaction.

#### Properties

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:376](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L376)

Funded Pre-PegIn transaction hex from preparePegin().

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:383](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L383)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:391](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L391)

Optional pre-fetched prevout data for inputs not yet in the mempool.
Key format: "txid:vout" (e.g. "abc123...def:0").
When provided, matching inputs skip the mempool API fetch.
Useful for split transactions where outputs are unconfirmed.

***

### PopSignature

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:400](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L400)

BIP-322 BTC Proof-of-Possession binding a depositor's BTC key to their
Ethereum account. Produced by [PeginManager.signProofOfPossession](#signproofofpossession)
and reusable across every register call in the same session — the
embedded identities are re-checked at register time.

#### Properties

##### btcPopSignature

```ts
btcPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:402](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L402)

BIP-322 signature over the PoP message (0x-prefixed hex).

##### depositorEthAddress

```ts
depositorEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:404](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L404)

Ethereum address the PoP was signed for.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:406](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L406)

BTC x-only public key (64-char hex, no 0x prefix).

***

### RegisterPeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:412](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L412)

Parameters for registering a peg-in on Ethereum.

#### Properties

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:419](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L419)

Funded, pre-witness Pre-PegIn tx hex — pass
[PreparePeginTransaction.fundedPrePeginTxHex](#fundedprepegintxhex) from
[PreparePeginResult.transaction](#transaction). The contract-side parameter
is named `unsignedPrePeginTx` but it stores the funded form.

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:424](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L424)

Depositor-signed PegIn transaction hex (submitted to contract; vault ID derived from this).

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:429](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L429)

Vault provider's Ethereum address.

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:434](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L434)

SHA256 hashlock for HTLC activation (bytes32 hex with 0x prefix).

##### depositorPayoutBtcAddress?

```ts
optional depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:443](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L443)

Depositor's BTC payout address (e.g. bc1p..., bc1q...).
Converted to scriptPubKey internally via bitcoinjs-lib.

If omitted, defaults to the connected BTC wallet's address
via `btcWallet.getAddress()`.

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:446](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L446)

Keccak256 hash of the depositor's WOTS public key (bytes32)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:449](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L449)

Proof of possession from [PeginManager.signProofOfPossession](#signproofofpossession).

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:456](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L456)

Zero-based index of the HTLC output in the Pre-PegIn transaction that
this PegIn spends. In a batch Pre-PegIn with N HTLC outputs, each vault
registration references a different htlcVout (0..N-1).

##### quotedCommissionBps?

```ts
optional quotedCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:459](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L459)

VP commission (bps) shown to the user — bounds maxAcceptableCommissionBps. See #1691.

***

### RegisterPeginResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:465](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L465)

Result of registering a peg-in on Ethereum.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:469](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L469)

Ethereum transaction hash for the peg-in registration.

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:475](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L475)

Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)).
Used for contract reads/writes and indexer queries.

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:481](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L481)

Raw Bitcoin pegin transaction hash (double-SHA256 of the signed pegin tx).
Used for VP RPC operations which key on the BTC transaction ID.

***

### BatchPeginRequestItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:489](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L489)

Single request in a batch pegin registration.
All requests in a batch share the same vault provider, depositor BTC
pubkey, and Pre-PegIn transaction.

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:491](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L491)

Signed PegIn tx hex for this vault

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:493](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L493)

SHA256 hashlock for HTLC activation (bytes32 hex)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:495](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L495)

Zero-based HTLC output index in the Pre-PegIn tx (unique per request)

##### depositorPayoutBtcAddress

```ts
depositorPayoutBtcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:497](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L497)

Depositor's BTC payout address (required — funds are sent here on payout)

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:499](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L499)

Keccak256 hash of the depositor's WOTS public key (bytes32)

***

### RegisterPeginBatchParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:505](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L505)

Parameters for registerPeginBatchOnChain.

#### Properties

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:507](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L507)

Vault provider address (shared across all vaults in batch)

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:512](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L512)

Funded, pre-witness Pre-PegIn tx hex — shared across every request in
the batch. See [RegisterPeginParams.unsignedPrePeginTx](#unsignedprepegintx).

##### requests

```ts
requests: BatchPeginRequestItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:514](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L514)

Individual pegin requests (one per vault)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:516](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L516)

Proof of possession from [PeginManager.signProofOfPossession](#signproofofpossession).

##### quotedCommissionBps?

```ts
optional quotedCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:518](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L518)

See [RegisterPeginParams.quotedCommissionBps](#quotedcommissionbps).

***

### BatchPeginResultItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:524](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L524)

Per-vault result from a batch pegin registration.

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:526](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L526)

Derived vault ID: keccak256(abi.encode(peginTxHash, depositor))

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:528](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L528)

Raw BTC pegin transaction hash

***

### RegisterPeginBatchResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:534](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L534)

Result of registering a batch of pegins on Ethereum in a single transaction.

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:536](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L536)

Ethereum transaction hash

##### vaults

```ts
vaults: BatchPeginResultItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:538](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L538)

Per-vault results (same order as input requests)

***

### EstimateSubmitPeginRequestBatchGasParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1832](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1832)

#### Properties

##### publicClient

```ts
publicClient: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1833](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1833)

##### btcVaultRegistry

```ts
btcVaultRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1834](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1834)

##### depositorEthAddress

```ts
depositorEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1835](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1835)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1836](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1836)

##### batchSize

```ts
batchSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1837](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1837)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts:1857](../../packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts#L1857)

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
