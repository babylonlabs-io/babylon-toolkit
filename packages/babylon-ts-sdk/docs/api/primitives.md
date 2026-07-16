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
- [buildPrePeginPsbt](#buildprepeginpsbt) - Create unfunded Pre-PegIn transaction (HTLC outputs)
- [buildPeginTxFromFundedPrePegin](#buildpegintxfromfundedprepegin) - Derive PegIn tx from funded Pre-PegIn
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
- [computeMinPeginFee](#computeminpeginfee) - Compute the minimum PegIn activation tx fee that each HTLC must reserve

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

## Classes

### PsbtSubstitutionError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts#L19)

Thrown when a wallet-returned PSBT encodes a different unsigned
transaction than the one the caller asked the wallet to sign.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new PsbtSubstitutionError(detail): PsbtSubstitutionError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts#L20)

###### Parameters

###### detail

`string`

###### Returns

[`PsbtSubstitutionError`](#psbtsubstitutionerror)

###### Overrides

```ts
Error.constructor
```

## Interfaces

### PayoutConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:141

Parameters for creating a payout connector

#### Properties

##### txGraphVersion

```ts
txGraphVersion: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:148

Tx graph (vault-core) version selecting the builder inside the vault-wasm
facade. Fresh deposits use the contract's `activeVaultCoreVersion()`;
resumed vaults use their stamped `vaultCoreVersion`. The facade fails
closed on versions the shipped binary does not support.

##### depositor

```ts
depositor: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:150

X-only public key of the depositor (hex encoded)

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:152

X-only public key of the vault provider (hex encoded)

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:154

Array of x-only public keys of vault keepers (hex encoded)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:156

Array of x-only public keys of universal challengers (hex encoded)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:158

CSV timelock in blocks for the PegIn output

***

### AssertPayoutNoPayoutConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:179

Parameters for creating an Assert Payout/NoPayout connector.
This connector generates scripts for the depositor's own graph (depositor-as-claimer).

#### Properties

##### txGraphVersion

```ts
txGraphVersion: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:186

Tx graph (vault-core) version selecting the builder inside the vault-wasm
facade. Fresh deposits use the contract's `activeVaultCoreVersion()`;
resumed vaults use their stamped `vaultCoreVersion`. The facade fails
closed on versions the shipped binary does not support.

##### claimer

```ts
claimer: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:188

X-only public key of the claimer (depositor acting as claimer, hex encoded)

##### localChallengers

```ts
localChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:190

Array of x-only public keys of local challengers (hex encoded)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:192

Array of x-only public keys of universal challengers (hex encoded)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:194

CSV timelock in blocks for the Assert output

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:196

Array of x-only public keys of security council members (hex encoded)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:198

Council quorum (M-of-N multisig threshold)

***

### ChallengeAssertConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:222

Parameters for creating a ChallengeAssert connector.
This connector generates scripts for the ChallengeAssert transaction.

#### Properties

##### txGraphVersion

```ts
txGraphVersion: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:229

Tx graph (vault-core) version selecting the builder inside the vault-wasm
facade. Fresh deposits use the contract's `activeVaultCoreVersion()`;
resumed vaults use their stamped `vaultCoreVersion`. The facade fails
closed on versions the shipped binary does not support.

##### claimer

```ts
claimer: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:231

X-only public key of the claimer (depositor acting as claimer, hex encoded)

##### challenger

```ts
challenger: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:233

X-only public key of the challenger (hex encoded)

##### claimerWotsKeysJson

```ts
claimerWotsKeysJson: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:235

JSON string of WOTS public keys (blocks 0-1) from VP

##### gcWotsKeysJson

```ts
gcWotsKeysJson: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:237

JSON string of GC WOTS public keys (array of arrays) from VP

***

### AssertPsbtUnsignedTxMatchesParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts#L28)

#### Properties

##### requestedPsbtHex

```ts
requestedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts#L30)

PSBT we built locally and asked the wallet to sign.

##### returnedPsbtHex

```ts
returnedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts#L32)

PSBT the wallet returned after signing.

***

### ChallengeAssertParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L33)

Parameters for building a ChallengeAssert PSBT

#### Properties

##### challengeAssertTxHex

```ts
challengeAssertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L35)

ChallengeAssert transaction hex (unsigned)

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L37)

Authoritative Assert transaction hex — every input must spend an Assert output

##### connectorParamsPerInput

```ts
connectorParamsPerInput: ChallengeAssertConnectorParams[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L39)

Per-input connector params (one per input/segment, determines the taproot script)

***

### DepositorPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L39)

Parameters for building a depositor Payout PSBT

#### Properties

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L41)

Payout transaction hex (unsigned)

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L43)

Authoritative PegIn transaction hex — input 0 must spend PegIn:0

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L45)

Authoritative Assert transaction hex — input 1 must spend Assert:0

##### connectorParams

```ts
connectorParams: PayoutConnectorParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L47)

Parameters for the PeginPayout connector (depositor, VP, VKs, UCs, timelock)

***

### NoPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L32)

Parameters for building a NoPayout PSBT

#### Properties

##### noPayoutTxHex

```ts
noPayoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L34)

NoPayout transaction hex (unsigned) from VP

##### challengerPubkey

```ts
challengerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L36)

Challenger's x-only public key (hex encoded)

##### prevouts

```ts
prevouts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L38)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L40)

Parameters for the Assert Payout/NoPayout connector

***

### PayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L63)

Parameters for building an unsigned Payout PSBT

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L69)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion`. Selects which graph's
payout connector scripts are derived.

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L75)

Payout transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L81)

Assert transaction hex
Payout input 1 references Assert output 0

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L87)

Peg-in transaction hex
This transaction created the vault output that we're spending

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L92)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L97)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L102)

Vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L107)

Universal challenger BTC public keys (x-only, 64-char hex)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L112)

CSV timelock in blocks for the PegIn output.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:117](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L117)

Bitcoin network

##### claimerBtcPubkey

```ts
claimerBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:123](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L123)

Claimer's x-only BTC public key (64-char hex, no prefix). Drives role
inference (VP / depositor-as-claimer / VK-claimer) inside `buildPayoutPsbt`.

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L130)

On-chain registered depositor payout scriptPubKey (hex, 0x optional).
Expected outs[0].script for VP- and depositor-claimer roles; unused for
VK-claimer (its outs[0].script is derived from `claimerBtcPubkey`).

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:137](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L137)

VP commission in basis points (`BTCVaultRegistry.vaultProviderCommissionBps`).
Caps the VP-claimer outs[1].value. The protocol minimum is enforced
upstream; here only `0 <= bps < 10_000` is checked, for safe cap math.

***

### PayoutPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L143)

Result of building an unsigned payout PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:147](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L147)

Unsigned PSBT hex ready for signing

***

### PrePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L33)

Parameters for building an unfunded Pre-PegIn PSBT

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L40)

Vault core (tx-graph) version to build. Fresh deposits use the contract's
`ProtocolParams.activeVaultCoreVersion()`; resumed vaults use their
stamped on-chain `vaultCoreVersion`. The WASM facade fails closed on
versions it wasn't compiled with.

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L42)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L44)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L46)

Array of vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L48)

Array of universal challenger BTC public keys (x-only, 64-char hex)

##### hashlocks

```ts
hashlocks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L50)

SHA256 hash commitment(s) (64 hex chars = 32 bytes each)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L52)

CSV timelock in blocks for the HTLC refund path

##### pegInAmounts

```ts
pegInAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L54)

Amounts to peg in (satoshis), one per deposit

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L56)

TX-graph fee rate in sat/vB from contract offchain params; sizes the depositor claim value

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L58)

Minimum PegIn fee rate in sat/vB from contract offchain params; sizes the PegIn tx fee

##### numLocalChallengers

```ts
numLocalChallengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L60)

Number of local challengers (from contract params)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L62)

M in M-of-N council multisig (from contract params)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L64)

N in M-of-N council multisig (from contract params)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L66)

Bitcoin network

##### authAnchorHash?

```ts
optional authAnchorHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L74)

Optional 32-byte `SHA256(auth_anchor)` commitment (64-char hex, no
`0x` prefix). If provided, the Pre-PegIn tx will include an
`OP_RETURN <PUSH32 authAnchorHash>` output at vout =
`hashlocks.length`, binding the depositor's bearer-token
`auth_anchor` preimage to this Pre-PegIn.

***

### PrePeginPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L88)

Result of building an unfunded Pre-PegIn transaction

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:98](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L98)

Unfunded transaction hex (no inputs, HTLC outputs + optional
auth-anchor OP_RETURN + CPFP anchor).

The caller is responsible for:
- Selecting UTXOs covering totalOutputValue + network fees
- Funding the transaction (add inputs and change output)
- Calling buildPeginTxFromFundedPrePegin() with the funded tx hex

##### totalOutputValue

```ts
totalOutputValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L100)

Sum of all unfunded outputs — use this for UTXO selection

##### htlcValues

```ts
htlcValues: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L102)

HTLC output values in satoshis, one per deposit (each includes peginAmount + depositorClaimValue + minPeginFee)

##### htlcScriptPubKeys

```ts
htlcScriptPubKeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L104)

HTLC output scriptPubKeys (hex encoded), one per deposit

##### htlcAddresses

```ts
htlcAddresses: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L106)

HTLC Taproot addresses, one per deposit

##### peginAmounts

```ts
peginAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L108)

Pegin amounts in satoshis, one per deposit

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L110)

Depositor claim value computed by WASM from contract parameters

##### authAnchorVout

```ts
authAnchorVout: number | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:116](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L116)

Vout index of the auth-anchor `OP_RETURN` output if one was
included (i.e. `authAnchorHash` was provided), or `null` if not.
Always equals `htlcValues.length` when present.

***

### BuildPeginTxParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L122)

Parameters for building the PegIn transaction from a funded Pre-PegIn tx

#### Properties

##### prePeginParams

```ts
prePeginParams: PrePeginParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:124](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L124)

Same PrePeginParams used to create the Pre-PegIn transaction

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L126)

CSV timelock in blocks for the PegIn vault output

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:128](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L128)

Hex-encoded funded Pre-PegIn transaction

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L130)

Index of the HTLC output to spend

***

### PeginTxResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L136)

Result of building the PegIn transaction

#### Properties

##### txHex

```ts
txHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:138](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L138)

PegIn transaction hex (1 input spending HTLC, 1 vault output)

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L140)

PegIn transaction ID

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L142)

Vault output scriptPubKey (hex encoded)

##### vaultValue

```ts
vaultValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:144](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L144)

Vault output value in satoshis

***

### BuildPeginInputPsbtParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:26](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L26)

Parameters for building the PegIn input PSBT

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L32)

Vault core (tx-graph) version the Pre-PegIn was built with. Must match
the version passed to buildPrePeginPsbt() so the HTLC connector scripts
are derived for the same graph.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L37)

PegIn transaction hex (1 input spending Pre-PegIn HTLC output 0).
Returned by buildPeginTxFromFundedPrePegin().

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L42)

Funded Pre-PegIn transaction hex.
Used to look up the HTLC output that the PegIn input spends.

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L44)

Depositor's BTC public key (x-only, 64-char hex)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L46)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L48)

Vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L50)

Universal challenger BTC public keys (x-only, 64-char hex)

##### hashlock

```ts
hashlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L52)

SHA256 hash commitment (64 hex chars = 32 bytes)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L54)

CSV timelock in blocks for the HTLC refund path

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L56)

Bitcoin network

***

### BuildPeginInputPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L62)

Result of building the PegIn input PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L64)

PSBT hex for the depositor to sign

***

### BuildRefundPsbtParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L36)

Parameters for building a refund PSBT

#### Properties

##### prePeginParams

```ts
prePeginParams: PrePeginParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L38)

Same PrePeginParams used when the original Pre-PegIn tx was created

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L40)

Funded Pre-PegIn transaction hex (the tx whose HTLC output is being refunded)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L42)

Index of the HTLC output in the Pre-PegIn transaction

##### refundFee

```ts
refundFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L44)

Transaction fee in satoshis for the refund transaction

##### hashlock

```ts
hashlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L46)

SHA256 hash commitment for the HTLC (64 hex chars, no 0x prefix)

***

### BuildRefundPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L52)

Result of building a refund PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L54)

PSBT hex ready for depositor signing

***

### VerifyScriptPathSchnorrSignatureParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts#L89)

#### Properties

##### requestedPsbtHex

```ts
requestedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts:95](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts#L95)

Hex of the PSBT we built locally and sent to the wallet (the trusted
source of prevout scripts/values and the leaf script). NOT the
wallet-returned PSBT.

##### signatureHex

```ts
signatureHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts#L97)

The 64-byte Schnorr signature extracted from the wallet's response (128 hex chars).

##### signerXOnlyPubkeyHex

```ts
signerXOnlyPubkeyHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts#L99)

X-only public key (64 hex chars) the wallet signed the script-path leaf with.

##### inputIndex

```ts
inputIndex: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts#L101)

Index of the input the signature is for.

***

### PayoutScriptParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L32)

Parameters for creating a payout script.

These parameters define the participants in a vault and are used to generate
the taproot script that controls how funds can be spent from the vault.

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L38)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion`. Selects which graph's
payout connector the WASM derives.

##### depositor

```ts
depositor: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L46)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix).

This is the user depositing BTC into the vault. The depositor must sign
payout transactions to authorize fund distribution.

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L54)

Vault provider's BTC public key (x-only, 64-char hex without 0x prefix).

The service provider managing vault operations. Also referred to as
"claimer" in the WASM layer.

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L61)

Array of vault keeper BTC public keys (x-only, 64-char hex without 0x prefix).

Vault keepers participate in vault operations and script spending conditions.

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L68)

Array of universal challenger BTC public keys (x-only, 64-char hex without 0x prefix).

These parties can challenge the vault under certain conditions.

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L73)

CSV timelock in blocks for the PegIn output.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L81)

Bitcoin network for script generation.

Must match the network used for all other vault operations to ensure
address encoding compatibility.

***

### PayoutScriptResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L90)

Result of creating a payout script.

Contains all the taproot-related data needed for constructing and signing
payout transactions from the vault.

#### Properties

##### payoutScript

```ts
payoutScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:98](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L98)

The payout script hex used in taproot script path spending.

This is the raw script bytes that define the spending conditions,
encoded as a hexadecimal string. Used when constructing the
tapLeafScript for PSBT signing.

##### taprootScriptHash

```ts
taprootScriptHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L106)

The taproot script hash (leaf hash) for the payout script.

This is the tagged hash of the script used in taproot tree construction.
Required for computing the control block during script path spending.

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:114](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L114)

The full scriptPubKey for the vault output address.

This is the complete output script (OP_1 <32-byte-key>) that should be
used when creating the vault output in a peg-in transaction.

##### address

```ts
address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L122)

The vault Bitcoin address derived from the script.

A human-readable bech32m address (bc1p... for mainnet, tb1p... for testnet/signet)
that can be used to receive funds into the vault.

##### payoutControlBlock

```ts
payoutControlBlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L130)

Serialized control block for Taproot script path spend (hex encoded).

Computed by the Rust WASM PeginPayoutConnector. Used directly in
tapLeafScript when building payout PSBTs.

***

### WalletPubkeyValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:213](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L213)

Result of validating a wallet public key against an expected depositor public key.

#### Properties

##### walletPubkeyRaw

```ts
walletPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:215](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L215)

Wallet's raw public key (as returned by wallet, may be compressed)

##### walletPubkeyXOnly

```ts
walletPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:217](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L217)

Wallet's public key in x-only format (32 bytes, 64 hex chars)

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:219](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L219)

The validated depositor public key (x-only format)

## Type Aliases

### Network

```ts
type Network = "bitcoin" | "testnet" | "regtest" | "signet";
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts:4

Bitcoin network types supported by the vault system

***

### VaultId

```ts
type VaultId = `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/index.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/primitives/index.ts#L104)

0x-prefixed bytes32, keccak256(abi.encode(peginTxHash, depositor)).
On-chain vault identifier used by BTCVaultRegistry contract.

Type alias for documentation — not branded.
Derive with `deriveVaultId(peginTxHash, depositorAddress)`.

## Functions

### computeMinClaimValue()

```ts
function computeMinClaimValue(
   txGraphVersion, 
   numLocalChallengers, 
   numUniversalChallengers, 
   councilQuorum, 
   councilSize, 
feeRate): Promise<bigint>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts:50

Compute the minimum depositor claim value (PegIn output 1) in satoshis.

This covers the full downstream tx graph cost (Claim → Assert → Payout)
based on the protocol parameters.

#### Parameters

##### txGraphVersion

`number`

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

### computeMinPeginFee()

```ts
function computeMinPeginFee(
   txGraphVersion, 
   numVks, 
   numUcs, 
minPeginFeeRate): Promise<bigint>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts:61

Compute the minimum PegIn (activation) transaction fee in satoshis.

`minPeginFee = peginTxVsize(numVks, numUcs) × minPeginFeeRate`. Each HTLC
the depositor funds in the Pre-PegIn tx must reserve at least this fee
inside its value (`htlcValue = peginAmount + depositorClaimValue +
minPeginFee`), otherwise the VP cannot afford to broadcast the PegIn at
activation. The vsize comes from a Taproot script-path-spend weight
prediction whose witness shape depends on the VK + UC signer count.

#### Parameters

##### txGraphVersion

`number`

##### numVks

`number`

##### numUcs

`number`

##### minPeginFeeRate

`bigint`

#### Returns

`Promise`\<`bigint`\>

***

### supportedTxGraphVersions()

```ts
function supportedTxGraphVersions(): Promise<number[]>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts:72

Tx graph versions the shipped vault-wasm binary can build. Callers must
preflight the required version (fresh: active; resume: stamped) against
this list and fail closed instead of hitting per-call errors mid-flow.

Note: the facade constructors themselves fail closed on unsupported
versions, and derived objects carry the version they were built with —
value-level cross-checks live in `assertWasmPeginSizing` and the golden
byte-parity tests, not in a per-call version echo.

#### Returns

`Promise`\<`number`[]\>

***

### deriveVaultId()

```ts
function deriveVaultId(peginTxHash, depositor): Promise<string>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts:98

Derives the vault ID from a PegIn transaction hash and depositor ETH address.

Vault ID = keccak256(abi.encode(peginTxHash, depositor))
This matches the Solidity-side derivation in BTCVaultRegistry.

#### Parameters

##### peginTxHash

`string`

32-byte PegIn tx hash in display order (big-endian), hex encoded

##### depositor

`string`

20-byte Ethereum address of the depositor, hex encoded

#### Returns

`Promise`\<`string`\>

Hex-encoded vault ID (32 bytes)

***

### computeNumLocalChallengers()

```ts
function computeNumLocalChallengers(
   vaultProviderPubkey, 
   vaultKeeperPubkeys, 
   depositorPubkey): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/challengers.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/primitives/challengers.ts#L34)

Compute the number of local challengers for a vault.

Mirrors the VP's `compute_num_challengers()` logic:
local challengers = {vault_provider} ∪ {vault_keepers} − {depositor}

Keys are normalized to x-only lowercase hex before comparison, so
`0x`-prefixed, compressed, or mixed-case keys are handled correctly.

#### Parameters

##### vaultProviderPubkey

`string`

Vault provider BTC public key

##### vaultKeeperPubkeys

`string`[]

Vault keeper BTC public keys

##### depositorPubkey

`string`

Depositor (claimer) BTC public key

#### Returns

`number`

Number of local challengers

***

### assertPsbtUnsignedTxMatches()

```ts
function assertPsbtUnsignedTxMatches(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts#L73)

Compare two PSBTs and throw `PsbtSubstitutionError` unless they encode
the same unsigned transaction (version, locktime, inputs, outputs).

#### Parameters

##### params

[`AssertPsbtUnsignedTxMatchesParams`](#assertpsbtunsignedtxmatchesparams)

#### Returns

`void`

#### Throws

PsbtSubstitutionError on any mismatch in the unsigned tx

#### Throws

Error if either PSBT cannot be parsed

***

### buildChallengeAssertPsbt()

```ts
function buildChallengeAssertPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts#L58)

Build unsigned ChallengeAssert PSBT.

Each input has its own taproot script derived from its connector params; the
number of connector params must match the transaction's input count. The
depositor signs all inputs. Every prevout is derived from the authoritative
Assert transaction, never trusted from external input.

#### Parameters

##### params

[`ChallengeAssertParams`](#challengeassertparams)

ChallengeAssert parameters

#### Returns

`Promise`\<`string`\>

Unsigned PSBT hex ready for signing

#### Throws

If the number of connector params does not match the number of inputs

#### Throws

If any input does not reference assertTxHex

#### Throws

If any referenced Assert output is missing

#### Throws

If two inputs reference the same Assert output index

***

### buildDepositorPayoutPsbt()

```ts
function buildDepositorPayoutPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorPayout.ts#L68)

Build unsigned depositor Payout PSBT.

The depositor's payout transaction has 2 inputs:
- Input 0: PegIn:0 (vault UTXO) — depositor signs using PeginPayoutConnector payout script
- Input 1: Assert:0 — NOT signed by depositor

Both inputs must be present in the PSBT because Taproot SIGHASH_DEFAULT
commits to all input prevouts. Prevout script_pubkey/value are derived
from the authoritative parent transactions, not trusted from external input.

#### Parameters

##### params

[`DepositorPayoutParams`](#depositorpayoutparams)

Depositor payout parameters

#### Returns

`Promise`\<`string`\>

Unsigned PSBT hex ready for signing

#### Throws

If the payout transaction does not have exactly 2 inputs

#### Throws

If input 0 does not reference peginTxHex at output index 0

#### Throws

If input 1 does not reference assertTxHex at output index 0

***

### buildNoPayoutPsbt()

```ts
function buildNoPayoutPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts#L52)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:178](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L178)

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

If input 0 does not spend PegIn:0 (vault UTXO)

#### Throws

If input 1 does not spend Assert:0 (proof output)

#### Throws

If previous output is not found for either input

#### Throws

If sum of output values exceeds sum of input values (invalid tx)

#### Throws

If implicit fee (inputs − outputs) exceeds the configured fraction
  of total input value — see MAX\_PAYOUT\_FEE\_FRACTION\_NUMERATOR

#### Throws

If `claimerBtcPubkey` is not VP, depositor, or a registered VK

#### Throws

If payout output count, outs[0] script, outs[last] anchor value, or
  (VP-claimer) outs[1] commission cap do not match the protocol layout

#### Throws

If `commissionBps` is not a non-negative integer below 10_000

***

### extractPayoutSignature()

```ts
function extractPayoutSignature(
   signedPsbtHex, 
   depositorPubkey, 
   inputIndex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts:494](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts#L494)

Extract Schnorr signature from signed payout PSBT.

This function supports two cases:
1. Non-finalized PSBT: Extracts from tapScriptSig field
2. Finalized PSBT: Extracts from witness data

The signature is returned as a 64-byte hex string (128 hex characters).
Payout signatures must use implicit Taproot SIGHASH_DEFAULT, which is
encoded by omitting the sighash byte.

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:158](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L158)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts:255](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts#L255)

Build the PegIn transaction from a funded Pre-PegIn transaction.

The PegIn transaction spends the Pre-PegIn HTLC output at htlcVout via the
hashlock + all-party script (leaf 0).

#### Parameters

##### params

[`BuildPeginTxParams`](#buildpegintxparams)

Build parameters including Pre-PegIn params and funded tx hex

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L86)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:189](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L189)

Extract the depositor's Schnorr signature from a signed PegIn input PSBT.

Supports non-finalized PSBTs with tapScriptSig entries. Finalized PSBTs are
rejected because the witness stack does not reliably identify the depositor
signature by public key.

PegIn input signatures must use implicit Taproot SIGHASH_DEFAULT, which is
encoded by omitting the sighash byte. Signatures with an appended sighash byte
are rejected rather than stripped.

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

### finalizePeginInputPsbt()

```ts
function finalizePeginInputPsbt(signedPsbtHex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts:242](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts#L242)

Finalize a signed PegIn input PSBT and return the depositor-signed transaction hex.

The default tapscript finalizer builds the full witness stack [sig, script, controlBlock]
that vaultd requires when verifying the depositor signature on-chain.

#### Parameters

##### signedPsbtHex

`string`

Non-finalized signed PSBT hex (returned by wallet with autoFinalized: false)

#### Returns

`string`

Depositor-signed PegIn transaction hex with full taproot witness stack

***

### buildRefundPsbt()

```ts
function buildRefundPsbt(params): Promise<BuildRefundPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts#L74)

Build a PSBT for signing the refund transaction.

The refund transaction spends the Pre-PegIn HTLC output via leaf 1
(the refund script: `<timelockRefund> CSV DROP <depositorPubkey> CHECKSIG`).
The PSBT includes the tapLeafScript entry so the depositor's wallet can
sign using Taproot script-path spending.

The input's sequence is set to `timelockRefund` by the WASM, enforcing
the Bitcoin CSV timelock. The refund broadcast will be rejected by the
network if the timelock has not yet expired.

#### Parameters

##### params

[`BuildRefundPsbtParams`](#buildrefundpsbtparams)

Refund PSBT parameters

#### Returns

`Promise`\<[`BuildRefundPsbtResult`](#buildrefundpsbtresult)\>

PSBT hex for depositor signing

#### Throws

If the HTLC output at htlcVout is not found

#### Throws

If the refund transaction does not have exactly 1 input

***

### assertScriptPathSchnorrSignature()

```ts
function assertScriptPathSchnorrSignature(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts#L112)

Assert that `signatureHex` is a valid BIP-340 Schnorr signature by the
`signerXOnlyPubkeyHex` key over the Taproot script-path sighash of
`requestedPsbtHex` input `inputIndex` (SIGHASH_DEFAULT).

#### Parameters

##### params

[`VerifyScriptPathSchnorrSignatureParams`](#verifyscriptpathschnorrsignatureparams)

#### Returns

`void`

#### Throws

If the requested PSBT is malformed, lacks the prevout/leaf data needed
        to recompute the sighash, or the signature does not verify.

***

### createPayoutScript()

```ts
function createPayoutScript(params): Promise<PayoutScriptResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts#L150)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L61)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L74)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L87)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L105)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L135)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:168](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L168)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:205](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L205)

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
function validateWalletPubkey(walletPubkeyRaw, expectedDepositorPubkey): WalletPubkeyValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:237](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L237)

Validate that a wallet's public key matches the expected depositor public key.

This function:
1. Converts the wallet pubkey to x-only format
2. Validates the wallet x-only pubkey matches the expected depositor pubkey
   (case-insensitive)

#### Parameters

##### walletPubkeyRaw

`string`

Raw public key from wallet (may be compressed 66 chars or x-only 64 chars)

##### expectedDepositorPubkey

`string`

Expected depositor public key (x-only).
  Required: omitting it would degrade this check to a self-comparison.

#### Returns

[`WalletPubkeyValidationResult`](#walletpubkeyvalidationresult)

Validation result with both pubkey formats

#### Throws

If `expectedDepositorPubkey` is missing/empty

#### Throws

If wallet pubkey doesn't match expected depositor pubkey

***

### formatSatoshisToBtc()

```ts
function formatSatoshisToBtc(satoshis): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:270](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L270)

Format satoshis as a human-readable BTC string with trailing zeros removed.

#### Parameters

##### satoshis

`bigint`

#### Returns

`string`

***

### deriveTaprootAddress()

```ts
function deriveTaprootAddress(publicKeyHex, network): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:336](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L336)

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

### getSortedXOnlyPubkeys()

```ts
function getSortedXOnlyPubkeys(pubkeys): string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:361](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L361)

Strip `0x` prefixes and lex-sort an array of x-only public keys.

Used to produce the canonical (Rust-parity) keeper / challenger ordering
the protocol expects in payout and refund signing contexts.

#### Parameters

##### pubkeys

`string`[]

Array of x-only public keys (with or without `0x` prefix)

#### Returns

`string`[]

Lex-sorted array of pubkeys with `0x` prefix stripped

***

### deriveBip86ScriptPubKeyHex()

```ts
function deriveBip86ScriptPubKeyHex(xOnlyPubkeyHex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:381](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L381)

Derive the BIP-86 P2TR scriptPubKey (`0x`-prefixed hex) from an x-only
public key.

Matches Rust `Bip86KeyConnector::generate_taproot_script_pubkey`: a
keypath-only P2TR output with no script tree. Used to compute the expected
payout address for vault keeper claimers, whose payout goes to their own
BIP-86 address rather than the depositor's registered payout address.

Network-agnostic: P2TR scriptPubKey bytes are `OP_1 <32-byte tweaked-key>`
regardless of network.

#### Parameters

##### xOnlyPubkeyHex

`string`

X-only public key (64 hex chars, with or without `0x` prefix)

#### Returns

`string`

`0x`-prefixed P2TR scriptPubKey hex

#### Throws

If `xOnlyPubkeyHex` is not exactly 64 hex chars after prefix stripping

***

### deriveNativeSegwitAddress()

```ts
function deriveNativeSegwitAddress(publicKeyHex, network): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:406](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L406)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts:446](../../packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts#L446)

Validate that a BTC address was derived from the given public key.

Derives Taproot (P2TR) and Native SegWit (P2WPKH) addresses from the
public key and checks if the provided address matches any of them.

P2WPKH derivation requires the full compressed key with explicit y-parity.
When only an x-only key is supplied, the y-parity is unknown and trying
both `02|x` and `03|x` would let an opposite-parity P2WPKH address — a
script the caller does NOT control — pass validation. We fail closed for
P2WPKH in that case; P2TR (which depends only on the x-coordinate) is
still validated and remains the supported path for Taproot wallets.

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

***

### assertValidVaultCoreVersion()

```ts
function assertValidVaultCoreVersion(version, source): void;
```

Defined in: packages/babylon-ts-sdk/src/tbv/core/primitives/vaultCoreVersion.ts:29

Assert a vault core version is a well-formed on-chain value: an integer in
`[1, 65535]`. Mirrors the contract (`uint16`, setter rejects 0) and vaultd
(`SUPPORTED_CORE_VERSIONS` never contains 0). A `0` here means the vault
predates the `vaultCoreVersion` contract field or the read was mis-decoded —
fail closed rather than guess a graph version.

Whether the version is *buildable* by the bundled WASM is a separate
question — the facade fails closed on unsupported versions at construction.

#### Parameters

##### version

`number`

The value to validate.

##### source

`string`

Where the value came from, for the error message
  (e.g. `"ProtocolParams.activeVaultCoreVersion()"`).

#### Returns

`void`
