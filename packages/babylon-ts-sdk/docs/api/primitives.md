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

### PayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:34](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L34)

Parameters for building an unsigned payout PSBT

#### Properties

##### claimTxHex

```ts
claimTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:54](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L54)

Claim transaction hex (required).
Obtained from the Vault Provider RPC API when
requesting claim/payout transaction pairs.

###### See

Rust: crates/vault/src/transactions/payout.rs::PayoutTx::new()

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:59](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L59)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### liquidatorBtcPubkeys

```ts
liquidatorBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:71](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L71)

Liquidator BTC public keys (x-only, 64-char hex)
Also referred to as "challengers" in the WASM layer

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:76](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L76)

Bitcoin network

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:39](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L39)

Payout transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:45](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L45)

Peg-in transaction hex
This transaction created the vault output that we're spending

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:65](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L65)

Vault provider's BTC public key (x-only, 64-char hex)
Also referred to as "claimer" in the WASM layer

***

### PayoutPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:82](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L82)

Result of building an unsigned payout PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:86](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L86)

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

##### liquidators

```ts
liquidators: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:23](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L23)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:24](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L24)

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:22](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L22)

***

### PayoutScriptResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:30](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L30)

Result of creating a payout script

#### Properties

##### address

```ts
address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:34](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L34)

##### payoutScript

```ts
payoutScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:31](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L31)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:33](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L33)

##### taprootScriptHash

```ts
taprootScriptHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:32](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L32)

***

### PeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:18](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L18)

Parameters for building an unsigned peg-in PSBT

#### Properties

##### challengerPubkeys

```ts
challengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:34](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L34)

Array of liquidator BTC public keys (x-only, 64-char hex)
Also referred to as "challengers" in the WASM layer

##### claimerPubkey

```ts
claimerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:28](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L28)

Vault provider's BTC public key (x-only, 64-char hex)
Also referred to as "claimer" in the WASM layer

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:44](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L44)

Bitcoin network

##### pegInAmount

```ts
pegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:39](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L39)

Amount to peg in (in satoshis)

***

### PeginPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:50](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L50)

Result of building an unsigned peg-in PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:62](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L62)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:67](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L67)

Transaction ID (will change after adding inputs and signing)

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:72](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L72)

Vault script pubkey hex

##### vaultValue

```ts
vaultValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:77](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L77)

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

### buildPayoutPsbt()

```ts
function buildPayoutPsbt(params): Promise<PayoutPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:120](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L120)

Build unsigned payout PSBT for depositor to sign

This function:
1. Uses WASM to generate the payout script via createPayoutScript()
2. Builds a PSBT with taproot script path spend information
3. Returns unsigned PSBT ready for depositor to sign

#### Parameters

##### params

[`PayoutParams`](#payoutparams)

Payout parameters

#### Returns

`Promise`\<[`PayoutPsbtResult`](#payoutpsbtresult)\>

Unsigned PSBT

#### Example

```typescript
import { buildPayoutPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const psbt = await buildPayoutPsbt({
  payoutTxHex: '0200000...',
  peginTxHex: '0200000...',
  depositorBtcPubkey: 'abc123...',
  vaultProviderBtcPubkey: 'def456...',
  liquidatorBtcPubkeys: ['ghi789...'],
  network: 'testnet',
});

// Now sign with wallet
const signedPsbt = await wallet.signPsbt(psbt.psbtHex);

// Extract signature
const signature = extractPayoutSignature(signedPsbt, 'abc123...');
```

***

### buildPeginPsbt()

```ts
function buildPeginPsbt(params): Promise<PeginPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:115](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L115)

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

#### Example

```typescript
import { buildPeginPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const result = await buildPeginPsbt({
  depositorPubkey: 'abc123...',
  claimerPubkey: 'def456...',
  challengerPubkeys: ['ghi789...'],
  pegInAmount: 90000n,
  network: 'testnet',
});

console.log(result.txid); // Transaction ID
console.log(result.psbtHex); // Unsigned transaction hex
console.log(result.vaultScriptPubKey); // Vault script pubkey
console.log(result.vaultValue); // 90000n
```

***

### createPayoutScript()

```ts
function createPayoutScript(params): Promise<PayoutScriptResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:47](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L47)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:284](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L284)

Extract Schnorr signature from signed payout PSBT

This function supports two cases:
1. Non-finalized PSBT: Extracts from tapScriptSig field
2. Finalized PSBT: Extracts from witness data

The signature is returned as a 64-byte hex string (128 hex characters)
with any sighash flag byte removed if present.

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

#### Example

```typescript
import { extractPayoutSignature } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const signature = extractPayoutSignature(
  signedPsbtHex,
  'abc123...',
);

console.log(signature.length); // 128 (64 bytes)
```

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
