[@babylonlabs-io/ts-sdk](README.md) / deposit-terms

# deposit-terms

Protocol-level deposit terms for intent-based signing wallets (e.g. the
Ledger vault provider): the `DepositTerms` shape an approval-capable wallet
is shown before any deposit signature, the thin `buildDepositTerms`
projection, and the `supportsDepositApproval` capability probe. Device
wire-format concerns (TLV framing, SLIP-44, byte order) are provider-side.

## Classes

### DepositTermsRejectedError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts#L17)

SDK-owned typed rejection thrown when deposit terms fail pre-approval validation.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new DepositTermsRejectedError(message, reason): DepositTermsRejectedError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts#L20)

###### Parameters

###### message

`string`

###### reason

`"device-envelope"` = `"device-envelope"`

###### Returns

[`DepositTermsRejectedError`](#deposittermsrejectederror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### reason

```ts
readonly reason: "device-envelope";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts#L18)

## Interfaces

### DepositTermsVaultGroup

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:6](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L6)

#### Properties

##### htlcVout

```ts
readonly htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:8](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L8)

0-based; equals the group's position (groups are ascending by vout).

##### vaultProviderBtcPubkey

```ts
readonly vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:10](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L10)

x-only hex (64 chars), as validated on-chain upstream.

##### peginAmount

```ts
readonly peginAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L12)

sats

##### commissionFee

```ts
readonly commissionFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L23)

sats; the MAXIMUM commission the depositor accepts —
floor(peginAmount * maxAcceptableCommissionBps / 10_000), the same
ceiling the registration calldata carries. An approving wallet MUST
enforce the VP payout commission output `<= commissionFee` (e.g. the
Ledger vault app does, firmware >= c8db53e), and every commission the
contract admits stays under this ceiling (floor is monotonic in bps),
so no contract-admitted deposit can be refused at payout. The actual
stamped commission may be lower. Display the quoted value in UI, not this.

##### depositorClaimValue

```ts
readonly depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L25)

sats; the same value for every vault.

##### peginMaxFee

```ts
readonly peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L31)

sats; the cap an approving wallet enforces on the PegIn tx fee. Equals
the graph's exact (minimum) PegIn fee, which is deterministic — so the
cap is satisfied exact-by-construction.

***

### DepositTerms

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L40)

Field names follow btc-vault vocabulary (the protocol source of truth);
a device-wire encoder maps them to its intent fields (e.g. the Ledger TLV:
protocolFeeRate -> base_fee_rate, timelockPegin -> pegin_csv_timelock,
timelockAssert -> payout_timelock, peginAmount -> vault_amount).

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L52)

btc-vault tx-graph version (`vaultCoreVersion`) these terms describe —
the vault's stamped on-chain version for resumes, the chain's
`activeVaultCoreVersion` for fresh deposits. It selects the PegIn shape
an approving wallet must expect: v1 = 2 outputs, no anchor; v2 = TRUC
nVersion 3, 3 outputs with a 240-sat P2A anchor at vout 2, and an
Assert OP_RETURN marker that raises the claim value
(btc-vault `transactions/pegin.rs`, `assert_marker.rs`). A provider that
supports only one shape MUST reject the others here rather than
mis-validating the PSBTs later.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L58)

sat/vB; the tx-graph fee rate (protocolFeeRate), NOT the mempool funding
rate. Approving wallets bound each payout's fee against this rate —
pass the exact graph rate, not an inflated ceiling.

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L60)

Vault-UTXO CSV timelock (blocks).

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L65)

btc-vault `timelock_assert` (t2) — the CSV on Assert output 0. Its own
param, though production derives it and `timelockPegin` from one value.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L67)

HTLC refund CSV timelock (blocks).

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L73)

64-char hex in display order. A device-wire encoder may need the
little-endian form — some hardware byte-compares it against
PSBT_IN_PREVIOUS_TXID rather than recomputing the txid.

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L75)

sats; the funded Pre-PegIn fee (an approving wallet caps the signed fee at this).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L81)

x-only hex. Sorted ascending by the upstream on-chain validation
(validateOnChainParticipantKeys); the builder passes them through
unasserted — approving devices may reject unsorted lists at load.

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L88)

x-only hex, sorted ascending upstream independently of vaultKeeperBtcPubkeys (same
pass-through contract). Universal challengers only — the full graph
challenger set is vaultKeeperBtcPubkeys ∪ universalChallengerBtcPubkeys (vault keepers are the local
challengers).

##### vaults

```ts
vaults: readonly DepositTermsVaultGroup[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L90)

Per-vault groups, ordered by ascending htlcVout.

***

### DepositTermsApprover

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L107)

Implemented only by depositor-approval wallets (e.g. a Ledger vault
provider). Provider obligations:

- Envelope: validate terms against the device's envelope BEFORE the
  ceremony, rejecting with the shape `{ name: "DepositTermsRejectedError",
  reason: "device-envelope", message }` (matched structurally, not by class).
- Idempotence: a byte-equal re-approval MUST be a no-op while the
  device-side approval is live; anything that invalidates it (a later
  `deriveContextHash`, a signing failure) MUST clear the memo.

Seam invariant: any derive invalidates a prior approval, so the SDK
re-approves after every derive and before the next terms-bound signature.

#### Methods

##### approveDepositTerms()

```ts
approveDepositTerms(terms): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L108)

###### Parameters

###### terms

[`DepositTerms`](#depositterms)

###### Returns

`Promise`\<`void`\>

***

### BuildDepositTermsInputs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L134)

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L136)

btc-vault tx-graph version the graph is built under.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:137](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L137)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:138](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L138)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L140)

btc-vault `timelock_assert` (t2) — its own param; NOT derived from timelockPegin here.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:141](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L141)

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L142)

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L143)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:144](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L144)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:145](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L145)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:146](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L146)

##### maxAcceptableCommissionBps

```ts
maxAcceptableCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:148](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L148)

Ceiling bps, not the quote — see [DepositTermsVaultGroup.commissionFee](#commissionfee).

##### peginAmounts

```ts
peginAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L149)

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L150)

##### peginMaxFee

```ts
peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L151)

## Type Aliases

### DepositTermsRejectionReason

```ts
type DepositTermsRejectionReason = "device-envelope";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts#L14)

Why the terms were rejected before approval.

## Functions

### buildDepositTerms()

```ts
function buildDepositTerms(inputs): DepositTerms;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/buildDepositTerms.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/buildDepositTerms.ts#L19)

Project already-validated pegin inputs into protocol-level deposit terms.
Not a second validator: keys arrive canonical and sorted from on-chain
validation, and non-negative sizing is already asserted by WASM output checks.

#### Parameters

##### inputs

[`BuildDepositTermsInputs`](#builddeposittermsinputs)

#### Returns

[`DepositTerms`](#depositterms)

***

### supportsDepositApproval()

```ts
function supportsDepositApproval(wallet): wallet is BitcoinWallet & DepositTermsApprover;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L112)

True when the wallet implements [DepositTermsApprover.approveDepositTerms](#approvedepositterms).

#### Parameters

##### wallet

[`BitcoinWallet`](managers.md#bitcoinwallet)

#### Returns

`wallet is BitcoinWallet & DepositTermsApprover`

***

### forwardDepositApproval()

```ts
function forwardDepositApproval(wallet): Partial<DepositTermsApprover>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L126)

Spreadable forward of `approveDepositTerms` for wallet-wrapper objects.
Object spread drops prototype methods, so every `{...wallet}` wrapper site
must re-attach the capability explicitly: `...forwardDepositApproval(wallet)`.

#### Parameters

##### wallet

[`BitcoinWallet`](managers.md#bitcoinwallet)

#### Returns

`Partial`\<[`DepositTermsApprover`](#deposittermsapprover)\>

***

### isDepositTermsRejectedError()

```ts
function isDepositTermsRejectedError(err): err is DepositTermsRejectedError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts#L35)

Guard for app-side error mapping. Matches `instanceof` OR the documented
`name` — providers and foreign realms throw structurally-conforming plain
errors that `instanceof` cannot see.

#### Parameters

##### err

`unknown`

#### Returns

`err is DepositTermsRejectedError`

## Variables

### DEPOSIT\_TERMS\_REJECTED\_ERROR\_NAME

```ts
const DEPOSIT_TERMS_REJECTED_ERROR_NAME: "DepositTermsRejectedError" = "DepositTermsRejectedError";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts:11](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts#L11)

The `name` value providers must set on envelope rejections (the wire contract).
