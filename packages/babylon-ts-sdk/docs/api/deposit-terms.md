[@babylonlabs-io/ts-sdk](README.md) / deposit-terms

# deposit-terms

Protocol-level deposit terms for intent-based signing wallets (e.g. the
Ledger vault provider): the `DepositTerms` shape an approval-capable wallet
is shown before any deposit signature, the thin `buildDepositTerms`
projection, and the `supportsDepositApproval` capability probe. Device
wire-format concerns (TLV framing, SLIP-44, byte order) are provider-side.

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

##### vaultProviderPk

```ts
readonly vaultProviderPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:10](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L10)

x-only hex (64 chars), as validated on-chain upstream.

##### vaultAmount

```ts
readonly vaultAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L12)

sats

##### commissionFee

```ts
readonly commissionFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L14)

sats; floor(vaultAmount * commissionBps / 10_000).

##### depositorClaimValue

```ts
readonly depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L16)

sats; the same value for every vault.

##### peginMaxFee

```ts
readonly peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L18)

sats; the minimum PegIn fee for this graph version.

***

### DepositTerms

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L21)

#### Properties

##### baseFeeRate

```ts
baseFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L28)

sat/vB; the tx-graph fee rate (protocolFeeRate), NOT the mempool funding
rate. An approving wallet bounds each payout's fee at baseFeeRate x a
conservative vsize estimate (v22 §4.9.7.1) — pass the exact graph rate,
not an inflated ceiling.

##### peginCsvTimelock

```ts
peginCsvTimelock: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L30)

Vault-UTXO CSV timelock (blocks).

##### payoutTimelock

```ts
payoutTimelock: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L35)

Payout timelock on the Assert transaction's output 0; comes from the same
protocol param (timelockAssert) as peginCsvTimelock.

##### htlcRefundTimelock

```ts
htlcRefundTimelock: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L37)

HTLC refund CSV timelock (blocks).

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L42)

64-char hex in display order. A device-wire encoder must byte-reverse it to
the little-endian form the device recomputes and compares against.

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L44)

sats; the funded Pre-PegIn fee (an approving wallet caps the signed fee at this).

##### keeperPks

```ts
keeperPks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L50)

x-only hex. Sorted ascending by the upstream on-chain validation
(validateOnChainParticipantKeys); the builder passes them through
unasserted — the device rejects unsorted lists at intent load.

##### challengerPks

```ts
challengerPks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L57)

x-only hex, sorted ascending upstream independently of keeperPks (same
pass-through contract). Universal challengers only — the full graph
challenger set is keeperPks ∪ challengerPks (vault keepers are the local
challengers).

##### vaults

```ts
vaults: readonly DepositTermsVaultGroup[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L59)

Per-vault groups, ordered by ascending htlcVout.

***

### DepositTermsApprover

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L73)

Implemented only by depositor-approval wallets (e.g. a Ledger vault provider).
Either a class field or a prototype method works — the deposit flow spreads
the wallet object but forwards this method explicitly at every wrapper site.

Seam invariant: never call deriveContextHash between approveDepositTerms and
the last terms-bound signature of a connection — deriving while an intent is
loaded nullifies it on-device. Design: the SDK owns approval (mirrors its
deriveContextHash/signPsbts orchestration); provider-internal and app-driven
placements were rejected.

#### Methods

##### approveDepositTerms()

```ts
approveDepositTerms(terms): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L74)

###### Parameters

###### terms

[`DepositTerms`](#depositterms)

###### Returns

`Promise`\<`void`\>

***

### BuildDepositTermsInputs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L97)

#### Properties

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:98](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L98)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L99)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L100)

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L101)

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L102)

##### vaultProviderPk

```ts
vaultProviderPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:103](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L103)

##### keeperPks

```ts
keeperPks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L104)

##### challengerPks

```ts
challengerPks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L105)

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L106)

##### vaultAmounts

```ts
vaultAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L107)

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L108)

##### peginMaxFee

```ts
peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:109](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L109)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L78)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L89)

Spreadable forward of `approveDepositTerms` for wallet-wrapper objects.
Object spread drops prototype methods, so every `{...wallet}` wrapper site
must re-attach the capability explicitly: `...forwardDepositApproval(wallet)`.

#### Parameters

##### wallet

[`BitcoinWallet`](managers.md#bitcoinwallet)

#### Returns

`Partial`\<[`DepositTermsApprover`](#deposittermsapprover)\>
