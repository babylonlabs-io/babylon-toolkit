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
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:8](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L8)

0-based; equals the group's position (groups are ascending by vout).

##### vaultProviderPk

```ts
vaultProviderPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:10](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L10)

x-only lowercase hex (64 chars).

##### vaultAmount

```ts
vaultAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L12)

sats

##### commissionFee?

```ts
optional commissionFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L17)

sats; floor(vaultAmount * commissionBps / 10_000). Omitted when the
builder wasn't given a commissionBps (see BuildDepositTermsInputs).

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L19)

sats; the same value for every vault.

##### peginMaxFee

```ts
peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L21)

sats; the minimum PegIn fee for this graph version.

***

### DepositTerms

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L24)

#### Properties

##### baseFeeRate

```ts
baseFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L31)

sat/vB; the tx-graph fee rate (protocolFeeRate), NOT the mempool funding
rate. An approving wallet bounds each payout's fee at baseFeeRate x a
conservative vsize estimate (v22 §4.9.7.1) — pass the exact graph rate,
not an inflated ceiling.

##### peginCsvTimelock

```ts
peginCsvTimelock: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L33)

Vault-UTXO CSV timelock (blocks).

##### payoutTimelock

```ts
payoutTimelock: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L35)

Assert:0 payout timelock; comes from the same protocol param as peginCsvTimelock.

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
keeperPks: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L46)

x-only hex, sorted ascending.

##### challengerPks

```ts
challengerPks: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L52)

x-only hex, sorted ascending independently of keeperPks. Universal
challengers only — the full graph challenger set is keeperPks ∪
challengerPks (vault keepers are the local challengers).

##### vaults

```ts
vaults: DepositTermsVaultGroup[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L54)

Per-vault groups, ordered by ascending htlcVout.

***

### DepositTermsApprover

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L62)

Implemented only by depositor-approval wallets (e.g. a Ledger vault provider).
Either a class field or a prototype method works — the deposit flow spreads
the wallet object but forwards this method explicitly at every wrapper site.

#### Methods

##### approveDepositTerms()

```ts
approveDepositTerms(terms): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L63)

###### Parameters

###### terms

[`DepositTerms`](#depositterms)

###### Returns

`Promise`\<`void`\>

***

### BuildDepositTermsInputs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L79)

#### Properties

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L80)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L81)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L82)

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L83)

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L84)

##### vaultProviderPk

```ts
vaultProviderPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L85)

##### keeperPks

```ts
keeperPks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L86)

##### challengerPks

```ts
challengerPks: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L87)

##### commissionBps?

```ts
optional commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L89)

Omitted -> built terms carry no per-vault commissionFee (see DepositTermsVaultGroup).

##### vaultAmounts

```ts
vaultAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L90)

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:91](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L91)

##### peginMaxFee

```ts
peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L92)

## Functions

### buildDepositTerms()

```ts
function buildDepositTerms(inputs): DepositTerms;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/buildDepositTerms.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/buildDepositTerms.ts#L16)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts#L73)

Seam invariant: never call deriveContextHash between approveDepositTerms and
the last terms-bound signature of a connection — deriving mid-approval
nullifies it. Design: mirrors the SDK's existing deriveContextHash/signPsbts
orchestration — the SDK owns approval by design; provider-internal and
app-driven placements were rejected.

#### Parameters

##### wallet

[`BitcoinWallet`](managers.md#bitcoinwallet)

#### Returns

`wallet is BitcoinWallet & DepositTermsApprover`
