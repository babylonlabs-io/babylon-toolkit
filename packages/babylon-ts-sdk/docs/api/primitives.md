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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts)

Thrown when a wallet-returned PSBT encodes a different unsigned
transaction than the one the caller asked the wallet to sign.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new PsbtSubstitutionError(detail): PsbtSubstitutionError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts)

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

### PeginP2aAnchorInfo

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

A graph version's PegIn P2A (pay-to-anchor) output description, copied out
of the WASM object into plain JS. v2/v3: 240 sats at vout 2, script
`51024e73`. Versions without an anchor (v1) yield `null` from
`peginP2aAnchorOutput`, never a zero-valued record.

#### Properties

##### value

```ts
value: bigint;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Anchor output value in satoshis (240 for v2/v3)

##### vout

```ts
vout: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Anchor output index in the PegIn transaction (2 for v2/v3)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Anchor scriptPubKey hex (`51024e73` for v2/v3)

***

### PayoutConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Parameters for creating a payout connector

#### Properties

##### txGraphVersion

```ts
txGraphVersion: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Tx graph (vault-core) version selecting the builder inside the vault-wasm
facade. Fresh deposits use the contract's `activeVaultCoreVersion()`;
resumed vaults use their stamped `vaultCoreVersion`. The facade fails
closed on versions the shipped binary does not support.

##### depositor

```ts
depositor: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

X-only public key of the depositor (hex encoded)

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

X-only public key of the vault provider (hex encoded)

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Array of x-only public keys of vault keepers (hex encoded)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Array of x-only public keys of universal challengers (hex encoded)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

CSV timelock in blocks for the PegIn output

***

### AssertPayoutNoPayoutConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Parameters for creating an Assert Payout/NoPayout connector.
This connector generates scripts for the depositor's own graph (depositor-as-claimer).

#### Properties

##### txGraphVersion

```ts
txGraphVersion: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Tx graph (vault-core) version selecting the builder inside the vault-wasm
facade. Fresh deposits use the contract's `activeVaultCoreVersion()`;
resumed vaults use their stamped `vaultCoreVersion`. The facade fails
closed on versions the shipped binary does not support.

##### claimer

```ts
claimer: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

X-only public key of the claimer (depositor acting as claimer, hex encoded)

##### localChallengers

```ts
localChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Array of x-only public keys of local challengers (hex encoded)

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Array of x-only public keys of universal challengers (hex encoded)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

CSV timelock in blocks for the Assert output

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Array of x-only public keys of security council members (hex encoded)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Council quorum (M-of-N multisig threshold)

***

### ChallengeAssertConnectorParams

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Parameters for creating a ChallengeAssert connector.
This connector generates scripts for the ChallengeAssert transaction.

#### Properties

##### txGraphVersion

```ts
txGraphVersion: number;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Tx graph (vault-core) version selecting the builder inside the vault-wasm
facade. Fresh deposits use the contract's `activeVaultCoreVersion()`;
resumed vaults use their stamped `vaultCoreVersion`. The facade fails
closed on versions the shipped binary does not support.

##### claimer

```ts
claimer: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

X-only public key of the claimer (depositor acting as claimer, hex encoded)

##### challenger

```ts
challenger: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

X-only public key of the challenger (hex encoded)

##### claimerWotsKeysJson

```ts
claimerWotsKeysJson: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

JSON string of WOTS public keys (blocks 0-1) from VP

##### gcWotsKeysJson

```ts
gcWotsKeysJson: string;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

JSON string of GC WOTS public keys (array of arrays) from VP

***

### AssertPsbtUnsignedTxMatchesParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts)

#### Properties

##### requestedPsbtHex

```ts
requestedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts)

PSBT we built locally and asked the wallet to sign.

##### returnedPsbtHex

```ts
returnedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts)

PSBT the wallet returned after signing.

***

### ChallengeAssertParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts)

Parameters for building a ChallengeAssert PSBT

#### Properties

##### challengeAssertTxHex

```ts
challengeAssertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts)

ChallengeAssert transaction hex (unsigned)

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts)

Authoritative Assert transaction hex — every input must spend an Assert output

##### connectorParamsPerInput

```ts
connectorParamsPerInput: ChallengeAssertConnectorParams[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts)

Per-input connector params (one per input/segment, determines the taproot script)

***

### DepositorClaimDescriptor

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

The single-leaf taptree's spend material for one depositor key.

#### Properties

##### scriptPubKey

```ts
scriptPubKey: Buffer;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

P2TR scriptPubKey the PegIn pays at [PEGIN\_DEPOSITOR\_CLAIM\_VOUT](#pegin_depositor_claim_vout).

##### leafScript

```ts
leafScript: Buffer;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

The one tapleaf: `<depositor> OP_CHECKSIG`, 34 bytes.

##### controlBlock

```ts
controlBlock: Buffer;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

Control block for that leaf: `[leafVersion | outputKeyParity] || NUMS`,
33 bytes. The tree has a single leaf at depth 0, so it carries no sibling
hashes.

##### internalKey

```ts
internalKey: Buffer;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

The NUMS internal key the taptree commits to — the PSBT's `tapInternalKey`.
Carried here so an input's internal key and control block provably come
from the same derivation.

***

### NoPayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts)

Parameters for building a NoPayout PSBT

#### Properties

##### noPayoutTxHex

```ts
noPayoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts)

NoPayout transaction hex (unsigned) from VP

##### challengerPubkey

```ts
challengerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts)

Challenger's x-only public key (hex encoded)

##### prevouts

```ts
prevouts: object[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts)

Parameters for the Assert Payout/NoPayout connector

***

### PayoutParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Parameters for building an unsigned Payout PSBT

Payout is used in the challenge path after Assert, when the claimer proves validity.
Input 1 references the Assert transaction.

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion`. Selects which graph's
payout connector scripts are derived.

##### payoutTxHex

```ts
payoutTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Payout transaction hex (unsigned)
This is the transaction that needs to be signed by the depositor

##### assertTxHex

```ts
assertTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Assert transaction hex
Payout input 1 references Assert output 0

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Peg-in transaction hex
This transaction created the vault output that we're spending

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Universal challenger BTC public keys (x-only, 64-char hex)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

CSV timelock in blocks for the PegIn output (btc-vault `timelock_pegin`);
payout input 0's sequence.

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

CSV timelock in blocks on the Assert:0 payout leaf (btc-vault
`timelock_assert`); payout input 1's sequence.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Bitcoin network

##### claimerBtcPubkey

```ts
claimerBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Claimer's x-only BTC public key (64-char hex, no prefix). Drives role
inference (VP / depositor-as-claimer / VK-claimer) inside `buildPayoutPsbt`.

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

On-chain registered depositor payout scriptPubKey (hex, 0x optional).
Expected outs[0].script for VP- and depositor-claimer roles; unused for
VK-claimer (its outs[0].script is derived from `claimerBtcPubkey`).

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

VP commission in basis points (`BTCVaultRegistry.vaultProviderCommissionBps`).
Caps the VP-claimer outs[1].value. The protocol minimum is enforced
upstream; here only `0 <= bps < 10_000` is checked, for safe cap math.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Tx-graph fee rate (sat/vB) the graph was built with — the version-locked
`offchainParams.feeRate` at the vault's stamped `offchainParamsVersion`,
NOT a live read. Anchors both ends of the fee band.

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Security council member x-only public keys (hex) from the locked offchain
params version — `getOffchainParamsByVersion(...).securityCouncilKeys`.
The council occupies the last leaf of the Assert:0 taptree
(btc-vault `crates/vault/src/connectors/assert_payout_nopayout_council.rs`),
so the keys are needed to rebuild input 1's payout leaf, and the count
feeds the fee-band domain.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

M-of-N council quorum from the locked offchain params version —
`getOffchainParamsByVersion(...).councilQuorum`. Shapes the council leaf's
multisig script, and with it the Assert:0 taptree root.

##### vkClaimerPayoutScriptPubKeys

```ts
vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

RFC-006. Expected `outs[0].script` per vault-keeper claimer, keyed by
lowercased x-only **operation** pubkey (no `0x`), resolved from
`ApplicationRegistry.getPayoutScriptAtEpoch` at the vault's frozen
`appKeeperKeyEpoch`.

Every VK claimer must be present: a claimer missing from the map is an
error rather than a cue to derive BIP-86, because a gap means resolution
was incomplete and we do not know what that keeper registered.

Each entry accepts either that registered script or the BIP-86 default of
the same bonded key, so graphs built before btc-vault#2440 remain signable
— see acceptedPayoutScriptHexes for why that is required and when
it can be dropped.

##### vpCommissionScriptPubKey

```ts
vpCommissionScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

RFC-006. Expected `outs[1].script` for the VP-claimer commission output,
from `BTCVaultRegistry.getPayoutScriptAtEpoch` at the vault's frozen
`vpKeyEpoch`. The BIP-86 default of the bonded VP key is accepted alongside
it — see acceptedPayoutScriptHexes.

***

### PayoutPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Result of building an unsigned payout PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Unsigned PSBT hex ready for signing

***

### PrePeginParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Parameters for building an unfunded Pre-PegIn PSBT

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Vault core (tx-graph) version to build. Fresh deposits use the contract's
`ProtocolParams.activeVaultCoreVersion()`; resumed vaults use their
stamped on-chain `vaultCoreVersion`. The WASM facade fails closed on
versions it wasn't compiled with.

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Array of vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Array of universal challenger BTC public keys (x-only, 64-char hex)

##### hashlocks

```ts
hashlocks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

SHA256 hash commitment(s) (64 hex chars = 32 bytes each)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

CSV timelock in blocks for the HTLC refund path

##### pegInAmounts

```ts
pegInAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Amounts to peg in (satoshis), one per deposit

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

TX-graph fee rate in sat/vB from contract offchain params; sizes the depositor claim value

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Minimum PegIn fee rate in sat/vB from contract offchain params; sizes the PegIn tx fee

##### numLocalChallengers

```ts
numLocalChallengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Number of local challengers (from contract params)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

M in M-of-N council multisig (from contract params)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

N in M-of-N council multisig (from contract params)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Bitcoin network

##### authAnchorHash?

```ts
optional authAnchorHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Optional 32-byte `SHA256(auth_anchor)` commitment (64-char hex, no
`0x` prefix). If provided, the Pre-PegIn tx will include an
`OP_RETURN <PUSH32 authAnchorHash>` output at vout =
`hashlocks.length`, binding the depositor's bearer-token
`auth_anchor` preimage to this Pre-PegIn.

***

### PrePeginPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Result of building an unfunded Pre-PegIn transaction

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Sum of all unfunded outputs — use this for UTXO selection

##### htlcValues

```ts
htlcValues: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

HTLC output values in satoshis, one per deposit. Each includes
peginAmount + depositorClaimValue + p2aAnchorValue + minPeginFee (the
anchor term is 0 for graph versions without a P2A anchor, 240 for v2/v3).

##### htlcScriptPubKeys

```ts
htlcScriptPubKeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

HTLC output scriptPubKeys (hex encoded), one per deposit

##### htlcAddresses

```ts
htlcAddresses: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

HTLC Taproot addresses, one per deposit

##### peginAmounts

```ts
peginAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Pegin amounts in satoshis, one per deposit

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Depositor claim value computed by WASM from contract parameters

##### authAnchorVout

```ts
authAnchorVout: number | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Vout index of the auth-anchor `OP_RETURN` output if one was
included (i.e. `authAnchorHash` was provided), or `null` if not.
Always equals `htlcValues.length` when present.

##### minPeginFee

```ts
minPeginFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Minimum PegIn fee (sats), independently computed and asserted against
`htlcValues`' implied reserve by assertWasmPeginSizing. Reuse
this instead of recomputing — it is already the cross-checked value.

***

### BuildPeginTxParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Parameters for building the PegIn transaction from a funded Pre-PegIn tx

#### Properties

##### prePeginParams

```ts
prePeginParams: PrePeginParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Same PrePeginParams used to create the Pre-PegIn transaction

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

CSV timelock in blocks for the PegIn vault output

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Hex-encoded funded Pre-PegIn transaction

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Index of the HTLC output to spend

***

### PeginTxResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Result of building the PegIn transaction

#### Properties

##### txHex

```ts
txHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

PegIn transaction hex. 1 input spending the HTLC; outputs are
version-shaped: v1 = vault + depositor claim, v2/v3 = vault + depositor
claim + P2A anchor at vout 2 (nVersion 3 / TRUC).

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

PegIn transaction ID

##### vaultScriptPubKey

```ts
vaultScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Vault output scriptPubKey (hex encoded)

##### vaultValue

```ts
vaultValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

Vault output value in satoshis

***

### BuildPeginInputPsbtParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Parameters for building the PegIn input PSBT

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Vault core (tx-graph) version the Pre-PegIn was built with. Must match
the version passed to buildPrePeginPsbt() so the HTLC connector scripts
are derived for the same graph.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

PegIn transaction hex (1 input spending Pre-PegIn HTLC output 0).
Returned by buildPeginTxFromFundedPrePegin().

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Funded Pre-PegIn transaction hex.
Used to look up the HTLC output that the PegIn input spends.

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Depositor's BTC public key (x-only, 64-char hex)

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Vault provider's BTC public key (x-only, 64-char hex)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Vault keeper BTC public keys (x-only, 64-char hex)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Universal challenger BTC public keys (x-only, 64-char hex)

##### hashlock

```ts
hashlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

SHA256 hash commitment (64 hex chars = 32 bytes)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

CSV timelock in blocks for the HTLC refund path

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Bitcoin network

***

### BuildPeginInputPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

Result of building the PegIn input PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

PSBT hex for the depositor to sign

***

### ReclaimReserve

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

One depositor-claim reserve to sweep, with the material to bind it.

#### Properties

##### depositorSignedPeginTxHex

```ts
depositorSignedPeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

The contract's own copy of the depositor-signed PegIn transaction
(`VaultProtocolInfo.depositorSignedPeginTx`). Authoritative: its SegWit
txid equals the broadcast PegIn's, and its `outs[1]` carries the reserve's
script and value at no extra RPC cost.

##### observed

```ts
observed: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Independent chain observation of `peginTxid:1` (esplora UTXO lookup).

###### scriptPubKey

```ts
scriptPubKey: string;
```

scriptPubKey hex, with or without `0x` prefix.

###### value

```ts
value: bigint;
```

Output value in satoshis.

##### expectedValue

```ts
expectedValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

The reserve value recomputed from this vault's protocol parameters via
`computeMinClaimValue`. Bound so a doctored PegIn that agrees with itself
and with a compromised indexer still fails.

***

### BuildReclaimPsbtParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

#### Properties

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

The **connected wallet's live** x-only pubkey, 64-char hex. Never the
indexer's `depositorBtcPubkey`: re-deriving from the live key is what
proves the wallet about to sign is the wallet that can spend, and rejects
the wrong-wallet case with an error instead of an unspendable broadcast.

##### inputs

```ts
inputs: ReclaimReserve[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Reserves to sweep. An array so batching several vaults into one
transaction is a later change rather than a rewrite; today the app passes
exactly one.

##### feeSats

```ts
feeSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Absolute fee in satoshis. The caller sizes it; see `reclaimVsize`.

***

### BuildReclaimPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

PSBT hex ready for depositor signing.

##### outputValue

```ts
outputValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Value of the single output — what the depositor actually receives.

##### totalInputValue

```ts
totalInputValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Sum of the swept reserves, before fee.

***

### BuildRefundPsbtParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

Parameters for building a refund PSBT

#### Properties

##### prePeginParams

```ts
prePeginParams: PrePeginParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

Same PrePeginParams used when the original Pre-PegIn tx was created

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

Funded Pre-PegIn transaction hex (the tx whose HTLC output is being refunded)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

Index of the HTLC output in the Pre-PegIn transaction

##### refundFee

```ts
refundFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

Transaction fee in satoshis for the refund transaction

##### hashlock

```ts
hashlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

SHA256 hash commitment for the HTLC (64 hex chars, no 0x prefix)

***

### BuildRefundPsbtResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

Result of building a refund PSBT

#### Properties

##### psbtHex

```ts
psbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

PSBT hex ready for depositor signing

***

### AssertKeyPathSchnorrSignatureParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

#### Properties

##### requestedPsbtHex

```ts
requestedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

Hex of the PSBT we built and sent (trusted prevout scripts/values). NOT the wallet's.

##### signatureHex

```ts
signatureHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

64- or 65-byte signature, hex.

##### inputIndex

```ts
inputIndex: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

Index of the input the signature is for.

***

### AssertReturnedKeyPathSignaturesParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

#### Properties

##### requestedPsbtHex

```ts
requestedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

PSBT we built locally and asked the wallet to sign.

##### returnedPsbtHex

```ts
returnedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

PSBT the wallet returned after signing.

***

### VerifyScriptPathSchnorrSignatureParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts)

#### Properties

##### requestedPsbtHex

```ts
requestedPsbtHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts)

Hex of the PSBT we built locally and sent to the wallet (the trusted
source of prevout scripts/values and the leaf script). NOT the
wallet-returned PSBT.

##### signatureHex

```ts
signatureHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts)

The 64-byte Schnorr signature extracted from the wallet's response (128 hex chars).

##### signerXOnlyPubkeyHex

```ts
signerXOnlyPubkeyHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts)

X-only public key (64 hex chars) the wallet signed the script-path leaf with.

##### inputIndex

```ts
inputIndex: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts)

Index of the input the signature is for.

***

### PayoutScriptParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Parameters for creating a payout script.

These parameters define the participants in a vault and are used to generate
the taproot script that controls how funds can be spent from the vault.

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion`. Selects which graph's
payout connector the WASM derives.

##### depositor

```ts
depositor: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Depositor's BTC public key (x-only, 64-char hex without 0x prefix).

This is the user depositing BTC into the vault. The depositor must sign
payout transactions to authorize fund distribution.

##### vaultProvider

```ts
vaultProvider: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Vault provider's BTC public key (x-only, 64-char hex without 0x prefix).

The service provider managing vault operations. Also referred to as
"claimer" in the WASM layer.

##### vaultKeepers

```ts
vaultKeepers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Array of vault keeper BTC public keys (x-only, 64-char hex without 0x prefix).

Vault keepers participate in vault operations and script spending conditions.

##### universalChallengers

```ts
universalChallengers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Array of universal challenger BTC public keys (x-only, 64-char hex without 0x prefix).

These parties can challenge the vault under certain conditions.

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

CSV timelock in blocks for the PegIn output.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Bitcoin network for script generation.

Must match the network used for all other vault operations to ensure
address encoding compatibility.

***

### PayoutScriptResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Result of creating a payout script.

Contains all the taproot-related data needed for constructing and signing
payout transactions from the vault.

#### Properties

##### payoutScript

```ts
payoutScript: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

The payout script hex used in taproot script path spending.

This is the raw script bytes that define the spending conditions,
encoded as a hexadecimal string. Used when constructing the
tapLeafScript for PSBT signing.

##### taprootScriptHash

```ts
taprootScriptHash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

The taproot script hash (leaf hash) for the payout script.

This is the tagged hash of the script used in taproot tree construction.
Required for computing the control block during script path spending.

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

The full scriptPubKey for the vault output address.

This is the complete output script (OP_1 <32-byte-key>) that should be
used when creating the vault output in a peg-in transaction.

##### address

```ts
address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

The vault Bitcoin address derived from the script.

A human-readable bech32m address (bc1p... for mainnet, tb1p... for testnet/signet)
that can be used to receive funds into the vault.

##### payoutControlBlock

```ts
payoutControlBlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

Serialized control block for Taproot script path spend (hex encoded).

Computed by the Rust WASM PeginPayoutConnector. Used directly in
tapLeafScript when building payout PSBTs.

***

### WalletPubkeyValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

Result of validating a wallet public key against an expected depositor public key.

#### Properties

##### walletPubkeyRaw

```ts
walletPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

Wallet's raw public key (as returned by wallet, may be compressed)

##### walletPubkeyXOnly

```ts
walletPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

Wallet's public key in x-only format (32 bytes, 64 hex chars)

##### depositorPubkey

```ts
depositorPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

The validated depositor public key (x-only format)

## Type Aliases

### Network

```ts
type Network = "bitcoin" | "testnet" | "regtest" | "signet";
```

Defined in: packages/babylon-tbv-rust-wasm/dist/types.d.ts

Bitcoin network types supported by the vault system

***

### VaultId

```ts
type VaultId = `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/index.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/index.ts)

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

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts

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

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts

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

### peginP2aAnchorOutput()

```ts
function peginP2aAnchorOutput(txGraphVersion): Promise<PeginP2aAnchorInfo | null>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts

The PegIn transaction's P2A (pay-to-anchor) output for a graph version, or
`null` when that version's PegIn carries no anchor (v1). The facade returns
one record per version — never a zero-valued placeholder — so an absent
anchor can't be mistaken for a real output. For v2/v3: 240 sats at vout 2,
script `51024e73`.

#### Parameters

##### txGraphVersion

`number`

#### Returns

`Promise`\<[`PeginP2aAnchorInfo`](#peginp2aanchorinfo) \| `null`\>

***

### validatePeginP2aAnchor()

```ts
function validatePeginP2aAnchor(txGraphVersion, txHex): Promise<void>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts

Validate a PegIn transaction's P2A anchor against a graph version's rules:
v2 requires the exact anchor (240 sats, vout 2, P2A script) and v1 requires
that NO output carries the P2A script. Throws on any mismatch — a v2 PegIn
checked as v1 fails closed, and vice versa.

#### Parameters

##### txGraphVersion

`number`

##### txHex

`string`

#### Returns

`Promise`\<`void`\>

***

### supportedTxGraphVersions()

```ts
function supportedTxGraphVersions(): Promise<number[]>;
```

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts

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

Defined in: packages/babylon-tbv-rust-wasm/dist/index.d.ts

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/challengers.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/challengers.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/challengeAssert.ts)

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

### deriveDepositorClaimDescriptor()

```ts
function deriveDepositorClaimDescriptor(depositorPubkey): DepositorClaimDescriptor;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

Derive the depositor-claim output's spend material in JS, independently of
WASM — the Rust `SingleKeyConnector` has no WASM wrapper, so this is the
only derivation available on the JS side.

Takes no graph version: the connector is identical across v1/v2/v3. A future
`VAULT_WASM_COMMIT` bump that changed it would break `assertPeginTxShape` at
peg-in build time, which is where that regression should surface.

#### Parameters

##### depositorPubkey

`string`

x-only depositor pubkey, 64-char hex (no 0x prefix)

#### Returns

[`DepositorClaimDescriptor`](#depositorclaimdescriptor)

#### Throws

If bitcoinjs cannot derive the P2TR output or its control block

***

### deriveDepositorClaimScriptPubKey()

```ts
function deriveDepositorClaimScriptPubKey(depositorPubkey): Buffer;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

The depositor-claim output's scriptPubKey alone — the peg-in validation path,
which has no need of the spend material.

#### Parameters

##### depositorPubkey

`string`

#### Returns

`Buffer`

***

### buildNoPayoutPsbt()

```ts
function buildNoPayoutPsbt(params): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/noPayout.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

Build unsigned Payout PSBT for depositor to sign.

Payout is used in the **challenge path** when the claimer proves validity:
1. Vault provider submits Claim transaction
2. Challenge is raised during challenge period
3. Claimer submits Assert transaction to prove validity
4. Payout can be executed (references Assert tx)

Payout transactions have the following structure:
- Input 0: from PeginTx output0 (signed by depositor)
- Input 1: from Assert output0 (NOT signed by depositor)

Both inputs carry their taproot script-path leaf. Input 1's is not signed
here — it is what a hardware signer reads to display the payout terms.

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

If the implicit fee (inputs − outputs) is outside the fee band —
  below the floor or above the fee-band ceiling (see
  assertPayoutFeeInBand)

#### Throws

If `protocolFeeRate`, a participant count, or the council size is
  outside the accepted input domain (see assertPayoutFeeBandDomain)

#### Throws

If a non-anchor scriptPubKey length is outside `[1,
  {@link MAX_PAYOUT_SCRIPT_LEN}]`

#### Throws

If `claimerBtcPubkey` is not VP, depositor, or a registered VK

#### Throws

If payout output count, outs[0] script, outs[last] anchor value, or
  (VP-claimer) outs[1] commission cap do not match the protocol layout

#### Throws

If `commissionBps` is not a non-negative integer below 10_000

#### Throws

If the locally rebuilt Assert:0 payout leaf does not bind to the
  Assert output input 1 spends

***

### extractPayoutSignature()

```ts
function extractPayoutSignature(
   signedPsbtHex, 
   depositorPubkey, 
   inputIndex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/pegin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts)

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

### reclaimVsize()

```ts
function reclaimVsize(numInputs): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Virtual size of an N-in/1-out reclaim transaction.

`REFUND_VSIZE = 160` does not generalise to N inputs, and
`computePeginBaseFeeSats` is wrong for this shape entirely — its
`P2TR_INPUT_SIZE = 58` is a *key-path* input and under-fees a script-path
spend by roughly a quarter.

N=1 → 129 vB; each additional input adds 75 vB.

#### Parameters

##### numInputs

`number`

#### Returns

`number`

***

### estimateReclaimFeeSats()

```ts
function estimateReclaimFeeSats(feeRateSatsVb, numInputs): bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Absolute fee in satoshis for an N-in/1-out reclaim at a given rate.

#### Parameters

##### feeRateSatsVb

`number`

##### numInputs

`number`

#### Returns

`bigint`

***

### buildReclaimPsbt()

```ts
function buildReclaimPsbt(params): BuildReclaimPsbtResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/reclaim.ts)

Build the N-in/1-out reclaim PSBT.

Every input is bound three ways before it reaches the PSBT: the contract's
PegIn bytes, the chain observation, and a JS re-derivation from the live
wallet key must agree on both script and value. Any disagreement throws.

#### Parameters

##### params

[`BuildReclaimPsbtParams`](#buildreclaimpsbtparams)

#### Returns

[`BuildReclaimPsbtResult`](#buildreclaimpsbtresult)

#### Throws

If `inputs` is empty, the fee is non-positive, any input fails its
  script or value bind, or the resulting output would be at or below dust.

***

### buildRefundPsbt()

```ts
function buildRefundPsbt(params): Promise<BuildRefundPsbtResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/refund.ts)

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

### assertKeyPathSchnorrSignature()

```ts
function assertKeyPathSchnorrSignature(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

Assert that `signatureHex` is a valid BIP-340 Schnorr signature over the
Taproot key-path sighash of `requestedPsbtHex` input `inputIndex`, under the
tweaked output key taken from that input's prevout scriptPubKey.

#### Parameters

##### params

[`AssertKeyPathSchnorrSignatureParams`](#assertkeypathschnorrsignatureparams)

#### Returns

`void`

#### Throws

If the input is not a key-path P2TR spend, the requested PSBT lacks
        the prevout data needed to recompute the sighash, or the signature
        does not verify.

***

### assertReturnedKeyPathSignatures()

```ts
function assertReturnedKeyPathSignatures(params): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts)

Verify every key-path-eligible and P2WPKH input of the REQUESTED PSBT
against what the wallet RETURNED. Key-path: `tapKeySig`, or the single
finalized witness item for wallets that auto-finalize — and when both are
present they must be the same bytes. P2WPKH: `partialSig`, or the finalized
2-item witness, verified as ECDSA over the BIP-143 sighash
(assertReturnedP2wpkhSignature); a failure throws but the input is
NOT counted. Any other input type (script-path, P2WSH, ...) throws — no
verifier here covers it, so it cannot be treated as verified.

#### Parameters

##### params

[`AssertReturnedKeyPathSignaturesParams`](#assertreturnedkeypathsignaturesparams)

#### Returns

`number`

How many inputs were verified KEY-PATH. A caller that knows every
         input is taproot key-path (e.g. an approval wallet) must assert
         this equals its input count — P2WPKH inputs never count toward it,
         so that gate stays exact.

#### Throws

If the input counts differ, an input is neither key-path P2TR nor
        P2WPKH, an eligible input carries no signature, a finalized witness
        disagrees with its `tapKeySig`/`partialSig`, or any signature does
        not verify.

***

### assertScriptPathSchnorrSignature()

```ts
function assertScriptPathSchnorrSignature(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyScriptPathSchnorrSignature.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/scripts/payout.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

### canonicalizeBtcPubkey()

```ts
function canonicalizeBtcPubkey(publicKeyHex): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

Normalize a public key to the one form two keys can be compared in:
lowercase x-only hex, no `0x`.

`processPublicKeyToXOnly` returns already-x-only input untouched, so it
preserves case on that path — comparing its output directly is a latent
false mismatch for any source that serves uppercase hex. Every comparison
site therefore has to pair it with `.toLowerCase()`, and that pairing is
what this function exists to stop people re-deriving by hand.

#### Parameters

##### publicKeyHex

`string`

x-only, compressed, or uncompressed key, `0x` optional

#### Returns

`string`

#### Throws

If the key is not valid hex or has an unexpected length

***

### isValidHex()

```ts
function isValidHex(hex): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/utils/bitcoin.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/vaultCoreVersion.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/vaultCoreVersion.ts)

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

## Variables

### PEGIN\_DEPOSITOR\_CLAIM\_VOUT

```ts
const PEGIN_DEPOSITOR_CLAIM_VOUT: 1 = 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/depositorClaim.ts)

Vout of the depositor-claim output in every PegIn version (btc-vault: vault
at 0, depositor claim at 1, optional P2A anchor appended after).

Version-invariant: the graph version dispatches only the trailing P2A anchor
(absent in v1, 240 sats at vout 2 in v2/v3). Nothing touches vout 1.
