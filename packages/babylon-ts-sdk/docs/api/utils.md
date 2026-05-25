[@babylonlabs-io/ts-sdk](README.md) / utils

# utils

Pure helpers for the primitives and services layers. No wallet, no network, no contract state.

## Classes

### UtxoNotAvailableError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L53)

Error thrown when UTXOs are not available.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new UtxoNotAvailableError(missingUtxos): UtxoNotAvailableError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L56)

###### Parameters

###### missingUtxos

[`MissingUtxoInfo`](#missingutxoinfo)[]

###### Returns

[`UtxoNotAvailableError`](#utxonotavailableerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### missingUtxos

```ts
readonly missingUtxos: MissingUtxoInfo[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L54)

## Interfaces

### PsbtInputFields

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L16)

PSBT input fields for supported script types (P2TR, P2WPKH, P2WSH).

#### Properties

##### witnessUtxo?

```ts
optional witnessUtxo: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L17)

###### script

```ts
script: Buffer;
```

###### value

```ts
value: number;
```

##### witnessScript?

```ts
optional witnessScript: Buffer<ArrayBufferLike>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L21)

##### tapInternalKey?

```ts
optional tapInternalKey: Buffer<ArrayBufferLike>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L22)

***

### UtxoForPsbt

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L30)

UTXO information for PSBT construction.

Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L32)

Transaction ID of the UTXO

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L34)

Output index (vout) of the UTXO

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L36)

Value of the UTXO in satoshis

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L38)

ScriptPubKey of the UTXO (hex string)

##### witnessScript?

```ts
optional witnessScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L40)

Witness script (required for P2WSH)

***

### WaitForTransactionReceiptSmartAwareParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L40)

#### Properties

##### publicClient

```ts
publicClient: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L41)

##### walletAddress

```ts
walletAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L42)

##### hash

```ts
hash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L43)

##### confirmations?

```ts
optional confirmations: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L44)

##### timeout?

```ts
optional timeout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L49)

Forwarded to viem on the EOA (externally owned account) path.
Ignored on the smart-account path — see safePollTimeoutMs.

##### safePollTimeoutMs?

```ts
optional safePollTimeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L51)

Total budget for waiting on Safe quorum + execution. Default 4h.

##### safePollIntervalMs?

```ts
optional safePollIntervalMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L53)

Poll cadence against the Safe Transaction Service. Default 5s.

***

### ComputeBaseFeeParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L23)

#### Properties

##### numInputs

```ts
numInputs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L24)

##### numOutputs

```ts
numOutputs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L31)

Number of outputs in the unfunded transaction (HTLC vault outputs +
CPFP anchor + optional auth-anchor OP_RETURN). Excludes the change
output — `applyChangeOutputPolicy` adds the change-output fee
separately.

##### feeRate

```ts
feeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L32)

***

### ApplyChangeOutputPolicyParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L75)

#### Properties

##### totalInputValue

```ts
totalInputValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:76](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L76)

##### peginAmount

```ts
peginAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L77)

##### baseFee

```ts
baseFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L78)

##### changeOutputFee

```ts
changeOutputFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L79)

***

### ChangeOutputPolicyResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L82)

#### Properties

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L84)

Final transaction fee (sats).

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L90)

Final change amount (sats). 0n when no change output is emitted.
When `emitChangeOutput` is false, the would-be change is paid to
miners as part of `fee` — i.e. it is dust by policy.

##### emitChangeOutput

```ts
emitChangeOutput: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L92)

Whether the funded transaction must include a change output.

***

### ComputeMaxDepositParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L149)

#### Properties

##### numInputs

```ts
numInputs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L150)

##### numOutputs

```ts
numOutputs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:157](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L157)

Number of outputs in the unfunded transaction. Use the worst-case
count for the use case being budgeted (e.g. max-batch with
auth-anchor) — `computeMaxDeposit` is intentionally an UPPER BOUND
and assumes no change output.

##### totalBalance

```ts
totalBalance: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:158](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L158)

##### feeRate

```ts
feeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:159](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L159)

***

### FundPeginTransactionParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L23)

#### Properties

##### unfundedTxHex

```ts
unfundedTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L25)

Unfunded transaction hex from SDK (0 inputs, vault + depositor claim outputs)

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L27)

Selected UTXOs to use as inputs

##### changeAddress

```ts
changeAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L29)

Change address (from wallet)

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L31)

Change amount in satoshis

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L33)

Bitcoin network

***

### UtxoRef

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L23)

Reference to a Bitcoin UTXO by its outpoint (txid + vout).

Used by the availability check to compare a Pre-PegIn transaction's
declared inputs against the wallet's current spendable set. Txids are
compared case-insensitively; callers should treat the txid as opaque
lowercase hex.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L24)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L25)

***

### MissingUtxoInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L31)

Information about a missing/spent UTXO.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L33)

Transaction ID of the missing UTXO

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L35)

Output index of the missing UTXO

***

### UtxoValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L41)

Result of UTXO validation.

#### Properties

##### allAvailable

```ts
allAvailable: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L43)

Whether all UTXOs are still available

##### missingUtxos

```ts
missingUtxos: MissingUtxoInfo[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L45)

List of missing UTXOs (if any)

##### totalInputs

```ts
totalInputs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L47)

Total number of inputs checked

***

### UTXO

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L19)

Unspent Transaction Output (UTXO) for funding peg-in transactions.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L23)

Transaction ID of the UTXO (64-char hex without 0x prefix).

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L28)

Output index within the transaction.

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L33)

Value in satoshis.

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L38)

Script public key hex.

***

### UTXOSelectionResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L41)

#### Properties

##### selectedUTXOs

```ts
selectedUTXOs: UTXO[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L42)

##### totalValue

```ts
totalValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L43)

##### fee

```ts
fee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L44)

##### changeAmount

```ts
changeAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L45)

## Functions

### getNetwork()

```ts
function getNetwork(network): Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:315](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L315)

Map SDK network type to bitcoinjs-lib Network object.

#### Parameters

##### network

[`Network`](primitives.md#network)

Network type ("bitcoin", "testnet", "signet", "regtest")

#### Returns

`Network`

bitcoinjs-lib Network object

***

### getPsbtInputFields()

```ts
function getPsbtInputFields(utxo, publicKeyNoCoord?): PsbtInputFields;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/psbtInputFields.ts#L53)

Get PSBT input fields for a given UTXO based on its script type.

Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.

#### Parameters

##### utxo

[`UtxoForPsbt`](#utxoforpsbt)

The unspent transaction output to process

##### publicKeyNoCoord?

`Buffer`\<`ArrayBufferLike`\>

The x-only public key (32 bytes) for Taproot signing

#### Returns

[`PsbtInputFields`](#psbtinputfields)

PSBT input fields object containing the necessary data

#### Throws

Error if required input data is missing or unsupported script type

***

### getScriptType()

```ts
function getScriptType(scriptPubKey): BitcoinScriptType;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L35)

Detect the type of a Bitcoin script.

#### Parameters

##### scriptPubKey

`Buffer`

The script public key buffer

#### Returns

[`BitcoinScriptType`](#bitcoinscripttype)

The detected script type

#### Example

```typescript
const scriptType = getScriptType(Buffer.from(scriptPubKeyHex, 'hex'));
if (scriptType === BitcoinScriptType.P2TR) {
  // Handle Taproot input
}
```

***

### waitForTransactionReceiptSmartAware()

```ts
function waitForTransactionReceiptSmartAware(params): Promise<TransactionReceipt>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/utils/eth/waitForTransactionReceiptSmartAware.ts#L56)

#### Parameters

##### params

[`WaitForTransactionReceiptSmartAwareParams`](#waitfortransactionreceiptsmartawareparams)

#### Returns

`Promise`\<`TransactionReceipt`\>

***

### rateBasedTxBufferFee()

```ts
function rateBasedTxBufferFee(feeRate): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L40)

Adds a buffer to the transaction fee calculation if the fee rate is low.

Some wallets have a relayer fee requirement. If the fee rate is <= 2 sat/vbyte,
there's a risk the fee might not be sufficient for transaction relay.
We add a buffer to ensure the transaction can be relayed.

#### Parameters

##### feeRate

`number`

Fee rate in satoshis per vbyte

#### Returns

`number`

Buffer amount in satoshis to add to the transaction fee

***

### peginOutputCount()

```ts
function peginOutputCount(vaultCount, hasAuthAnchor): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L80)

Compute the total number of outputs (before change) in a Pre-PegIn
transaction.

A Pre-PegIn tx has: N HTLC outputs (one per vault) + optional
auth-anchor OP_RETURN output + fixed outputs (CPFP anchor). This
count is used for fee estimation only — the change output is handled
separately by `selectUtxosForPegin` when the change amount exceeds
the dust threshold.

#### Parameters

##### vaultCount

`number`

Number of vaults in the batch (≥1).

##### hasAuthAnchor

`boolean`

Whether the Pre-PegIn will carry an auth-anchor
                         OP_RETURN output. Pass the same value the
                         caller will hand to `buildPrePeginPsbt`'s
                         `authAnchorHash` (truthy ↔ true) so the fee
                         budget stays in lockstep with the output set.

#### Returns

`number`

Total output count before change.

#### Throws

If `vaultCount` is not a positive integer.

***

### computePeginBaseFeeSats()

```ts
function computePeginBaseFeeSats(params): bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L42)

Compute the base fee (sats) for a Pre-PegIn transaction with no change
output, including the low-fee-rate buffer.

Used as the starting point by `applyChangeOutputPolicy`, which then
decides whether to add the incremental change-output fee.

#### Parameters

##### params

[`ComputeBaseFeeParams`](#computebasefeeparams)

#### Returns

`bigint`

***

### computeChangeOutputFeeSats()

```ts
function computeChangeOutputFeeSats(feeRate): bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L71)

Incremental fee (sats) for adding one P2TR-sized change output at the
given fee rate. Does NOT include the low-fee-rate buffer — that is part
of the base fee, paid once per transaction.

#### Parameters

##### feeRate

`number`

#### Returns

`bigint`

***

### applyChangeOutputPolicy()

```ts
function applyChangeOutputPolicy(params): ChangeOutputPolicyResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:115](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L115)

Apply the change-output dust policy: emit a change output iff the
post-change-output-fee residual strictly exceeds DUST_THRESHOLD.

Returns `{ fee, changeAmount, emitChangeOutput }` so the selector and
funder both end up with the same fee and same change decision for the
same inputs.

Inputs:
- `totalInputValue`: sum of selected UTXO values
- `peginAmount`: amount being pegged in
- `baseFee`: fee assuming no change output (from `computePeginBaseFeeSats`)
- `changeOutputFee`: incremental fee for adding one change output
  (from `computeChangeOutputFeeSats`)

#### Parameters

##### params

[`ApplyChangeOutputPolicyParams`](#applychangeoutputpolicyparams)

#### Returns

[`ChangeOutputPolicyResult`](#changeoutputpolicyresult)

#### Throws

If `totalInputValue < peginAmount + baseFee` (insufficient funds
  even before considering change). Callers that need to surface
  "insufficient funds" with their own error wording should check the
  precondition themselves before invoking this.

***

### computeMaxDeposit()

```ts
function computeMaxDeposit(params): bigint | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts#L170)

Compute the maximum depositable amount (sats) given a fixed-cost
sweep: every UTXO is spent, no change output is emitted, fee is the
base fee for the requested input/output count.

Returns null when `totalBalance <= 0n`. Returns 0n if the base fee
alone exceeds the balance.

#### Parameters

##### params

[`ComputeMaxDepositParams`](#computemaxdepositparams)

#### Returns

`bigint` \| `null`

***

### createTaprootScriptPathSignOptions()

```ts
function createTaprootScriptPathSignOptions(publicKey, inputCount): SignPsbtOptions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/signing.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/utils/signing.ts#L15)

Create SignPsbtOptions for Taproot script-path PSBT signing.

All vault protocol signing operations are Taproot script-path spends that
require `useTweakedSigner: false` (untweaked key) and `autoFinalized: false`
(to preserve tapScriptSig for Schnorr signature extraction).

#### Parameters

##### publicKey

`string`

Signer's BTC public key (hex). Accepts both compressed
  (66-char) and x-only (64-char) formats — the wallet connector handles both.

##### inputCount

`number`

Number of inputs to sign. Generates entries
  for indices 0 through inputCount-1.

#### Returns

[`SignPsbtOptions`](managers.md#signpsbtoptions)

***

### calculateBtcTxHash()

```ts
function calculateBtcTxHash(txHex): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/btcTxHash.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/btcTxHash.ts#L23)

Calculate Bitcoin transaction hash

This matches the contract's BtcUtils.hashBtcTx() implementation:
1. Double SHA256 the transaction bytes
2. Reverse the byte order (Bitcoin convention)

The resulting hash is used as the unique vault identifier in the BTCVaultRegistry contract.

#### Parameters

##### txHex

`string`

Transaction hex (with or without 0x prefix)

#### Returns

`` `0x${string}` ``

The transaction hash as Hex (with 0x prefix)

***

### parseUnfundedWasmTransaction()

```ts
function parseUnfundedWasmTransaction(unfundedTxHex): ParsedUnfundedTx;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L64)

Parses an unfunded transaction hex from WASM.

WASM produces witness-format transactions with 0 inputs, which bitcoinjs-lib cannot parse.
This function manually extracts the transaction components.

Format: [version:4bytes][marker:0x00][flag:0x01][inputs:1byte=0x00][outputCount:1byte]
        [output1: value:8bytes + scriptLen:1byte + script:N bytes]
        [output2: ...]
        [locktime:4bytes]

#### Parameters

##### unfundedTxHex

`string`

Raw transaction hex from WASM

#### Returns

`ParsedUnfundedTx`

Parsed transaction components

#### Throws

Error if transaction structure is invalid

***

### fundPeginTransaction()

```ts
function fundPeginTransaction(params): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts:129](../../packages/babylon-ts-sdk/src/tbv/core/utils/transaction/fundPeginTransaction.ts#L129)

Funds an unfunded peg-in transaction by adding inputs and change output.

Takes an unfunded transaction template (0 inputs, 1 vault output) from the SDK
and adds UTXO inputs and a change output to create a funded transaction ready
for wallet signing.

#### Parameters

##### params

[`FundPeginTransactionParams`](#fundpegintransactionparams)

Transaction funding parameters

#### Returns

`string`

Transaction hex string ready for wallet signing

***

### extractInputsFromTransaction()

```ts
function extractInputsFromTransaction(unsignedTxHex): object[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L75)

Extract input references (txid:vout) from an unsigned transaction.

#### Parameters

##### unsignedTxHex

`string`

Unsigned transaction hex

#### Returns

`object`[]

Array of input references

***

### validateUtxosAvailable()

```ts
function validateUtxosAvailable(unsignedTxHex, availableUtxos): UtxoValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:109](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L109)

Validate that all UTXOs in a transaction are still available.

Pure function — accepts pre-fetched UTXOs instead of making network calls.
This should be called BEFORE signing to avoid wasting user effort
signing a transaction that will fail to broadcast.

#### Parameters

##### unsignedTxHex

`string`

Unsigned transaction hex

##### availableUtxos

[`UtxoRef`](#utxoref)[]

Pre-fetched list of available UTXOs for the depositor

#### Returns

[`UtxoValidationResult`](#utxovalidationresult)

Validation result with missing UTXO details

***

### assertUtxosAvailable()

```ts
function assertUtxosAvailable(unsignedTxHex, availableUtxos): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts:168](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/availability.ts#L168)

Validate UTXOs and throw if any are not available.

Pure convenience function that combines validation and error throwing.

#### Parameters

##### unsignedTxHex

`string`

Unsigned transaction hex

##### availableUtxos

[`UtxoRef`](#utxoref)[]

Pre-fetched list of available UTXOs for the depositor

#### Returns

`void`

#### Throws

UtxoNotAvailableError if any UTXOs are not available

#### Throws

Error if validation fails

***

### selectUtxosForPegin()

```ts
function selectUtxosForPegin(
   availableUTXOs, 
   peginAmount, 
   feeRate, 
   numOutputs): UTXOSelectionResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L87)

Selects UTXOs to fund a peg-in transaction with iterative fee calculation.

This function implements the btc-staking-ts approach:
1. Filter UTXOs for script validity (no minimum value filter)
2. Sort by value (largest first) to minimize number of inputs
3. Iteratively add UTXOs and recalculate fee until we have enough

The fee recalculation is critical because:
- Each UTXO added increases transaction size → increases fee
- More fee needed might require another UTXO
- Change output detection affects fee (adds output size if needed)

#### Parameters

##### availableUTXOs

[`UTXO`](#utxo)[]

All available UTXOs from wallet

##### peginAmount

`bigint`

Amount to peg in (satoshis)

##### feeRate

`number`

Fee rate (sat/vbyte)

##### numOutputs

`number`

Number of outputs in the unfunded transaction (HTLC + CPFP anchor, before change)

#### Returns

[`UTXOSelectionResult`](#utxoselectionresult)

Selected UTXOs, total value, calculated fee, and change amount

#### Throws

Error if insufficient funds or no valid UTXOs

***

### shouldAddChangeOutput()

```ts
function shouldAddChangeOutput(changeAmount): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:176](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L176)

Checks if change amount is above dust threshold.

#### Parameters

##### changeAmount

`bigint`

Change amount in satoshis

#### Returns

`boolean`

true if change should be added as output, false if it should go to miners

***

### getDustThreshold()

```ts
function getDustThreshold(): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts:185](../../packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts#L185)

Gets the dust threshold value.

#### Returns

`number`

Dust threshold in satoshis

## Enumerations

### BitcoinScriptType

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L12)

Bitcoin script types.

#### Enumeration Members

##### P2PKH

```ts
P2PKH: "P2PKH";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:13](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L13)

##### P2SH

```ts
P2SH: "P2SH";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L14)

##### P2WPKH

```ts
P2WPKH: "P2WPKH";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L15)

##### P2WSH

```ts
P2WSH: "P2WSH";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L16)

##### P2TR

```ts
P2TR: "P2TR";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L17)

##### UNKNOWN

```ts
UNKNOWN: "UNKNOWN";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/utils/btc/scriptType.ts#L18)

## Variables

### P2TR\_INPUT\_SIZE

```ts
const P2TR_INPUT_SIZE: 58 = 58;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:7](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L7)

Fee calculation constants for Bitcoin transactions.
Based on btc-staking-ts values, adapted for vault peg-in transactions.

***

### MAX\_NON\_LEGACY\_OUTPUT\_SIZE

```ts
const MAX_NON_LEGACY_OUTPUT_SIZE: 43 = 43;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:10](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L10)

***

### TX\_BUFFER\_SIZE\_OVERHEAD

```ts
const TX_BUFFER_SIZE_OVERHEAD: 11 = 11;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:13](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L13)

***

### BTC\_DUST\_SAT

```ts
const BTC_DUST_SAT: 546 = 546;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L16)

***

### DUST\_THRESHOLD

```ts
const DUST_THRESHOLD: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L19)

Pre-computed BigInt dust threshold to avoid repeated conversions in hot paths

***

### LOW\_RATE\_ESTIMATION\_ACCURACY\_BUFFER

```ts
const LOW_RATE_ESTIMATION_ACCURACY_BUFFER: 30 = 30;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L22)

***

### WALLET\_RELAY\_FEE\_RATE\_THRESHOLD

```ts
const WALLET_RELAY_FEE_RATE_THRESHOLD: 2 = 2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L25)

***

### FEE\_SAFETY\_MARGIN

```ts
const FEE_SAFETY_MARGIN: 1.1 = 1.1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L28)

***

### PEGIN\_FIXED\_OUTPUTS

```ts
const PEGIN_FIXED_OUTPUTS: 1 = 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L50)

Number of always-present fixed (non-HTLC) outputs in a Pre-PegIn
transaction. Currently this is 1 CPFP anchor output.

***

### PEGIN\_AUTH\_ANCHOR\_OUTPUTS

```ts
const PEGIN_AUTH_ANCHOR_OUTPUTS: 1 = 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L59)

Size of the auth-anchor `OP_RETURN` output when committed into a
Pre-PegIn. The output carries `OP_RETURN <PUSH32 hash>` = 34 script
bytes, plus 8 bytes value + 1 byte scriptLen = ~43 bytes total —
same as [MAX\_NON\_LEGACY\_OUTPUT\_SIZE](#max_non_legacy_output_size). Counted as one output
toward the fee-estimation output budget.

***

### SPLIT\_TX\_FEE\_SAFETY\_MULTIPLIER

```ts
const SPLIT_TX_FEE_SAFETY_MULTIPLIER: 5 = 5;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/utils/fee/constants.ts#L102)

Safety multiplier for split transaction fee validation.
The signed PSBT's fee rate and absolute fee must not exceed this multiple
of the planned values. 5x accounts for witness estimation variance while
catching catastrophic wallet-side overpayment.

***

### HEX\_RE

```ts
const HEX_RE: RegExp;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts:9](../../packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts#L9)

Non-empty string of hexadecimal characters (case-insensitive).

***

### TXID\_RE

```ts
const TXID_RE: RegExp;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts#L12)

Bitcoin txid: exactly 64 hex characters (32 bytes).

***

### BITCOIN\_ADDRESS\_RE

```ts
const BITCOIN_ADDRESS_RE: RegExp;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts#L21)

Bitcoin address format gate: 25–90 alphanumeric characters.
Covers legacy (P2PKH/P2SH), bech32 (P2WPKH/P2WSH), bech32m (P2TR),
and regtest addresses (bcrt1... which are 62–64 chars for 32-byte witness programs).
Upper bound of 90 provides headroom for future address formats.
This is a format gate to prevent path-traversal — not full address validation.

***

### KNOWN\_SCRIPT\_PREFIXES

```ts
const KNOWN_SCRIPT_PREFIXES: readonly ["76a914", "a914", "0014", "0020", "5120"];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts#L31)

Known Bitcoin scriptPubKey prefixes:
- P2PKH:  76a914...88ac (25 bytes)
- P2SH:   a914...87    (23 bytes)
- P2WPKH: 0014...      (22 bytes)
- P2WSH:  0020...      (34 bytes)
- P2TR:   5120...      (34 bytes)

***

### MAX\_REASONABLE\_FEE\_SATS

```ts
const MAX_REASONABLE_FEE_SATS: 1000000n = 1_000_000n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/utils/validation.ts#L45)

Upper bound on the implied miner fee (0.01 BTC = 1,000,000 sats).
Catches inflated input values from a compromised mempool API — if inputs are
grossly overstated the implied fee becomes unreasonably large. The April 2024
Runes spike saw ~450 sat/vB; at 500 vB that's ~225k sats, well under this cap.
