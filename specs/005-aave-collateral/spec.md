# Feature Specification: Aave - Collateral

**Feature Branch**: `005-aave-collateral`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-13, BT-14)

## User Scenarios & Testing *(mandatory)*

### User Story BT-13 - View BTC collateral position on Aave (Priority: P1)

The dashboard shows the user's total BTC locked as Aave collateral, its USD
value, total outstanding debt, and current health factor. This gives the
user a complete picture of their DeFi position before taking any action.

**Why this priority**: Required context before any borrow or repay action.

**Independent Test**: Seed an account with collateral and debt; assert the
displayed total, USD value, debt, and health factor against on-chain state.

**Acceptance Scenarios**:

1. **Given** the user has active vaults, **When** the collateral panel
   renders, **Then** collateral value is computed from on-chain Aave
   reserve data, not hardcoded prices.
2. **Given** a computed health factor, **When** it renders, **Then** it is
   displayed numerically and colour-coded (healthy / warning / critical).
3. **Given** a new vault becomes ACTIVE, **When** state refreshes, **Then**
   the collateral section updates.
4. **Given** multiple contributing vaults, **When** the panel expands,
   **Then** each vault is listed with its BTC amount.

---

### User Story BT-14 - Reorder collateral vaults (Priority: P2)

When multiple vaults are deposited as collateral, the user can drag-and-drop
to reorder them. The order determines which vaults are withdrawn first and
affects liquidation cascade risk.

**Why this priority**: Optimisation feature for users with multiple vaults;
not blocking for single-vault users.

**Independent Test**: With multiple vaults, drag to reorder, save, and
verify the on-chain order via the adapter contract.

**Acceptance Scenarios**:

1. **Given** the reorder UI is open, **When** vaults render, **Then** each
   vault shows its BTC value and current Aave status.
2. **Given** the user saves a new order, **When** submission runs, **Then**
   the order is submitted to the Aave adapter contract.
3. **Given** the transaction confirms, **When** state refreshes, **Then**
   the UI reflects the updated order.
4. **Given** no vaults are in the ACTIVE state, **When** the panel renders,
   **Then** reordering is disabled.

### Edge Cases

- A vault transitions out of ACTIVE during a reorder save.
- Aave reserve data is temporarily unavailable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute collateral value from on-chain Aave
  reserve data; never hardcoded.
- **FR-002**: Health factor MUST be visually colour-coded by risk band.
- **FR-003**: Reorder save MUST submit the new order through the Aave
  adapter contract.
- **FR-004**: Reordering MUST be disabled when no vaults are ACTIVE.

### Key Entities

- **Collateral Position**: Total BTC, USD value, total debt, health factor,
  contributing vault list (ordered).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Health factor and USD value displayed match on-chain values
  to the precision of the source data.
- **SC-002**: Order changes persist across page reload after on-chain
  confirmation.

## Assumptions

- Aave reserve data and adapter contracts are accessible via the configured
  RPC.
- Health factor risk bands are documented and consistent across views.
