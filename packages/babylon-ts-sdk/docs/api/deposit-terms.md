[@babylonlabs-io/ts-sdk](README.md) / deposit-terms

# deposit-terms

Protocol-level deposit terms for intent-based signing wallets (e.g. the
Ledger vault provider): the `DepositTerms` shape an approval-capable wallet
is shown before any deposit signature, the thin `buildDepositTerms`
projection, and the `supportsDepositApproval` capability probe. Device
wire-format concerns (TLV framing, SLIP-44, byte order) are provider-side.

## Classes

### DepositTermsRejectedError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts)

SDK-owned typed rejection thrown when deposit terms fail pre-approval validation.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new DepositTermsRejectedError(message, reason): DepositTermsRejectedError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts)

## Interfaces

### DepositTermsVaultGroup

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

#### Properties

##### htlcVout

```ts
readonly htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

0-based; equals the group's position (groups are ascending by vout).

##### vaultProviderBtcPubkey

```ts
readonly vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

x-only hex (64 chars), as validated on-chain upstream.

##### peginAmount

```ts
readonly peginAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

sats

##### commissionFee

```ts
readonly commissionFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

sats; the same value for every vault.

##### peginMaxFee

```ts
readonly peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

sats; the cap an approving wallet enforces on the PegIn tx fee. Equals
the graph's exact (minimum) PegIn fee, which is deterministic — so the
cap is satisfied exact-by-construction.

***

### DepositTerms

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

Field names follow btc-vault vocabulary (the protocol source of truth);
a device-wire encoder maps them to its intent fields (e.g. the Ledger TLV:
protocolFeeRate -> base_fee_rate, timelockPegin -> pegin_csv_timelock,
timelockAssert -> payout_timelock, peginAmount -> vault_amount).

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

btc-vault tx-graph version (`vaultCoreVersion`) these terms describe —
the vault's stamped on-chain version for resumes, the chain's
`activeVaultCoreVersion` for fresh deposits. It selects the PegIn shape
an approving wallet must expect: v1 = 2 outputs, no anchor; v2/v3 = TRUC
nVersion 3, 3 outputs with a 240-sat P2A anchor at vout 2, and an
Assert OP_RETURN marker that raises the claim value
(btc-vault `transactions/pegin.rs`, `assert_marker.rs`). A provider that
supports only one shape MUST reject the others here rather than
mis-validating the PSBTs later.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

sat/vB; the tx-graph fee rate (protocolFeeRate), NOT the mempool funding
rate. Approving wallets bound each payout's fee against this rate —
pass the exact graph rate, not an inflated ceiling.

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

Vault-UTXO CSV timelock (blocks).

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

btc-vault `timelock_assert` (t2) — the CSV on Assert output 0. Its own
param, though production derives it and `timelockPegin` from one value.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

HTLC refund CSV timelock (blocks).

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

64-char hex in display order. A device-wire encoder may need the
little-endian form — some hardware byte-compares it against
PSBT_IN_PREVIOUS_TXID rather than recomputing the txid.

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

sats; the funded Pre-PegIn fee (an approving wallet caps the signed fee at this).

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

x-only hex. Sorted ascending by the upstream on-chain validation
(validateOnChainParticipantKeys); the builder passes them through
unasserted — approving devices may reject unsorted lists at load.

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

x-only hex, sorted ascending upstream independently of vaultKeeperBtcPubkeys (same
pass-through contract). Universal challengers only — the full graph
challenger set is vaultKeeperBtcPubkeys ∪ universalChallengerBtcPubkeys (vault keepers are the local
challengers).

##### vaults

```ts
vaults: readonly DepositTermsVaultGroup[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

Per-vault groups, ordered by ascending htlcVout.

***

### DepositTermsApprover

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

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
The re-approval sites are `PeginManager.preparePegin`,
`runDepositorPresignFlow`, and `signAndBroadcast` (the Pre-PegIn broadcast,
which derives immediately before approving — see `ensurePrePeginTermsApproval`).

#### Methods

##### approveDepositTerms()

```ts
approveDepositTerms(terms): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

###### Parameters

###### terms

[`DepositTerms`](#depositterms)

###### Returns

`Promise`\<`void`\>

***

### BuildDepositTermsInputs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

btc-vault tx-graph version the graph is built under.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

btc-vault `timelock_assert` (t2) — its own param; NOT derived from timelockPegin here.

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### maxAcceptableCommissionBps

```ts
maxAcceptableCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

Ceiling bps, not the quote — see [DepositTermsVaultGroup.commissionFee](#commissionfee).

##### peginAmounts

```ts
peginAmounts: readonly bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### depositorClaimValue

```ts
depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

##### peginMaxFee

```ts
peginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

***

### PrePeginApprovalWallet

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

Minimal structural wallet for the Pre-PegIn ceremony. Mirrors
`DeriveContextHashCapableWallet` so an app-side wrapper object qualifies
without implementing all of `BitcoinWallet`. Both methods are optional so
the capability probe below can run on any wallet.

#### Methods

##### deriveContextHash()?

```ts
optional deriveContextHash(appName, context): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

###### Parameters

###### appName

`string`

###### context

`string`

###### Returns

`Promise`\<`string`\>

##### approveDepositTerms()?

```ts
optional approveDepositTerms(terms): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

###### Parameters

###### terms

[`DepositTerms`](#depositterms)

###### Returns

`Promise`\<`void`\>

***

### EnsurePrePeginTermsApprovalParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

#### Properties

##### wallet

```ts
wallet: PrePeginApprovalWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

##### depositTerms

```ts
depositTerms: DepositTerms | undefined;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

The approved terms — required for approval-capable wallets, ignored (but still txid-checked) otherwise.

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

Funded Pre-PegIn tx hex (0x optional): the funding outpoints AND the txid the terms must match.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

x-only depositor pubkey (64 hex, 0x optional) — the identity the PSBT is signed with.

***

### RebuildSibling

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

One HTLC in the shared Pre-PegIn tx, ordered by (and contiguous in) htlcVout.

#### Properties

##### hashlock

```ts
hashlock: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

32-byte hex hashlock (0x prefix optional), per-vault (feeds the HTLC scriptPubKey).

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

btc-vault `pegin_amount` for this sibling (satoshis).

***

### RebuildDepositTermsCoreInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

Stamped tx-graph version (NOT chain-active).

##### siblings

```ts
siblings: readonly RebuildSibling[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

Sibling HTLCs ordered by htlcVout; index === htlcVout (asserted by the app).

##### fundedPrePeginTxHex

```ts
fundedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

Funded Pre-PegIn tx hex. Gate 0 (hash vs prepeginTxid) is SELF-verified below — callers need not pre-verify.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### prepeginTxid

```ts
prepeginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### prepeginMaxFee

```ts
prepeginMaxFee: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

Funded-tx fee (Σin − Σout), computed by the app; the device's `prepegin_max_fee` bound.

##### maxAcceptableCommissionBps

```ts
maxAcceptableCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

WASM network descriptor for scriptPubKey derivation.

## Type Aliases

### DepositTermsRejectionReason

```ts
type DepositTermsRejectionReason = "device-envelope";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts)

Why the terms were rejected before approval.

## Functions

### buildDepositTerms()

```ts
function buildDepositTerms(inputs): DepositTerms;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/buildDepositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/buildDepositTerms.ts)

Project already-validated pegin inputs into protocol-level deposit terms.
Not a second validator: keys arrive canonical and sorted from on-chain
validation, and non-negative sizing is already asserted by WASM output checks.

#### Parameters

##### inputs

[`BuildDepositTermsInputs`](#builddeposittermsinputs)

#### Returns

[`DepositTerms`](#depositterms)

***

### capMaxAcceptableCommissionBps()

```ts
function capMaxAcceptableCommissionBps(bps): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/commissionCeiling.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/commissionCeiling.ts)

The commission ceiling submitted as registration calldata and mirrored
into `DepositTerms.commissionFee`: quoted + drift headroom, capped.
Single source for both consumers — feed it the SAME quoted bps at prepare
and register time so device-accept stays coextensive with contract-accept.

#### Parameters

##### bps

`number`

#### Returns

`number`

***

### supportsDepositApproval()

```ts
function supportsDepositApproval(wallet): wallet is BitcoinWallet & DepositTermsApprover;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts)

Guard for app-side error mapping. Matches `instanceof` OR the documented
`name` — providers and foreign realms throw structurally-conforming plain
errors that `instanceof` cannot see.

#### Parameters

##### err

`unknown`

#### Returns

`err is DepositTermsRejectedError`

***

### ensurePrePeginTermsApproval()

```ts
function ensurePrePeginTermsApproval(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/prePeginApproval.ts)

Run the derive → approve ceremony (or a no-op) before a Pre-PegIn signature.

- Non-approval wallets: no-op, after asserting the terms (if any) match the tx.
- Approval-capable wallets: require terms, assert they match this tx's txid,
  derive the vault root over the tx's funding outpoints, then approve.

Always derives first: the host cannot read device state, a one-shot cap means
every retry needs the full ceremony, and whether interleaved signing
nullifies a loaded intent is unresolved — so the broadcast path never
approves-only.

#### Parameters

##### params

[`EnsurePrePeginTermsApprovalParams`](#ensureprepegintermsapprovalparams)

#### Returns

`Promise`\<`void`\>

#### Throws

If approval-capable but no terms are provided, or the provided terms
  are for a different transaction.

***

### rebuildDepositTermsCore()

```ts
function rebuildDepositTermsCore(input): Promise<DepositTerms>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/rebuildDepositTermsCore.ts)

#### Parameters

##### input

[`RebuildDepositTermsCoreInput`](#rebuilddeposittermscoreinput)

#### Returns

`Promise`\<[`DepositTerms`](#depositterms)\>

## Variables

### COMMISSION\_BPS\_HEADROOM

```ts
const COMMISSION_BPS_HEADROOM: 25 = 25;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/commissionCeiling.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/commissionCeiling.ts)

Headroom (in basis points) added to the current VP commission to compute
`maxAcceptableCommissionBps` at submit time. Lets the VP raise its
commission by up to this amount between read and submit without forcing
a re-quote. Capped by [MAX\_ACCEPTABLE\_COMMISSION\_BPS\_CAP](#max_acceptable_commission_bps_cap).

Contract check is strict `>` (PeginLogic.sol `VaultProviderCommissionExceeded`
revert), so +25 allows up
to +25 bps of drift.

***

### MAX\_ACCEPTABLE\_COMMISSION\_BPS\_CAP

```ts
const MAX_ACCEPTABLE_COMMISSION_BPS_CAP: 9999 = 9999;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/commissionCeiling.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/commissionCeiling.ts)

Hard ceiling for `maxAcceptableCommissionBps`. The contract enforces
`commissionBps < 10000`, so any value at/above that is unreachable;
`9999` is the maximum useful cap.

***

### DEPOSIT\_TERMS\_REJECTED\_ERROR\_NAME

```ts
const DEPOSIT_TERMS_REJECTED_ERROR_NAME: "DepositTermsRejectedError" = "DepositTermsRejectedError";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/deposit-terms/depositTermsErrors.ts)

The `name` value providers must set on envelope rejections (the wire contract).
