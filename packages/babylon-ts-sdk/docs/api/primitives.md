[@babylonlabs-io/ts-sdk](README.md) / primitives

# primitives

# Vault Primitives

Pure functions for vault operations with no wallet dependencies.
These functions wrap the WASM implementation and provide:

- **PSBT Building** - Create unsigned PSBTs for peg-in and payout transactions
- **Script Creation** - Generate taproot scripts for vault spending conditions
- **Signature Extraction** - Extract Schnorr signatures from signed PSBTs
- **Bitcoin Utilities** - Public key conversion, hex manipulation, validation

## Architecture

Primitives are the lowest level of the SDK, sitting directly above the Rust WASM core:

```
Your Application
      ↓
Managers (Level 2)      ← High-level orchestration with wallet integration
      ↓
Primitives (Level 1)    ← Pure functions (this module)
      ↓
WASM (Rust Core)        ← Cryptographic operations
```

## When to Use Primitives

Use primitives when you need:
- **Full control** over every operation
- **Custom wallet integrations** (KMS/HSM, hardware wallets)
- **Backend services** with custom signing flows
- **Serverless environments** with specific requirements

For frontend apps with browser wallet integration, consider using
the managers module instead (PeginManager and PayoutManager).

## Key Exports

### PSBT Builders
- [buildPeginPsbt](#buildpeginpsbt) - Create unfunded peg-in transaction
- [buildPayoutPsbt](#buildpayoutpsbt) - Create payout PSBT for signing
- [extractPayoutSignature](#extractpayoutsignature) - Extract Schnorr signature from signed PSBT

### Script Generators
- [createPayoutScript](#createpayoutscript) - Generate taproot payout script

### Bitcoin Utilities
- [processPublicKeyToXOnly](#processpublickeytoxonly) - Convert any pubkey format to x-only
- [validateWalletPubkey](#validatewalletpubkey) - Validate wallet matches expected depositor
- [hexToUint8Array](#hextouint8array) / [uint8ArrayToHex](#uint8arraytohex) - Hex conversion
- [stripHexPrefix](#striphexprefix) / [isValidHex](#isvalidhex) - Hex validation
- [toXOnly](#toxonly) - Convert compressed pubkey bytes to x-only

## See

[Primitives Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/primitives.md)

## Interfaces

### PayoutOptimisticParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L74)

Parameters for building an unsigned PayoutOptimistic PSBT

PayoutOptimistic is used in the optimistic path when no challenge occurs.
Input 1 references the Claim transaction.

#### Extends

- `PayoutBaseParams`

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L40)

Peg-in transaction hex
This transaction created the vault output that we're spending

###### Inherited from

```ts
PayoutBaseParams.peginTxHex
```

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L45)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

###### Inherited from

```ts
PayoutBaseParams.depositorBtcPubkey
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L50)

Vault provider's BTC public key (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L55)

Vault keeper BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L60)

Universal challenger BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.universalChallengerBtcPubkeys
```

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L65)

Bitcoin network

###### Inherited from

```ts
PayoutBaseParams.network
```

##### payoutOptimisticTxHex

```ts
payoutOptimisticTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L79)

PayoutOptimistic transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### claimTxHex

```ts
claimTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L85)

Claim transaction hex
PayoutOptimistic input 1 references Claim output 0

***

### PayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L94)

Parameters for building an unsigned Payout PSBT (challenge path)

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Extends

- `PayoutBaseParams`

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L40)

Peg-in transaction hex
This transaction created the vault output that we're spending

###### Inherited from

```ts
PayoutBaseParams.peginTxHex
```

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L45)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

###### Inherited from

```ts
PayoutBaseParams.depositorBtcPubkey
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L50)

Vault provider's BTC public key (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultProviderBtcPubkey
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L55)

Vault keeper BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultKeeperBtcPubkeys
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L60)

Universal challenger BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.universalChallengerBtcPubkeys
```

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L65)

Bitcoin network

###### Inherited from

```ts
PayoutBaseParams.network
```

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L99)

Payout transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L105)

Assert transaction hex
Payout input 1 references Assert output 0

***

### PayoutPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:111](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L111)

Result of building an unsigned payout PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:115](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L115)

Unsigned PSBT hex ready for signing

***

### PeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L18)

Parameters for building an unsigned peg-in PSBT

#### Properties

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L22)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L27)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L32)

Array of vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L37)

Array of universal challenger BTC public keys (x-only, 64-char hex)

##### pegInAmount

```ts
pegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L42)

Amount to peg in (in satoshis)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L47)

Bitcoin network

***

### PeginPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L53)

Result of building an unsigned peg-in PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L65)

Unsigned transaction hex

Note: This is an unfunded transaction with no inputs and one output (the pegin output).
The caller is responsible for:
- Selecting UTXOs to fund the transaction
- Calculating transaction fees
- Adding inputs to cover pegInAmount + fees
- Adding a change output if needed
- Creating and signing the PSBT via wallet

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L70)

Transaction ID (will change after adding inputs and signing)

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L75)

Vault script pubkey hex

##### vaultValue

```ts
vaultValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L80)

Vault output value (in satoshis)

***

### PayoutScriptParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L32)

Parameters for creating a payout script.

These parameters define the participants in a vault and are used to generate
the taproot script that controls how funds can be spent from the vault.

#### Properties

##### depositor

```ts
depositor: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L39)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix).

This is the user depositing BTC into the vault. The depositor must sign
payout transactions to authorize fund distribution.

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L47)

Vault provider's BTC public key (x-only, 64-char hex without 0x prefix).

The service provider managing vault operations. Also referred to as
"claimer" in the WASM layer.

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L54)

Array of vault keeper BTC public keys (x-only, 64-char hex without 0x prefix).

Vault keepers participate in vault operations and script spending conditions.

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L61)

Array of universal challenger BTC public keys (x-only, 64-char hex without 0x prefix).

These parties can challenge the vault under certain conditions.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L69)

Bitcoin network for script generation.

Must match the network used for all other vault operations to ensure
address encoding compatibility.

***

### PayoutScriptResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L78)

Result of creating a payout script.

Contains all the taproot-related data needed for constructing and signing
payout transactions from the vault.

#### Properties

##### payoutScript

```ts
payoutScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L86)

The payout script hex used in taproot script path spending.

This is the raw script bytes that define the spending conditions,
encoded as a hexadecimal string. Used when constructing the
tapLeafScript for PSBT signing.

##### taprootScriptHash

```ts
taprootScriptHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L94)

The taproot script hash (leaf hash) for the payout script.

This is the tagged hash of the script used in taproot tree construction.
Required for computing the control block during script path spending.

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L102)

The full scriptPubKey for the vault output address.

This is the complete output script (OP_1 <32-byte-key>) that should be
used when creating the vault output in a peg-in transaction.

##### address

```ts
address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L110)

The vault Bitcoin address derived from the script.

A human-readable bech32m address (bc1p... for mainnet, tb1p... for testnet/signet)
that can be used to receive funds into the vault.

***

### WalletPubkeyValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L143)

Result of validating a wallet public key against an expected depositor public key.

#### Properties

##### walletPubkeyRaw

```ts
walletPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:145](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L145)

Wallet's raw public key (as returned by wallet, may be compressed)

##### walletPubkeyXOnly

```ts
walletPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:147](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L147)

Wallet's public key in x-only format (32 bytes, 64 hex chars)

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L149)

The validated depositor public key (x-only format)

## Type Aliases

### Network

```ts
type Network = "bitcoin" | "testnet" | "regtest" | "signet";
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:4

Bitcoin network types supported by the vault system

## Functions

### buildPayoutOptimisticPsbt()

```ts
function buildPayoutOptimisticPsbt(params): Promise<PayoutPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:292](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L292)

Build unsigned PayoutOptimistic PSBT for depositor to sign.

PayoutOptimistic is used in the **optimistic path** when no challenge occurs:
1. Vault provider submits Claim transaction
2. Challenge period passes without challenge
3. PayoutOptimistic can be executed (references Claim tx)

#### Parameters

##### params

[`PayoutOptimisticParams`](#payoutoptimisticparams)

PayoutOptimistic parameters

#### Returns

`Promise`\<[`PayoutPsbtResult`](#payoutpsbtresult)\>

Unsigned PSBT ready for depositor to sign

#### Throws

If payout transaction does not have exactly 2 inputs

#### Throws

If input 0 does not reference the pegin transaction

#### Throws

If input 1 does not reference the claim transaction

#### Throws

If previous output is not found for either input

***

### buildPayoutPsbt()

```ts
function buildPayoutPsbt(params): Promise<PayoutPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:325](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L325)

Build unsigned Payout PSBT for depositor to sign (challenge path).

Payout is used in the **challenge path** when the claimer proves validity:
1. Vault provider submits Claim transaction
2. Challenge is raised during challenge period
3. Claimer submits Assert transaction to prove validity
4. Payout can be executed (references Assert tx)

#### Parameters

##### params

[`PayoutParams`](#payoutparams)

Payout parameters

#### Returns

`Promise`\<[`PayoutPsbtResult`](#payoutpsbtresult)\>

Unsigned PSBT ready for depositor to sign

#### Throws

If payout transaction does not have exactly 2 inputs

#### Throws

If input 0 does not reference the pegin transaction

#### Throws

If input 1 does not reference the assert transaction

#### Throws

If previous output is not found for either input

***

### extractPayoutSignature()

```ts
function extractPayoutSignature(signedPsbtHex, depositorPubkey): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:360](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L360)

Extract Schnorr signature from signed payout PSBT.

This function supports two cases:
1. Non-finalized PSBT: Extracts from tapScriptSig field
2. Finalized PSBT: Extracts from witness data

The signature is returned as a 64-byte hex string (128 hex characters)
with any sighash flag byte removed if present.

Works with both PayoutOptimistic and Payout signed PSBTs.

#### Parameters

##### signedPsbtHex

`string`

Signed PSBT hex

##### depositorPubkey

`string`

Depositor's public key (x-only, 64-char hex)

#### Returns

`string`

64-byte Schnorr signature (128 hex characters, no sighash flag)

#### Throws

If no signature is found in the PSBT

#### Throws

If the signature has an unexpected length

***

### buildPeginPsbt()

```ts
function buildPeginPsbt(params): Promise<PeginPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L102)

Build unsigned peg-in PSBT using WASM.

This is a pure function that wraps the Rust WASM implementation.
It creates an unfunded Bitcoin transaction with no inputs and one output
(the peg-in output to the vault address).

The returned transaction must be funded by the caller by:
1. Selecting appropriate UTXOs from the wallet
2. Calculating transaction fees based on selected inputs
3. Adding inputs to cover pegInAmount + fees
4. Adding a change output if the input value exceeds pegInAmount + fees
5. Creating a PSBT and signing it via the wallet

#### Parameters

##### params

[`PeginParams`](#peginparams)

Peg-in parameters

#### Returns

`Promise`\<[`PeginPsbtResult`](#peginpsbtresult)\>

Unsigned PSBT and transaction details

#### Throws

If WASM initialization fails or parameters are invalid

***

### createPayoutScript()

```ts
function createPayoutScript(params): Promise<PayoutScriptResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L130)

Create payout script and taproot information using WASM.

This is a pure function that wraps the Rust WASM implementation.
The payout connector generates the necessary taproot scripts and information
required for signing payout transactions.

#### Parameters

##### params

[`PayoutScriptParams`](#payoutscriptparams)

Payout script parameters defining vault participants and network

#### Returns

`Promise`\<[`PayoutScriptResult`](#payoutscriptresult)\>

Payout script and taproot information for PSBT construction

#### Remarks

The generated script encodes spending conditions that require signatures from
the depositor and vault provider (or liquidators in challenge scenarios).
This script is used internally by [buildPayoutPsbt](#buildpayoutpsbt).

#### See

[buildPayoutPsbt](#buildpayoutpsbt) - Use this for building complete payout PSBTs

***

### stripHexPrefix()

```ts
function stripHexPrefix(hex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L24)

Strip "0x" prefix from hex string if present.

Bitcoin expects plain hex (no "0x" prefix), but frontend often uses
Ethereum-style "0x"-prefixed hex.

#### Parameters

##### hex

`string`

Hex string with or without "0x" prefix

#### Returns

`string`

Hex string without "0x" prefix

***

### hexToUint8Array()

```ts
function hexToUint8Array(hex): Uint8Array;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L35)

Convert hex string to Uint8Array.

#### Parameters

##### hex

`string`

Hex string (with or without 0x prefix)

#### Returns

`Uint8Array`

Uint8Array

#### Throws

If hex is invalid

***

### uint8ArrayToHex()

```ts
function uint8ArrayToHex(bytes): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L53)

Convert Uint8Array to hex string (without 0x prefix).

#### Parameters

##### bytes

`Uint8Array`

Uint8Array to convert

#### Returns

`string`

Hex string without 0x prefix

***

### toXOnly()

```ts
function toXOnly(pubKey): Uint8Array;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L68)

Convert a 33-byte public key to 32-byte x-only format (removes first byte).

Used for Taproot/Schnorr signatures which only need the x-coordinate.
If the input is already 32 bytes, returns it unchanged.

#### Parameters

##### pubKey

`Uint8Array`

33-byte or 32-byte public key

#### Returns

`Uint8Array`

32-byte x-only public key

***

### processPublicKeyToXOnly()

```ts
function processPublicKeyToXOnly(publicKeyHex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L101)

Process and convert a public key to x-only format (32 bytes hex).

Handles:
- 0x prefix removal
- Hex character validation
- Length validation
- Conversion to x-only format

Accepts:
- 64 hex chars (32 bytes) - already x-only
- 66 hex chars (33 bytes) - compressed pubkey
- 130 hex chars (65 bytes) - uncompressed pubkey

#### Parameters

##### publicKeyHex

`string`

Public key in hex format (with or without 0x prefix)

#### Returns

`string`

X-only public key as 32 bytes hex string (without 0x prefix)

#### Throws

If public key format is invalid or contains invalid hex characters

***

### isValidHex()

```ts
function isValidHex(hex): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L135)

Validate hex string format.

Checks that the string contains only valid hexadecimal characters (0-9, a-f, A-F)
and has an even length (since each byte is represented by 2 hex characters).

#### Parameters

##### hex

`string`

String to validate (with or without 0x prefix)

#### Returns

`boolean`

true if valid hex string

***

### validateWalletPubkey()

```ts
function validateWalletPubkey(walletPubkeyRaw, expectedDepositorPubkey?): WalletPubkeyValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L165)

Validate that a wallet's public key matches the expected depositor public key.

This function:
1. Converts the wallet pubkey to x-only format
2. Uses the expected depositor pubkey if provided, otherwise falls back to wallet pubkey
3. Validates they match (case-insensitive)

#### Parameters

##### walletPubkeyRaw

`string`

Raw public key from wallet (may be compressed 66 chars or x-only 64 chars)

##### expectedDepositorPubkey?

`string`

Expected depositor public key (x-only, optional)

#### Returns

[`WalletPubkeyValidationResult`](#walletpubkeyvalidationresult)

Validation result with both pubkey formats

#### Throws

If wallet pubkey doesn't match expected depositor pubkey
