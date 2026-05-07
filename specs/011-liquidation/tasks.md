# Tasks: Liquidation

**Input**: [spec.md](spec.md), [diff.md](diff.md), [current-state.md](current-state.md)
**Created**: 2026-05-07

**Format**: `[ID] [P?] [Story] Description`
- `[P]` = can run in parallel with other tasks in the same phase (different files)
- `[Story]` = which user story this task belongs to (US1-US4) or `Foundation` / `Restyle`

> Each task below is sized to be one GitHub issue and roughly one PR.

---

## Phase 1: Foundational (blocks everything)

**Purpose**: Event ingestion, event-derived types, and preference storage. Without these, no modal or activity row can be produced.

- [ ] **T001** [Foundation] Add Aave liquidation event GraphQL query to indexer client. Update [services/vault/src/applications/aave/services/fetchPositions.ts](services/vault/src/applications/aave/services/fetchPositions.ts) (or new `fetchLiquidations.ts` sibling) to fetch per-user liquidation events with: vault id, BTC amount liquidated, USD price at liquidation, repaid loan amount + currency, transaction hash, timestamp, partial/full flag. Validate schema against the indexer.
- [ ] **T002** [P] [Foundation] Add `LiquidationEvent` type to [services/vault/src/types/](services/vault/src/types/). Mirror the indexer schema. Include partial/full discriminator and a `parentLoanPositionId` so multi-vault liquidations can be grouped.
- [ ] **T003** [Foundation] Build `useLiquidationEvents()` hook in [services/vault/src/applications/aave/hooks/](services/vault/src/applications/aave/hooks/) that calls T001 query, returns grouped events (by parent loan position so paginated modal can iterate). Polling cadence per existing position polling.
- [ ] **T004** [P] [Foundation] Extend [services/vault/src/storage/peginStorage.ts](services/vault/src/storage/peginStorage.ts) (or new `liquidationStorage.ts` sibling) with `liquidationNoticePreference` flag (per-user, localStorage).
- [ ] **T005** [P] [Foundation] Build `useLiquidationPreferences()` hook. Read/write the T004 flag. Return `{ shouldShowModal, dismissPermanently }`.

**Checkpoint**: events flow into the app, types exist, preferences persist. User story phases can begin.

---

## Phase 2: US1 - Notify user of full liquidation (P1) 🎯 MVP

**Goal**: When the user's entire position is liquidated, show a modal explaining what happened.
**Independent test**: Force a vault into terminal liquidation state via the indexer fixture; assert modal renders with correct values and the Activity link works.

- [ ] **T006** [US1] Build `LiquidationModal` shell in [services/vault/src/components/simple/LiquidationModals/](services/vault/src/components/simple/LiquidationModals/) (new directory). Single-page variant: title "Vault liquidated", body copy from Figma, fields (liquidation price, BTC liquidated, loan repaid), "View Activity" / "Done" buttons, "Do not show again" checkbox.
- [ ] **T007** [US1] Wire `LiquidationModal` into the dashboard root. Trigger when `useLiquidationEvents()` returns a fresh full-liquidation event AND `useLiquidationPreferences().shouldShowModal === true`. One-time render per event id.
- [ ] **T008** [P] [US1] Implement "View Activity" deep link: route to Activity page filtered by transaction hash from the event. Match existing Activity filter URL convention.
- [ ] **T009** [P] [US1] Implement "Do not show again": on Done with checkbox checked, call `dismissPermanently()`. Verify modal does not appear on subsequent fresh events while flag is set.

**Checkpoint**: a full liquidation produces a modal the first time the user opens the app afterwards.

---

## Phase 3: US2 - Notify user of partial liquidation with pagination (P1)

**Goal**: When N out of M vaults are liquidated for one loan, show a paginated modal walking through each vault.
**Independent test**: Fixture with 3 vaults, 2 liquidated → modal paginates 1/2 → 2/2 with per-vault values; remaining vault stays active on dashboard.

- [ ] **T010** [US2] Extend `LiquidationModal` (T006) to support paginated mode. Accept `events: LiquidationEvent[]`; render `Vault liquidated (X/N)` header, `Next` / `Done` buttons, per-page vault values. Single-event arrays render as the single-page variant from US1.
- [ ] **T011** [US2] Add partial-liquidation copy variant: title "Vault partially liquidated", body "Part of your position was liquidated when BTC reached your liquidation price. Check Activity for the full breakdown." Render when `event.partial === true` AND not paginated.
- [ ] **T012** [US2] Update T007 trigger to group events by `parentLoanPositionId` so multi-vault liquidations open a single paginated modal, not N modals.

**Checkpoint**: multi-vault liquidations open one paginated modal; single partial liquidations open the partial variant.

---

## Phase 4: US4 - Liquidation events in Activity log (P2)

**Goal**: Each liquidation produces structured Activity rows so the user can audit independently of the modal.
**Independent test**: Trigger fixture liquidation; assert one row per protocol event with correct amount, timestamp, transaction hash.

- [ ] **T013** [US4] Build activity-row generator in [services/vault/src/applications/aave/utils/](services/vault/src/applications/aave/utils/). Input: `LiquidationEvent`. Output: 2-3 `ActivityLog` rows (`Collateral Liquidated`, `Loan Repaid`, optionally `Fairness Debt Repayment`). Use existing `ActivityLog` shape from [activityLog.ts:20-74](services/vault/src/types/activityLog.ts#L20-L74).
- [ ] **T014** [US4] Wire generator into the Activity feed. Existing [ActivityTable.tsx](services/vault/src/components/Activity/ActivityTable.tsx) renders without changes; only the upstream feed (where rows are aggregated) needs the generator output appended.
- [ ] **T015** [P] [US4] Resolve `Fairness Debt Repayment` semantics with the protocol team (see [spec.md](spec.md) Edge Cases / Assumptions). Update T013 to emit the row only when the protocol indicates residual debt was settled.

---

## Phase 5: Dashboard "After Liquidation" updates (cross-cutting)

**Goal**: Dashboard accurately reflects post-liquidation state.

- [ ] **T016** [Restyle] Render `Liquidated` badge in [services/vault/src/components/simple/CollateralVaultItem.tsx:86-89](services/vault/src/components/simple/CollateralVaultItem.tsx#L86-L89) when `contractStatus === LIQUIDATED`. Reuse the existing `getDisplay()` mapping at [peginStateMachine.ts:455-462](services/vault/src/models/peginStateMachine.ts#L455-L462).
- [ ] **T017** [P] [Restyle] Apply terminal styling to liquidated vault rows: greyed-out, non-interactive (no Reorder, no Withdraw, no Borrow actions). Update `CollateralVaultItem` action gating.
- [ ] **T018** [Restyle] Update [CollateralSection.tsx](services/vault/src/components/simple/CollateralSection.tsx) to segregate liquidated vaults into a separate group below active vaults. Match Figma "Dashboard - After Liquidation" layout.
- [ ] **T019** [P] [Restyle] Add `Liquidation Order` column showing `1st` / `2nd` / `3rd` derived from `liquidationIndex`. Surface in vault rows when the user has multiple vaults backing one loan.
- [ ] **T020** [Restyle] Add `Date` and `Transaction Hash` columns to the post-liquidation vault list, populated from the matching `LiquidationEvent` (via T003 hook).
- [ ] **T021** [P] [Restyle] Verify `Vault Provider` (e.g. "Atlas Custody") column renders per Figma. Provider data already exists on vault model; check column visibility and formatting.
- [ ] **T022** [Restyle] Build "post-liquidation summary banner" component in [services/vault/src/components/simple/](services/vault/src/components/simple/). Shows: vaults liquidated count, BTC remaining, new health factor. Renders above CollateralSection when any liquidation event is present in the current session.

---

## Phase 6: US3 - Vault reorder restyle (P2)

**Goal**: Match the new design without changing functionality.
**Independent test**: Existing reorder flow continues to work; new styling matches Figma frame.

- [ ] **T023** [US3] Restyle [ReorderVaultsModal.tsx](services/vault/src/components/simple/ReorderVaults/ReorderVaultsModal.tsx) to match Figma. No API changes.
- [ ] **T024** [P] [US3] Restyle [ReorderSuccessModal.tsx](services/vault/src/components/simple/ReorderVaults/ReorderSuccessModal.tsx) to match Figma.
- [ ] **T025** [P] [US3] Restyle reorder entry point in [PositionNotificationBanner.tsx:73-80](services/vault/src/components/simple/PositionNotificationBanner/PositionNotificationBanner.tsx#L73-L80) to match new design.

---

## Phase 7: Verification

- [ ] **T026** [Verify] Two-vault and three-vault fixture tests for the paginated modal (US2).
- [ ] **T027** [P] [Verify] Activity-feed snapshot test for a synthetic liquidation event (US4).
- [ ] **T028** [P] [Verify] Manual QA pass: full liquidation, partial single-vault, partial multi-vault. Each path verified end-to-end against Figma frame `2646:116649`.

---

## Dependency Summary

```
Phase 1 (Foundation: T001-T005)
  ↓
  ├─ Phase 2 (US1 modal: T006-T009)
  │    ↓
  │    └─ Phase 3 (US2 pagination: T010-T012)
  │
  ├─ Phase 4 (US4 activity rows: T013-T015)
  │
  └─ Phase 5 (Dashboard restyle: T016-T022)  [partially parallel; T020 needs T003]

Phase 6 (US3 reorder restyle: T023-T025) - independent of Phase 1; can start immediately
Phase 7 (Verification: T026-T028) - after the relevant story phase completes
```

---

## Issue-Creation Notes (for Phase 4 ticket conversion)

When converting these tasks to GitHub issues:
- Title format: `[Liquidation] T### - <short description>`
- Labels: `feature:liquidation`, plus one of `foundation` / `us1` / `us2` / `us3` / `us4` / `restyle` / `verify`
- Each issue links back to [spec.md](spec.md) and [diff.md](diff.md)
- Phase 1 issues should be marked as **blocking** for downstream phases
