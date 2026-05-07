# Liquidation - Current Implementation Audit

**Date**: 2026-05-07
**Scope**: Inventory of liquidation-related code in babylon-toolkit before applying the new Figma design (frame `2646:116649`).

---

## 1. Liquidation Modal / Notification UI

**Status**: NOT IMPLEMENTED

No modal exists today telling the user "your vault was liquidated" or "partially liquidated".

**Reusable patterns**:
- [services/vault/src/components/simple/PendingDepositModals.tsx](services/vault/src/components/simple/PendingDepositModals.tsx) - state-driven modal switcher (sign / broadcast / WOTS / activation). Same shape we'll need for paginated liquidation modal.
- [services/vault/src/components/simple/ReorderVaults/ReorderSuccessModal.tsx](services/vault/src/components/simple/ReorderVaults/ReorderSuccessModal.tsx) - simple success modal pattern.
- [packages/babylon-core-ui/src/components/DismissibleSubSection/DismissibleSubSection.tsx](packages/babylon-core-ui/src/components/DismissibleSubSection/DismissibleSubSection.tsx) - dismissible-with-callback container.

---

## 2. Vault Status = "Liquidated"

**Status**: PARTIALLY IMPLEMENTED (logic exists, UI rendering doesn't)

**Derivation**:
- [services/vault/src/models/peginStateMachine.ts:83](services/vault/src/models/peginStateMachine.ts#L83) - `LIQUIDATED: "Liquidated"` in `PEGIN_DISPLAY_LABELS`.
- [services/vault/src/models/peginStateMachine.ts:455-462](services/vault/src/models/peginStateMachine.ts#L455-L462) - `getDisplay()` maps `ContractStatus.LIQUIDATED` to label "Liquidated", variant `warning`, message "This vault was liquidated. The collateral was seized to cover unpaid debt."

**Rendering**:
- [services/vault/src/components/simple/CollateralVaultItem.tsx:86-89](services/vault/src/components/simple/CollateralVaultItem.tsx#L86-L89) - currently only renders `In use` / `Available`. **Does not render the `Liquidated` badge.**
- [services/vault/src/types/collateral.ts:32](services/vault/src/types/collateral.ts#L32) - `liquidationIndex: number` exists on `CollateralVaultEntry` but isn't used to mark terminal state in UI.

**Gap**: Component needs to read `contractStatus` and render the existing Liquidated label + style as terminal (greyed out, non-interactive).

---

## 3. Activity Log Entries for Liquidation

**Status**: FRAMEWORK EXISTS, ROW PRODUCTION DOESN'T

**Type system already supports it**:
- [services/vault/src/types/activityLog.ts:11-18](services/vault/src/types/activityLog.ts#L11-L18) - `ActivityType` enum already includes `"Liquidation"`.
- [services/vault/src/types/activityLog.ts:20-74](services/vault/src/types/activityLog.ts#L20-L74) - `ActivityLog` interface has all fields needed (id, date, type, amount, chain, transactionHash, isPending).

**Rendering**:
- [services/vault/src/components/Activity/ActivityTable.tsx:20-109](services/vault/src/components/Activity/ActivityTable.tsx#L20-L109) - generic table, chain-aware explorer linking. No changes needed to display liquidation rows once they're produced.

**Gaps**:
- Nothing creates rows for `Collateral Liquidated`, `Loan Repaid`, `Partially Liquidated`, or `Fairness Debt Repayment`.
- No indexer query / event listener fetches liquidation events.

---

## 4. Dashboard "After Liquidation" State

**Status**: PARTIAL (health factor + collateral fetch exist; post-liquidation segregation doesn't)

**Existing**:
- [services/vault/src/components/shared/HealthFactorGauge.tsx:28-85](services/vault/src/components/shared/HealthFactorGauge.tsx#L28-L85) - rainbow gauge with HF=1.0 marker, real-time data.
- [services/vault/src/applications/aave/utils/healthFactorDisplay.ts](services/vault/src/applications/aave/utils/healthFactorDisplay.ts) - status derivation (no_debt / safe / warning / critical / liquidatable).
- [services/vault/src/applications/aave/services/positionService.ts:34-69](services/vault/src/applications/aave/services/positionService.ts#L34-L69) - `AavePositionWithLiveData` aggregates collateral + live account data.
- [services/vault/src/applications/aave/hooks/usePositionNotifications.ts:59-63](services/vault/src/applications/aave/hooks/usePositionNotifications.ts#L59-L63) - knows liquidation order via `liquidationIndex`.

**Gaps**:
- No visual segregation of terminal (liquidated) vaults from active vaults in [services/vault/src/components/simple/CollateralSection.tsx](services/vault/src/components/simple/CollateralSection.tsx).
- No "post-liquidation summary" banner showing position changes.

---

## 5. Vault Reorder Feature

**Status**: FULLY IMPLEMENTED (UX redesign only; backend untouched)

**UI**:
- [services/vault/src/components/simple/ReorderVaults/ReorderVaultsModal.tsx:46-143](services/vault/src/components/simple/ReorderVaults/ReorderVaultsModal.tsx#L46-L143) - drag-and-drop with `@dnd-kit/core`, network fee estimate, transaction-locked closing.
- [services/vault/src/components/simple/ReorderVaults/ReorderVaultItem.tsx](services/vault/src/components/simple/ReorderVaults/ReorderVaultItem.tsx) - draggable row with position indicator.
- [services/vault/src/components/simple/PositionNotificationBanner/PositionNotificationBanner.tsx:73-80](services/vault/src/components/simple/PositionNotificationBanner/PositionNotificationBanner.tsx#L73-L80) - integrates reorder action into health warnings.

**Backend**:
- [services/vault/src/applications/aave/hooks/useReorderVaults.ts](services/vault/src/applications/aave/hooks/useReorderVaults.ts) - calls Aave `reorderVaults()`.
- [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:237-240](packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L237-L240) - SDK function.
- [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:19-20](packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L19-L20) - `REORDER_VAULTS` constant.
- [services/vault/src/applications/aave/services/fetchPositions.ts:47-48](services/vault/src/applications/aave/services/fetchPositions.ts#L47-L48) - indexer fetches `liquidationIndex` (already updates on `VaultsReordered`).

---

## 6. Aave Liquidation Event Ingestion

**Status**: NOT IMPLEMENTED

**What exists**:
- [services/vault/src/applications/aave/services/positionService.ts:100-200](services/vault/src/applications/aave/services/positionService.ts#L100-L200) - pull-based RPC reads of health factor / account data.
- [services/vault/src/applications/aave/services/fetchPositions.ts](services/vault/src/applications/aave/services/fetchPositions.ts) - GraphQL indexer client; fetches `liquidationIndex` but no liquidation events.
- [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:101-123](packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L101-L123) - on-demand `getUserAccountData()`.

**Gaps**:
- No event listener / subscription for Aave `LiquidationCall` (or v4 equivalent).
- No indexer schema for liquidation events.
- No hook for "did anything liquidate since last session?" check on app load.

---

## 7. "Do Not Show Again" Preferences

**Status**: PATTERN AVAILABLE, NOT WIRED

**Reusable**:
- [packages/babylon-core-ui/src/components/DismissibleSubSection/DismissibleSubSection.tsx](packages/babylon-core-ui/src/components/DismissibleSubSection/DismissibleSubSection.tsx) - dismissible container.
- [services/vault/src/storage/peginStorage.ts](services/vault/src/storage/peginStorage.ts) - localStorage persistence pattern, extendable.

**Gaps**:
- No `liquidationNoticePreference` flag.
- No `useLiquidationPreferences()` hook.

---

## Summary Table

| Component | Status | Path | Action |
|---|---|---|---|
| Liquidation modal UI | Missing | - | Build (P1) |
| Full liquidation modal | Missing | - | Build |
| Partial liquidation modal (paginated) | Missing | - | Build |
| `Liquidated` label string | Exists | `peginStateMachine.ts:83,455` | Reuse |
| `Liquidated` badge rendering | Partial | `CollateralVaultItem.tsx:86` | Add badge rendering |
| `ActivityType` enum entry | Exists | `activityLog.ts:14` | Reuse |
| Activity table display | Exists | `ActivityTable.tsx:20` | No change |
| Activity row creation | Missing | - | Build |
| Liquidation event listener | Missing | - | Build |
| Health factor display | Exists | `HealthFactorGauge.tsx:28` | No change |
| Post-liquidation summary banner | Missing | - | Build |
| Terminal vault grouping | Missing | - | Build |
| Vault reorder UI | Exists | `ReorderVaultsModal.tsx:46` | Restyle to match Figma |
| Vault reorder backend | Exists | `spoke.ts`, `transaction.ts` | No change |
| Dismissible pattern | Exists | `DismissibleSubSection.tsx` | Reuse |
| Liquidation preference storage | Missing | - | Build |
| "Do not show again" hook | Missing | - | Build |
