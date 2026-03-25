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
- buildPeginPsbt - Create unfunded peg-in transaction
- [buildPayoutPsbt](#buildpayoutpsbt) - Create payout PSBT for signing
- [extractPayoutSignature](#extractpayoutsignature) - Extract Schnorr signature from signed PSBT
- [buildDepositorPayoutPsbt](#builddepositorpayoutpsbt) - Create depositor's own Payout PSBT (depositor-as-claimer path)
- [buildNoPayoutPsbt](#buildnopayoutpsbt) - Create NoPayout PSBT per challenger (depositor-as-claimer path)
- [buildChallengeAssertPsbt](#buildchallengeassertpsbt) - Create ChallengeAssert PSBT per challenger (depositor-as-claimer path)

### Script Generators
- [createPayoutScript](#createpayoutscript) - Generate taproot payout script

### Challenger Counting
- [computeNumLocalChallengers](#computenumlocalchallengers) - Compute number of local challengers for a vault

### WASM Functions
- [computeMinClaimValue](#computeminclaimvalue) - Compute the minimum claim value accepted by the vault provider

### Connector Parameter Types
- `AssertPayoutNoPayoutConnectorParams` - Connector params for NoPayout/AssertPayout PSBTs
- `ChallengeAssertConnectorParams` - Connector params for ChallengeAssert PSBTs
- `PayoutConnectorParams` - Connector params for Payout PSBTs

### Bitcoin Utilities
- [processPublicKeyToXOnly](#processpublickeytoxonly) - Convert any pubkey format to x-only
- [validateWalletPubkey](#validatewalletpubkey) - Validate wallet matches expected depositor
- [hexToUint8Array](#hextouint8array) / [uint8ArrayToHex](#uint8arraytohex) - Hex conversion
- [stripHexPrefix](#striphexprefix) / [isValidHex](#isvalidhex) - Hex validation
- [toXOnly](#toxonly) - Convert compressed pubkey bytes to x-only

## See

[Primitives Quickstart](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/quickstart/primitives.md)

## Interfaces

### PayoutConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:115

Parameters for creating a payout connector

#### Properties

##### depositor

```ts
depositor: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:117

X-only public key of the depositor (hex encoded)

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:119

X-only public key of the vault provider (hex encoded)

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:121

Array of x-only public keys of vault keepers (hex encoded)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:123

Array of x-only public keys of universal challengers (hex encoded)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:125

CSV timelock in blocks for the PegIn output

***

### AssertPayoutNoPayoutConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:144

Parameters for creating an Assert Payout/NoPayout connector.
This connector generates scripts for the depositor's own graph (depositor-as-claimer).

#### Properties

##### claimer

```ts
claimer: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:146

X-only public key of the claimer (depositor acting as claimer, hex encoded)

##### localChallengers

```ts
localChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:148

Array of x-only public keys of local challengers (hex encoded)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:150

Array of x-only public keys of universal challengers (hex encoded)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:152

CSV timelock in blocks for the Assert output

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:154

Array of x-only public keys of security council members (hex encoded)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:156

Council quorum (M-of-N multisig threshold)

***

### ChallengeAssertConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:180

Parameters for creating a ChallengeAssert connector.
This connector generates scripts for the ChallengeAssert transaction.

#### Properties

##### claimer

```ts
claimer: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:182

X-only public key of the claimer (depositor acting as claimer, hex encoded)

##### challenger

```ts
challenger: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:184

X-only public key of the challenger (hex encoded)

##### lamportHashesJson

```ts
lamportHashesJson: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:186

JSON string of Lamport hash values from VP

##### gcInputLabelHashesJson

```ts
gcInputLabelHashesJson: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:188

JSON string of GC input label hashes from VP

***

### ChallengeAssertParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L30)

Parameters for building a ChallengeAssert PSBT

#### Properties

##### challengeAssertTxHex

```ts
challengeAssertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L32)

ChallengeAssert transaction hex (unsigned) from VP

##### prevouts

```ts
prevouts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L34)

Prevouts for all inputs [{script_pubkey, value}] from VP (flat, one per input)

###### script\_pubkey

```ts
script_pubkey: string;
```

###### value

```ts
value: number;
```

##### connectorParamsPerInput

```ts
connectorParamsPerInput: ChallengeAssertConnectorParams[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L36)

Per-input connector params (one per input/segment, determines the taproot script)

***

### DepositorPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L36)

Parameters for building a depositor Payout PSBT

#### Properties

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L38)

Payout transaction hex (unsigned) from VP

##### prevouts

```ts
prevouts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L40)

Prevouts for all inputs [{script_pubkey, value}] from VP

###### script\_pubkey

```ts
script_pubkey: string;
```

###### value

```ts
value: number;
```

##### connectorParams

```ts
connectorParams: PayoutConnectorParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L42)

Parameters for the PeginPayout connector (depositor, VP, VKs, UCs, timelock)

***

### NoPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L28)

Parameters for building a NoPayout PSBT

#### Properties

##### noPayoutTxHex

```ts
noPayoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L30)

NoPayout transaction hex (unsigned) from VP

##### challengerPubkey

```ts
challengerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L32)

Challenger's x-only public key (hex encoded)

##### prevouts

```ts
prevouts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L34)

Prevouts for all inputs [{script_pubkey, value}] from VP

###### script\_pubkey

```ts
script_pubkey: string;
```

###### value

```ts
value: number;
```

##### connectorParams

```ts
connectorParams: AssertPayoutNoPayoutConnectorParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L36)

Parameters for the Assert Payout/NoPayout connector

***

### PayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L36)

Parameters for building an unsigned Payout PSBT

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Properties

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L41)

Payout transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L47)

Assert transaction hex
Payout input 1 references Assert output 0

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L53)

Peg-in transaction hex
This transaction created the vault output that we're spending

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L58)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L63)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L68)

Vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L73)

Universal challenger BTC public keys (x-only, 64-char hex)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L78)

CSV timelock in blocks for the PegIn output.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L83)

Bitcoin network

***

### PayoutPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L89)

Result of building an unsigned payout PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:93](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L93)

Unsigned PSBT hex ready for signing

***

### PrePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L28)

Parameters for building an unfunded Pre-PegIn PSBT

#### Properties

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L30)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L32)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L34)

Array of vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L36)

Array of universal challenger BTC public keys (x-only, 64-char hex)

##### hashH

```ts
hashH: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L38)

SHA256 hash commitment (64 hex chars = 32 bytes)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L40)

CSV timelock in blocks for the HTLC refund path

##### pegInAmount

```ts
pegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L42)

Amount to peg in (satoshis)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L44)

Fee rate in sat/vB from contract offchain params

##### numLocalChallengers

```ts
numLocalChallengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L46)

Number of local challengers (from contract params)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L48)

M in M-of-N council multisig (from contract params)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L50)

N in M-of-N council multisig (from contract params)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L52)

Bitcoin network

***

### PrePeginPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L58)

Result of building an unfunded Pre-PegIn transaction

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L68)

Unfunded transaction hex (no inputs, HTLC output + CPFP anchor).

The caller is responsible for:
- Selecting UTXOs covering totalOutputValue + network fees
- Funding the transaction (add inputs and change output)
- Computing the funded transaction's txid
- Calling buildPeginTxFromFundedPrePegin() with the funded txid

##### totalOutputValue

```ts
totalOutputValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L70)

Sum of all unfunded outputs (HTLC + CPFP anchor) — use this for UTXO selection

##### htlcValue

```ts
htlcValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L72)

HTLC output value in satoshis (output 0 only, includes peginAmount + depositorClaimValue + minPeginFee)

##### htlcScriptPubKey

```ts
htlcScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L74)

HTLC output scriptPubKey (hex encoded)

##### htlcAddress

```ts
htlcAddress: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:76](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L76)

HTLC Taproot address

##### peginAmount

```ts
peginAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L78)

Pegin amount in satoshis

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L80)

Depositor claim value computed by WASM from contract parameters

***

### BuildPeginTxParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L86)

Parameters for building the PegIn transaction from a funded Pre-PegIn txid

#### Properties

##### prePeginParams

```ts
prePeginParams: PrePeginParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L88)

Same PrePeginParams used to create the Pre-PegIn transaction

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L90)

CSV timelock in blocks for the PegIn vault output

##### fundedPrePeginTxid

```ts
fundedPrePeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L92)

Txid of the funded Pre-PegIn transaction (hex, 64 chars)

***

### PeginTxResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:98](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L98)

Result of building the PegIn transaction

#### Properties

##### txHex

```ts
txHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L100)

PegIn transaction hex (1 input spending HTLC, 1 vault output)

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L102)

PegIn transaction ID

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L104)

Vault output scriptPubKey (hex encoded)

##### vaultValue

```ts
vaultValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L106)

Vault output value in satoshis

***

### BuildPeginInputPsbtParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:26](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L26)

Parameters for building the PegIn input PSBT

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L31)

PegIn transaction hex (1 input spending Pre-PegIn HTLC output 0).
Returned by buildPeginTxFromFundedPrePegin().

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L36)

Funded Pre-PegIn transaction hex.
Used to look up the HTLC output that the PegIn input spends.

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L38)

Depositor's BTC public key (x-only, 64-char hex)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L40)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L42)

Vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L44)

Universal challenger BTC public keys (x-only, 64-char hex)

##### hashH

```ts
hashH: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L46)

SHA256 hash commitment (64 hex chars = 32 bytes)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L48)

CSV timelock in blocks for the HTLC refund path

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L50)

Bitcoin network

***

### BuildPeginInputPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L56)

Result of building the PegIn input PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L58)

PSBT hex for the depositor to sign

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

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L66)

CSV timelock in blocks for the PegIn output.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L74)

Bitcoin network for script generation.

Must match the network used for all other vault operations to ensure
address encoding compatibility.

***

### PayoutScriptResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L83)

Result of creating a payout script.

Contains all the taproot-related data needed for constructing and signing
payout transactions from the vault.

#### Properties

##### payoutScript

```ts
payoutScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:91](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L91)

The payout script hex used in taproot script path spending.

This is the raw script bytes that define the spending conditions,
encoded as a hexadecimal string. Used when constructing the
tapLeafScript for PSBT signing.

##### taprootScriptHash

```ts
taprootScriptHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L99)

The taproot script hash (leaf hash) for the payout script.

This is the tagged hash of the script used in taproot tree construction.
Required for computing the control block during script path spending.

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L107)

The full scriptPubKey for the vault output address.

This is the complete output script (OP_1 <32-byte-key>) that should be
used when creating the vault output in a peg-in transaction.

##### address

```ts
address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:115](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L115)

The vault Bitcoin address derived from the script.

A human-readable bech32m address (bc1p... for mainnet, tb1p... for testnet/signet)
that can be used to receive funds into the vault.

***

### WalletPubkeyValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:164](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L164)

Result of validating a wallet public key against an expected depositor public key.

#### Properties

##### walletPubkeyRaw

```ts
walletPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:166](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L166)

Wallet's raw public key (as returned by wallet, may be compressed)

##### walletPubkeyXOnly

```ts
walletPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:168](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L168)

Wallet's public key in x-only format (32 bytes, 64 hex chars)

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L170)

The validated depositor public key (x-only format)

## Type Aliases

### Network

```ts
type Network = "bitcoin" | "testnet" | "regtest" | "signet";
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:4

Bitcoin network types supported by the vault system

## Functions

### computeNumLocalChallengers()

```ts
function computeNumLocalChallengers(
  vaultProviderPubkey: string,
  vaultKeeperPubkeys: string[],
  depositorPubkey: string,
): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/challengers.ts](../../packages/babylon-ts-sdk/src/tbv/core/primitives/challengers.ts)

Compute the number of local challengers for a vault.

Mirrors the vault provider's `compute_num_challengers()` logic:
local challengers = {vault\_provider} ∪ {vault\_keepers} − {depositor}

Keys are normalized to x-only lowercase hex before comparison, so `0x`-prefixed, compressed, or mixed-case keys are handled correctly.

#### Parameters

##### vaultProviderPubkey

`string`

Vault provider BTC public key

##### vaultKeeperPubkeys

`string[]`

Vault keeper BTC public keys

##### depositorPubkey

`string`

Depositor (claimer) BTC public key

#### Returns

`number`

Number of local challengers

---

### computeMinClaimValue()

```ts
function computeMinClaimValue(
   numLocalChallengers, 
   numUniversalChallengers, 
   councilQuorum, 
   councilSize, 
feeRate): Promise<bigint>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts:51

Compute the minimum depositor claim value (PegIn output 1) in satoshis.

This covers the full downstream tx graph cost (Claim → Assert → Payout)
based on the protocol parameters.

#### Parameters

##### numLocalChallengers

`number`

##### numUniversalChallengers

`number`

##### councilQuorum

`number`

##### councilSize

`number`

##### feeRate

`bigint`

#### Returns

`Promise`\<`bigint`\>

***

### buildChallengeAssertPsbt()

```ts
function buildChallengeAssertPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L49)

Build unsigned ChallengeAssert PSBT.

The ChallengeAssert transaction has 3 inputs (one per Assert output segment).
Each input has its own taproot script derived from its connector params.
The depositor signs all inputs.

#### Parameters

##### params

[`ChallengeAssertParams`](#challengeassertparams)

ChallengeAssert parameters

#### Returns

`Promise`\<`string`\>

Unsigned PSBT hex ready for signing

***

### buildDepositorPayoutPsbt()

```ts
function buildDepositorPayoutPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L55)

Build unsigned depositor Payout PSBT.

The depositor's payout transaction has 2 inputs:
- Input 0: PegIn:0 (vault UTXO) — depositor signs using PeginPayoutConnector payout script
- Input 1: Assert:0 — NOT signed by depositor

#### Parameters

##### params

[`DepositorPayoutParams`](#depositorpayoutparams)

Depositor payout parameters

#### Returns

`Promise`\<`string`\>

Unsigned PSBT hex ready for signing

***

### buildNoPayoutPsbt()

```ts
function buildNoPayoutPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L48)

Build unsigned NoPayout PSBT.

The NoPayout transaction is specific to each challenger.
Input 0 is the one the depositor signs using the NoPayout taproot script path.

#### Parameters

##### params

[`NoPayoutParams`](#nopayoutparams)

NoPayout parameters

#### Returns

`Promise`\<`string`\>

Unsigned PSBT hex ready for signing

***

### buildPayoutPsbt()

```ts
function buildPayoutPsbt(params): Promise<PayoutPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:117](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L117)

Build unsigned Payout PSBT for depositor to sign.

Payout is used in the **challenge path** when the claimer proves validity:
1. Vault provider submits Claim transaction
2. Challenge is raised during challenge period
3. Claimer submits Assert transaction to prove validity
4. Payout can be executed (references Assert tx)

Payout transactions have the following structure:
- Input 0: from PeginTx output0 (signed by depositor)
- Input 1: from Assert output0 (NOT signed by depositor)

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
function extractPayoutSignature(
   signedPsbtHex, 
   depositorPubkey, 
   inputIndex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:272](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L272)

Extract Schnorr signature from signed payout PSBT.

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

##### inputIndex

`number` = `0`

Input index to extract signature from (default: 0)

#### Returns

`string`

64-byte Schnorr signature (128 hex characters, no sighash flag)

#### Throws

If no signature is found in the PSBT

#### Throws

If the signature has an unexpected length

***

### buildPrePeginPsbt()

```ts
function buildPrePeginPsbt(params): Promise<PrePeginPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:120](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L120)

Build unfunded Pre-PegIn transaction using WASM.

Creates a Bitcoin transaction template with no inputs, an HTLC output, and a
CPFP anchor output. The HTLC value is computed internally from the contract
parameters — the caller does not need to compute depositorClaimValue separately.

#### Parameters

##### params

[`PrePeginParams`](#prepeginparams)

Pre-PegIn parameters

#### Returns

`Promise`\<[`PrePeginPsbtResult`](#prepeginpsbtresult)\>

Unfunded Pre-PegIn transaction details with HTLC output information

#### Throws

If WASM initialization fails or parameters are invalid

***

### buildPeginTxFromFundedPrePegin()

```ts
function buildPeginTxFromFundedPrePegin(params): Promise<PeginTxResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:167](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L167)

Build the PegIn transaction from a funded Pre-PegIn txid.

The PegIn transaction spends Pre-PegIn output 0 via the HTLC hashlock leaf (leaf 0).
Since Pre-PegIn inputs must be SegWit/Taproot, the txid is stable after funding.

#### Parameters

##### params

[`BuildPeginTxParams`](#buildpegintxparams)

Build parameters including Pre-PegIn params and funded txid

#### Returns

`Promise`\<[`PeginTxResult`](#pegintxresult)\>

PegIn transaction details

#### Throws

If WASM initialization fails or parameters are invalid

***

### buildPeginInputPsbt()

```ts
function buildPeginInputPsbt(params): Promise<BuildPeginInputPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L80)

Build PSBT for depositor to sign the PegIn transaction's HTLC leaf 0 input.

The PegIn transaction spends the Pre-PegIn HTLC output (output 0) via the
hashlock + all-party script (leaf 0). The depositor provides one of the required
signatures; the vault provider and keepers provide theirs separately via the
signPeginInput RPC.

The PSBT uses Taproot script-path spending:
- witnessUtxo: the Pre-PegIn HTLC output
- tapLeafScript: hashlock leaf script + control block
- tapInternalKey: NUMS unspendable key (BIP-341 nothing-up-my-sleeve)

#### Parameters

##### params

[`BuildPeginInputPsbtParams`](#buildpegininputpsbtparams)

PegIn input PSBT parameters

#### Returns

`Promise`\<[`BuildPeginInputPsbtResult`](#buildpegininputpsbtresult)\>

PSBT hex ready for depositor signing

#### Throws

If PegIn tx does not have exactly 1 input

#### Throws

If PegIn input does not reference the Pre-PegIn HTLC output

#### Throws

If Pre-PegIn tx output 0 is not found

***

### extractPeginInputSignature()

```ts
function extractPeginInputSignature(signedPsbtHex, depositorPubkey): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:176](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L176)

Extract the depositor's Schnorr signature from a signed PegIn input PSBT.

Supports both non-finalized PSBTs (tapScriptSig) and finalized PSBTs (witness).

#### Parameters

##### signedPsbtHex

`string`

Signed PSBT hex

##### depositorPubkey

`string`

Depositor's x-only public key (64-char hex)

#### Returns

`string`

64-byte Schnorr signature (128 hex chars, no sighash flag)

#### Throws

If no signature is found for the depositor's key

***

### createPayoutScript()

```ts
function createPayoutScript(params): Promise<PayoutScriptResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L135)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L32)

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

### ensureHexPrefix()

```ts
function ensureHexPrefix(hex): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L45)

Ensure "0x" prefix on a hex string, returning viem's Hex type.

Ethereum/viem APIs expect `0x`-prefixed hex, but Bitcoin tooling
typically omits the prefix. This normalises either form.

#### Parameters

##### hex

`string`

Hex string with or without "0x" prefix

#### Returns

`` `0x${string}` ``

`0x`-prefixed hex string typed as viem Hex

***

### hexToUint8Array()

```ts
function hexToUint8Array(hex): Uint8Array;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L56)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L74)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L89)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L122)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:156](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L156)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L186)

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

***

### deriveTaprootAddress()

```ts
function deriveTaprootAddress(publicKeyHex, network): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:244](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L244)

Derive a Taproot (P2TR) address from a public key.

#### Parameters

##### publicKeyHex

`string`

Compressed (66 hex) or x-only (64 hex) public key

##### network

[`Network`](#network)

Bitcoin network

#### Returns

`string`

Taproot address (bc1p... / tb1p... / bcrt1p...)

***

### deriveNativeSegwitAddress()

```ts
function deriveNativeSegwitAddress(publicKeyHex, network): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:268](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L268)

Derive a Native SegWit (P2WPKH) address from a compressed public key.

#### Parameters

##### publicKeyHex

`string`

Compressed public key (66 hex chars, with or without 0x prefix)

##### network

[`Network`](#network)

Bitcoin network

#### Returns

`string`

Native SegWit address (bc1q... / tb1q... / bcrt1q...)

#### Throws

If publicKeyHex is not a compressed public key (66 hex chars)

***

### isAddressFromPublicKey()

```ts
function isAddressFromPublicKey(
   address, 
   publicKeyHex, 
   network): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:305](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L305)

Validate that a BTC address was derived from the given public key.

Derives Taproot (P2TR) and Native SegWit (P2WPKH) addresses from the
public key and checks if the provided address matches any of them.

When the input is an x-only key (64 hex chars), both possible compressed
keys (`02` + x and `03` + x) are tried for Native SegWit derivation,
since the y-parity is unknown.

#### Parameters

##### address

`string`

BTC address to validate

##### publicKeyHex

`string`

Public key from the wallet (x-only 64 or compressed 66 hex chars)

##### network

[`Network`](#network)

Bitcoin network

#### Returns

`boolean`

true if the address matches the public key
