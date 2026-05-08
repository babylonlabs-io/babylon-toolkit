# Summary

The Aave borrow and repay flows resolved the user's selected reserve by
`token.symbol`, not by the on-chain `reserveId`. Symbols are not unique
within a Core Spoke (e.g. bridged-USDC vs. native-USDC), so two reserves
sharing a symbol could collapse to a single "first-match-wins" lookup at the
detail page, after which the signed `borrow(reserveId, …)` /
`repay(reserveId, …)` transaction would target a different reserve than the
row the user clicked. `assertReserveMatchesOnChain` did not catch this
because it only checks `(reserveId, tokenAddress)` self-consistency for the
already-selected reserve — both reserves in a collision pair pass the guard.

This PR makes `reserveId` the canonical selection key end-to-end: the asset
list rows, the asset selection modal (borrow and repay), the borrow flow's
local state, the dashboard's repay routing, the route URL, the
`useAaveReserveDetail` lookup, and the `BorrowedAsset` / modal `Asset`
shapes. `symbol` stays for display only.

# Issue

- https://github.com/babylonlabs-io/baby-auditor-findings/issues/234
- Borrow/repay reserve selection identified the chosen reserve by token
  symbol (a non-unique field) and resolved by case-insensitive symbol match
  inside `useAaveReserveDetail`. With two same-symbol reserves on the same
  spoke, the user could sign a borrow or repay against the wrong reserve
  silently.
- Finding: **CONFIRMED**.

# Analysis

End-to-end before the fix:

1. The asset list discarded the row's id at click time:
   - `services/vault/src/components/simple/BorrowFlow/BorrowAssetSelection.tsx:62` —
     `onClick={() => onSelectAsset(asset.symbol)}` even though the row was
     keyed by `asset.reserveId`.
   - `services/vault/src/applications/aave/components/AssetSelectionModal/AssetSelectionModal.tsx:78,108` —
     same pattern for the shared borrow/repay modal.
2. The flow propagated only the symbol:
   - `services/vault/src/components/simple/BorrowFlow/useBorrowFlow.ts:27,34` —
     `selectedAssetSymbol` state, fed into `useAaveReserveDetail` as
     `reserveId`.
   - `services/vault/src/components/simple/DashboardPage.tsx:121-140` —
     `/app/aave/reserve/${assetSymbol.toLowerCase()}` for both the
     single-debt repay shortcut and the modal selection callback.
3. The detail hook resolved by symbol, first-wins:
   - `services/vault/src/applications/aave/components/Detail/hooks/useAaveReserveDetail.ts:98-105` —
     `allBorrowReserves.find((r) => r.token.symbol.toLowerCase() === reserveId.toLowerCase())`.
4. The resolved reserve's id is the positional argument in the signed
   transaction:
   - `services/vault/src/applications/aave/hooks/useBorrowTransaction.ts:113`
   - `services/vault/src/applications/aave/hooks/useRepayTransaction.ts:131,147`
5. The on-chain integrity guard
   `services/vault/src/applications/aave/services/assertReserveMatchesOnChain.ts:57-71`
   verifies `(reserveId, token.address)` map to the same on-chain reserve,
   but both inputs come from the already-selected (wrong-symbol) reserve, so
   the guard is self-consistent and passes.

The reachable failure mode is therefore a wrong-but-valid borrow or repay,
silently executed, with no contract-level revert.

# Options Considered

- **Option A — make `reserveId` the canonical selection key end-to-end.**
  The route param is already named `:reserveId`; this option simply makes
  the param actually carry the id, propagates it through the click handlers
  / flow state / modal `Asset` / `BorrowedAsset` shape, and changes
  `useAaveReserveDetail` to look up by id. Closes the bug at the source and
  preserves `assertReserveMatchesOnChain` as a meaningful second line of
  defence rather than the only line. Trade-off: the URL contract for
  `/app/aave/reserve/<x>` changes from symbol to id; legacy symbol URLs
  resolve to the existing "Reserve not found" empty state.
- **Option B — keep symbol in the URL/state and add a
  uniqueness/disambiguation guard.** Either fail-closed in
  `fetchAaveAppConfig` on collision (matches the PR-1545 anti-pattern: one
  bad indexer payload kills borrow/repay across the dashboard), or rewrite
  labels with an address-suffix discriminator (changes user-visible names
  and still requires a non-symbol key to be plumbed to the tx site,
  effectively re-doing Option A under the hood).
- **Option C — minimal mitigation: only fix the route /
  `useAaveReserveDetail` lookup.** Not viable: the click handlers still
  emit the symbol, so the lookup has no information about which same-symbol
  row was clicked.

# Chosen Approach

**Option A**, matching the prior analyses' recommendations. It is the
smallest correct change, removes the bug at the source rather than papering
over it, and aligns with the codebase rule that signed-payload values must
not depend on a non-unique identifier. Option B's fail-closed variant is
exactly the pattern this codebase has rejected in past PRs; Option B's
suffix variant ends up doing most of A anyway and changes user-visible
labels for a problem that A solves without UI churn.

# Implementation

Production code:

- `services/vault/src/components/simple/BorrowFlow/BorrowAssetSelection.tsx`
  — emit `asset.reserveId`; callback signature `(reserveId: string) => void`.
- `services/vault/src/components/simple/BorrowFlow/useBorrowFlow.ts` —
  state renamed to `selectedReserveId`.
- `services/vault/src/components/simple/BorrowFlow/index.tsx` — forwards
  `selectedReserveId` to `useAaveReserveDetail`.
- `services/vault/src/applications/aave/types.ts` — `Asset` gains a
  required `reserveId: string` field (canonical key for routing /
  selection).
- `services/vault/src/applications/aave/components/AssetSelectionModal/AssetSelectionModal.tsx`
  — both list paths emit `reserveId`; React keys are reserve-id based.
- `services/vault/src/applications/aave/hooks/useAaveBorrowedAssets.ts` —
  `BorrowedAsset` exposes `reserveId`; populated from
  `reserve.reserveId.toString()`.
- `services/vault/src/hooks/useDashboardState.ts` — propagates `reserveId`
  through `selectableBorrowedAssets`.
- `services/vault/src/components/simple/DashboardPage.tsx` —
  `handleRepay` (single-debt shortcut) and `handleSelectAsset` route by
  `reserveId`, not lower-cased symbol.
- `services/vault/src/components/simple/LoansSection.tsx` — `LoanAsset`
  gains `reserveId`; React keys are stable per-reserve even with same-symbol
  debts.
- `services/vault/src/applications/aave/components/Detail/hooks/useAaveReserveDetail.ts`
  — reserve resolution is `r.reserveId.toString() === reserveId`;
  `assetConfig` echoes `reserveId` so downstream consumers cannot collapse
  back to symbol later.

Behavioural effect: the signed `borrow` / `repay` transaction now always
targets the reserve whose row the user clicked. Same-symbol reserves render
as distinct rows with stable keys; click handlers emit their own reserve id;
the detail page resolves by id; the URL surface uses id; the on-chain
integrity guard remains in place as a second-line check.

# Tests

Added regression coverage:

- `services/vault/src/applications/aave/components/Detail/hooks/__tests__/useAaveReserveDetail.test.tsx`
  - New: `resolves the second same-symbol reserve by its reserveId, not the
    first symbol match` — two `USDC` reserves with distinct ids; passing
    the second id resolves to that reserve (and `assetConfig.reserveId`
    echoes it).
  - New: `returns null when the URL param is the symbol of an existing
    reserve (no id match)` — guards against future regression toward
    symbol-fallback behaviour.
  - Existing tests updated to pass numeric id strings (`"2"`, `"3"`)
    instead of symbol strings (`"USDC"`, `"WBTC"`), matching the mocks'
    `reserveId` values.
- `services/vault/src/components/simple/BorrowFlow/__tests__/BorrowAssetSelection.test.tsx`
  (new): two same-symbol rows; clicking the second row calls
  `onSelectAsset` with that row's `reserveId`, and both rows mount under
  unique React keys.
- `services/vault/src/applications/aave/components/AssetSelectionModal/__tests__/AssetSelectionModal.test.tsx`
  (new): same-symbol coverage in both modal modes — the default
  `borrowableReserves` path (borrow flow) and the caller-supplied `assets`
  path (repay flow). Each clicks the second of two `USDC` rows and asserts
  the second row's `reserveId` is emitted.
- `services/vault/src/applications/aave/hooks/__tests__/useAaveBorrowedAssets.test.tsx`
  (new): two debt positions in two same-symbol reserves produce two
  distinct `BorrowedAsset` entries with distinct `reserveId` fields.

Verification commands:

- `pnpm --filter vault exec vitest run` — 95 files, 1171 tests passed
  (6 pre-existing skipped).
- `pnpm --filter vault run lint` — 0 errors (78 pre-existing warnings;
  exit 0).
- `pnpm --filter vault exec tsc --noEmit` — exit 0.

# Verification

Codex verification: APPROVED after 1 cycle(s).
Final gate from /home/gbarkhatov/projects/worktrees/claude/234-reserve-selection-symbol (top-level):
- pnpm i:     rc=0
- pnpm lint:  rc=0
- pnpm test:  rc=0
- pnpm build: rc=0
See /home/gbarkhatov/projects/worktrees/claude/.orchestrator/logs/234/05-final-gate.log for the raw output.

# Risk / Follow-up

- URL surface change: any externally-shared link of the form
  `/app/aave/reserve/usdc` now lands on the existing "Reserve not found"
  empty state instead of resolving to the (potentially wrong) first-match
  reserve. The dashboard's own navigation builds the new id-based URLs, so
  no internal call site is broken.
- Token-address disambiguator in the UI for ambiguous same-symbol cases
  (recommended in the audit) is a UX improvement and is left as a
  follow-up. Correctness no longer depends on the user disambiguating
  visually because the click target carries the id.
- Price lookup
  (`useAaveReserveDetail.ts` `tokenPriceUsd`,
  `prices[reserve.token.symbol]`) is still symbol-keyed; same-symbol
  reserves will display the same price. Display-only, does not feed signed
  payloads. Out of scope for this PR; called out by the prior analyses as a
  follow-up.
- `services/vault/src/hooks/useActivities.ts` keys activities by symbol —
  read-only display path, not in this PR's blast radius.

# Manual Checklist
- [ ] Review diff manually
- [ ] Run desired local checks
- [ ] Confirm full lint/test/build gate passed or is documented
- [ ] Commit with signed commit / YubiKey
- [ ] Push branch
- [ ] Open PR
- [ ] Link PR to audit issue using the full audit issue URL

Closes https://github.com/babylonlabs-io/baby-auditor-findings/issues/234
