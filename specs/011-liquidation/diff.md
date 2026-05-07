# Liquidation - Design vs. Implementation Diff

**Date**: 2026-05-07
**New design**: Figma frame `2646:116649` (TBV Master File - Liquidation page)
**Current code**: see [current-state.md](current-state.md)

**Legend**:
- ✅ exists today and matches the new design
- 🟡 exists but differs from the new design
- ❌ does not exist; needs to be built

---

## Notification Layer (modals)

| New design element | Status | Where today | Gap |
|---|---|---|---|
| "Vault partially liquidated" modal (single-vault partial) | ❌ | none | Build new modal: liquidation price, BTC liquidated, loan repaid, "View Activity" + "Done" + "Do not show again" |
| "Vault liquidated (X/N)" paginated modal (multi-vault partial) | ❌ | none | Build paginated modal with `Next` until last page (`Done`); per-page vault-scoped values |
| "Vault liquidated" modal (full liquidation) | ❌ | none | Build single-page full-liquidation modal; copy: "Your vault was liquidated when BTC reached your liquidation price" |
| "Do not show again" checkbox in modal | ❌ | none | Reuse `DismissibleSubSection` pattern; persist preference |
| "View Activity" deep link from modal | ❌ | none | Wire button to Activity route filtered to triggering liquidation |

---

## Activity Log

| New design element | Status | Where today | Gap |
|---|---|---|---|
| `Liquidation` activity type | ✅ | [activityLog.ts:14](services/vault/src/types/activityLog.ts#L14) | None |
| Generic Activity table (date, app, type, amount, tx hash, explorer link) | ✅ | [ActivityTable.tsx:20](services/vault/src/components/Activity/ActivityTable.tsx#L20) | None |
| `Partially Liquidated` row | ❌ | none | Produce row from on-chain event |
| `Collateral Liquidated` row | ❌ | none | Produce row from on-chain event |
| `Loan Repaid` row | ❌ | none | Produce row from on-chain event |
| `Fairness Debt Repayment` row | ❌ | none | Produce row; behaviour to clarify (see spec.md edge cases) |
| Per-row transaction hash with explorer link | ✅ | `ActivityTable.tsx` | None (works once rows exist) |

---

## Dashboard - Collateral Active state

| New design element | Status | Where today | Gap |
|---|---|---|---|
| Total collateral value | ✅ | `positionService.ts:34-69` | None |
| Total borrowed | ✅ | `positionService.ts` | None |
| Health factor | ✅ | [HealthFactorGauge.tsx:28](services/vault/src/components/shared/HealthFactorGauge.tsx#L28) | None |
| Liquidation price | 🟡 | `positionService.ts` (data exists; "Liquidaiton Price" typo in Figma) | Verify display label / formatting matches design |
| Liquidation Risk % | 🟡 | `healthFactorDisplay.ts` (status derived) | Add explicit `% to liquidation` field if not currently shown |
| Vault list with `In use` / `Available` badge | ✅ | [CollateralVaultItem.tsx:86-89](services/vault/src/components/simple/CollateralVaultItem.tsx#L86-L89) | None |
| Reorder entry point | ✅ | [PositionNotificationBanner.tsx:73-80](services/vault/src/components/simple/PositionNotificationBanner/PositionNotificationBanner.tsx#L73-L80) | Restyle to match new design |

---

## Dashboard - After Liquidation state

| New design element | Status | Where today | Gap |
|---|---|---|---|
| Vault rows show terminal `Liquidated` badge | 🟡 | label exists (`peginStateMachine.ts:83`); not rendered | Wire `CollateralVaultItem` to render the existing label for `LIQUIDATED` |
| Liquidated vaults greyed-out / non-interactive | ❌ | none | Add terminal styling pass to `CollateralVaultItem` |
| Liquidated vaults grouped/segregated from active | ❌ | none | Update [CollateralSection.tsx](services/vault/src/components/simple/CollateralSection.tsx) to split active vs. terminal |
| Liquidation Order column (`1st`, `2nd`, `3rd`) on row | 🟡 | data exists (`liquidationIndex`); not rendered | Add column to vault row |
| `Date` column per liquidated vault | ❌ | none | Surface from liquidation event data (depends on event ingestion) |
| Per-row `Status` column | ✅ | `CollateralVaultItem.tsx` | None |
| Per-row `Transaction Hash` column | ❌ | none | Surface from liquidation event data |
| Vault Provider column (e.g. `Atlas Custody`) | 🟡 | provider data exists in vault model | Verify column is exposed in dashboard layout |
| Post-liquidation summary banner (collateral changes, new HF) | ❌ | none | Build new component |

---

## Vault Reorder

| New design element | Status | Where today | Gap |
|---|---|---|---|
| Drag-and-drop reorder UI | ✅ | [ReorderVaultsModal.tsx:46-143](services/vault/src/components/simple/ReorderVaults/ReorderVaultsModal.tsx#L46-L143) | Restyle pass only |
| Reorder backend (`reorderVaults` tx) | ✅ | [spoke.ts:237-240](packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L237-L240) | None |
| Network fee estimate before submit | ✅ | `ReorderVaultsModal.tsx` | None |
| Success modal | ✅ | `ReorderSuccessModal.tsx` | Restyle pass only |
| `liquidationIndex` updated post-reorder | ✅ | `fetchPositions.ts:47-48` | None |

---

## Event Ingestion

| New design element | Status | Where today | Gap |
|---|---|---|---|
| Detect liquidation since last session | ❌ | none | Indexer GraphQL query for liquidation events; hook polling on app load |
| Detect in-session liquidation | ❌ | only pull-based RPC reads of HF/account data | Either polling cadence + state-diff trigger, or event subscription |
| Liquidation event schema (price, BTC amount, repaid amount, tx hash, vault id, partial/full flag) | ❌ | none | Indexer schema work + SDK types + hook |

---

## Preferences

| New design element | Status | Where today | Gap |
|---|---|---|---|
| "Do not show again" flag persisted per user | ❌ | `peginStorage.ts` is the pattern but no flag yet | Add `liquidationNoticePreference` to storage layer |
| Hook to read/write the flag | ❌ | none | Build `useLiquidationPreferences()` |
| Suppression respects modal but not Activity log | ❌ | none | Wire suppression to modal show condition only |

---

## Outstanding Clarifications (carry from spec.md)

- **Fairness Debt Repayment** - when does this row appear? Every liquidation, or only when residual debt remains after collateral exhausted?
- **In-session detection cadence** - acceptable polling interval vs. WebSocket subscription cost?
- **Partial vs. full modal trigger** - is `partial` defined as "≥1 vault remains" and `full` as "0 vaults remain"? Or is there a protocol-level flag we should mirror?

---

## Effort Categories (rough)

| Category | Items | Notes |
|---|---|---|
| **Build new** | 12 items | Modals (3), event ingestion (3), activity rows (4), banner, preference + hook |
| **Restyle / wire existing** | ~6 items | Liquidated badge rendering, terminal styling, segregation, reorder restyle, dashboard column adds |
| **No change** | ~8 items | Type system, activity table, reorder backend, health factor, label strings |
