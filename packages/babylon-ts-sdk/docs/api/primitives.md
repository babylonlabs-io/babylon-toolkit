[@babylonlabs-io/ts-sdk](README.md) / primitives

# primitives

Vault Primitives

Pure functions for vault operations with no wallet dependencies.
These functions wrap the WASM implementation and provide:
- PSBT building
- Script creation
- Transaction parsing
- Signature extraction
- Bitcoin utility functions

All functions are pure: input → output, no side effects.
Works in Node.js, browsers, and serverless environments.

## Interfaces

### PayoutOptimisticParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:74](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L74)

Parameters for building an unsigned PayoutOptimistic PSBT

PayoutOptimistic is used in the optimistic path when no challenge occurs.
Input 1 references the Claim transaction.

#### Extends

- `PayoutBaseParams`

#### Properties

##### claimTxHex

```ts
claimTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:85](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L85)

Claim transaction hex
PayoutOptimistic input 1 references Claim output 0

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:45](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L45)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

###### Inherited from

```ts
PayoutBaseParams.depositorBtcPubkey
```

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:65](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L65)

Bitcoin network

###### Inherited from

```ts
PayoutBaseParams.network
```

##### payoutOptimisticTxHex

```ts
payoutOptimisticTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:79](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L79)

PayoutOptimistic transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:40](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L40)

Peg-in transaction hex
This transaction created the vault output that we're spending

###### Inherited from

```ts
PayoutBaseParams.peginTxHex
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:60](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L60)

Universal challenger BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.universalChallengerBtcPubkeys
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:55](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L55)

Vault keeper BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultKeeperBtcPubkeys
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:50](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L50)

Vault provider's BTC public key (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultProviderBtcPubkey
```

***

### PayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:94](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L94)

Parameters for building an unsigned Payout PSBT (challenge path)

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Extends

- `PayoutBaseParams`

#### Properties

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:105](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L105)

Assert transaction hex
Payout input 1 references Assert output 0

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:45](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L45)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

###### Inherited from

```ts
PayoutBaseParams.depositorBtcPubkey
```

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:65](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L65)

Bitcoin network

###### Inherited from

```ts
PayoutBaseParams.network
```

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:99](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L99)

Payout transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:40](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L40)

Peg-in transaction hex
This transaction created the vault output that we're spending

###### Inherited from

```ts
PayoutBaseParams.peginTxHex
```

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:60](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L60)

Universal challenger BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.universalChallengerBtcPubkeys
```

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:55](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L55)

Vault keeper BTC public keys (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultKeeperBtcPubkeys
```

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:50](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L50)

Vault provider's BTC public key (x-only, 64-char hex)

###### Inherited from

```ts
PayoutBaseParams.vaultProviderBtcPubkey
```

***

### PayoutPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:111](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L111)

Result of building an unsigned payout PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:115](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L115)

Unsigned PSBT hex ready for signing

***

### PayoutScriptParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:20](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L20)

Parameters for creating a payout script

#### Properties

##### depositor

```ts
depositor: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:21](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L21)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:25](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L25)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:24](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L24)

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:23](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L23)

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:22](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L22)

***

### PayoutScriptResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:31](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L31)

Result of creating a payout script

#### Properties

##### address

```ts
address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:35](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L35)

##### payoutScript

```ts
payoutScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:32](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L32)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:34](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L34)

##### taprootScriptHash

```ts
taprootScriptHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:33](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L33)

***

### PeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:18](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L18)

Parameters for building an unsigned peg-in PSBT

#### Properties

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:22](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L22)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:47](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L47)

Bitcoin network

##### pegInAmount

```ts
pegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:42](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L42)

Amount to peg in (in satoshis)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:37](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L37)

Array of universal challenger BTC public keys (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:32](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L32)

Array of vault keeper BTC public keys (x-only, 64-char hex)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:27](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L27)

Vault provider's BTC public key (x-only, 64-char hex)

***

### PeginPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:53](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L53)

Result of building an unsigned peg-in PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:65](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L65)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:70](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L70)

Transaction ID (will change after adding inputs and signing)

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:75](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L75)

Vault script pubkey hex

##### vaultValue

```ts
vaultValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:80](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L80)

Vault output value (in satoshis)

***

### WalletPubkeyValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:200](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L200)

Result of validating a wallet public key against an expected depositor public key.

#### Properties

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:206](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L206)

The validated depositor public key (x-only format)

##### walletPubkeyRaw

```ts
walletPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:202](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L202)

Wallet's raw public key (as returned by wallet, may be compressed)

##### walletPubkeyXOnly

```ts
walletPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:204](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L204)

Wallet's public key in x-only format (32 bytes, 64 hex chars)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:287](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L287)

Build unsigned PayoutOptimistic PSBT for depositor to sign

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

***

### buildPayoutPsbt()

```ts
function buildPayoutPsbt(params): Promise<PayoutPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:315](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L315)

Build unsigned Payout PSBT for depositor to sign (challenge path)

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

***

### buildPeginPsbt()

```ts
function buildPeginPsbt(params): Promise<PeginPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:100](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L100)

Build unsigned peg-in PSBT using WASM

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

***

### createPayoutScript()

```ts
function createPayoutScript(params): Promise<PayoutScriptResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:48](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L48)

Create payout script and taproot information using WASM

This is a pure function that wraps the Rust WASM implementation.
The payout connector generates the necessary taproot scripts and information
required for signing payout transactions.

#### Parameters

##### params

[`PayoutScriptParams`](#payoutscriptparams)

Payout script parameters

#### Returns

`Promise`\<[`PayoutScriptResult`](#payoutscriptresult)\>

Payout script and taproot information

***

### extractPayoutSignature()

```ts
function extractPayoutSignature(signedPsbtHex, depositorPubkey): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:350](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L350)

Extract Schnorr signature from signed payout PSBT

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

### hexToUint8Array()

```ts
function hexToUint8Array(hex): Uint8Array;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:49](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L49)

Convert hex string to Uint8Array

#### Parameters

##### hex

`string`

Hex string (with or without 0x prefix)

#### Returns

`Uint8Array`

Uint8Array

#### Throws

Error if hex is invalid

#### Example

```typescript
hexToUint8Array('abc123')     // Uint8Array [0xab, 0xc1, 0x23]
hexToUint8Array('0xabc123')   // Uint8Array [0xab, 0xc1, 0x23]
hexToUint8Array('xyz')        // throws Error
```

***

### isValidHex()

```ts
function isValidHex(hex): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:192](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L192)

Validate hex string format

Checks that the string contains only valid hexadecimal characters (0-9, a-f, A-F)
and has an even length (since each byte is represented by 2 hex characters).

#### Parameters

##### hex

`string`

String to validate (with or without 0x prefix)

#### Returns

`boolean`

true if valid hex string

#### Example

```typescript
isValidHex('abc123')     // true
isValidHex('0xabc123')   // true (prefix is stripped)
isValidHex('xyz')        // false (invalid characters)
isValidHex('abc')        // false (odd length)
isValidHex('')           // true (empty is valid)
```

***

### processPublicKeyToXOnly()

```ts
function processPublicKeyToXOnly(publicKeyHex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:149](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L149)

Process and convert a public key to x-only format (32 bytes hex)

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

Error if public key format is invalid or contains invalid hex characters

#### Example

```typescript
// Already x-only
processPublicKeyToXOnly('abc123...') // 64 chars
// => 'abc123...' (same, 64 chars)

// Compressed pubkey
processPublicKeyToXOnly('02abc123...') // 66 chars
// => 'abc123...' (64 chars, first byte removed)

// With 0x prefix
processPublicKeyToXOnly('0x02abc123...') // 66 chars + 0x
// => 'abc123...' (64 chars)

// Uncompressed pubkey (65 bytes = 130 hex chars)
processPublicKeyToXOnly('04abc123...') // 130 chars
// => first 32 bytes after prefix
```

***

### stripHexPrefix()

```ts
function stripHexPrefix(hex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:31](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L31)

Strip "0x" prefix from hex string if present

Bitcoin expects plain hex (no "0x" prefix), but frontend often uses
Ethereum-style "0x"-prefixed hex.

#### Parameters

##### hex

`string`

Hex string with or without "0x" prefix

#### Returns

`string`

Hex string without "0x" prefix

#### Example

```typescript
stripHexPrefix('0xabc123') // 'abc123'
stripHexPrefix('abc123')   // 'abc123'
stripHexPrefix('')         // ''
```

***

### toXOnly()

```ts
function toXOnly(pubKey): Uint8Array;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:97](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L97)

Convert a 33-byte public key to 32-byte x-only format (removes first byte)

Used for Taproot/Schnorr signatures which only need the x-coordinate.
If the input is already 32 bytes, returns it unchanged.

#### Parameters

##### pubKey

`Uint8Array`

33-byte or 32-byte public key

#### Returns

`Uint8Array`

32-byte x-only public key

#### Example

```typescript
const compressedPubkey = hexToUint8Array('02abc123...'); // 33 bytes
const xOnly = toXOnly(compressedPubkey); // 32 bytes

const alreadyXOnly = hexToUint8Array('abc123...'); // 32 bytes
toXOnly(alreadyXOnly); // Returns same array
```

***

### uint8ArrayToHex()

```ts
function uint8ArrayToHex(bytes): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:73](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L73)

Convert Uint8Array to hex string (without 0x prefix)

#### Parameters

##### bytes

`Uint8Array`

Uint8Array to convert

#### Returns

`string`

Hex string without 0x prefix

#### Example

```typescript
const bytes = new Uint8Array([0xab, 0xc1, 0x23]);
uint8ArrayToHex(bytes)  // 'abc123'
```

***

### validateWalletPubkey()

```ts
function validateWalletPubkey(walletPubkeyRaw, expectedDepositorPubkey?): WalletPubkeyValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:231](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L231)

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

Error if wallet pubkey doesn't match expected depositor pubkey

#### Example

```typescript
const walletPubkey = await wallet.getPublicKeyHex(); // "02abc123..."
const { walletPubkeyRaw, depositorPubkey } = validateWalletPubkey(
  walletPubkey,
  vault.depositorBtcPubkey
);
```
