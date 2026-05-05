# Feature Specification: Aave - Borrow

**Feature Branch**: `006-aave-borrow`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-15, BT-16)

## User Scenarios & Testing *(mandatory)*

### User Story BT-15 - Borrow ERC-20 against BTC collateral (Priority: P1)

From the Aave reserve detail page the user selects an asset (USDC, WETH,
USDT, etc.), enters a borrow amount, reviews the resulting health factor,
and submits the borrow transaction via their Ethereum wallet.

**Why this priority**: Primary monetisation flow for users; the headline
DeFi feature.

**Independent Test**: With a known collateral position, borrow a calibrated
amount; verify pre-submit health factor preview matches post-submit state.

**Acceptance Scenarios**:

1. **Given** a collateral position, **When** the borrow form renders,
   **Then** the available borrow limit is calculated from collateral value
   and liquidation threshold, not hardcoded.
2. **Given** the user types a borrow amount, **When** the form
   recalculates, **Then** the health factor preview updates in real time.
3. **Given** the resulting health factor would fall below 1.25, **When**
   the user attempts to submit, **Then** borrowing is blocked.
4. **Given** a valid borrow is submitted, **When** the transaction
   confirms, **Then** the new loan appears in the loans section.

---

### User Story BT-16 - Repay borrowed ERC-20 (Priority: P1)

From the loan card the user enters a partial or full repayment amount for
any borrowed asset and submits an Ethereum repay transaction. Repaying
improves the health factor and reduces liquidation risk.

**Why this priority**: Required to close out positions and respond to
liquidation risk.

**Independent Test**: With an open loan, run partial and full repayment;
verify post-repay debt and health factor.

**Acceptance Scenarios**:

1. **Given** an open loan, **When** the repay form renders, **Then** the
   user can select full repayment with a single click.
2. **Given** a repayment amount is entered, **When** the form
   recalculates, **Then** the health factor preview updates to reflect the
   post-repayment state.
3. **Given** the repay transaction confirms, **When** state refreshes,
   **Then** the displayed debt balance is reduced.
4. **Given** the user enters more than the outstanding debt, **When**
   validation runs, **Then** submission is prevented.

### Edge Cases

- The borrow asset's price moves significantly between preview and submit.
- A borrow transaction is in flight when the user opens a repay form.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Borrow limit MUST be derived from on-chain collateral value
  and liquidation threshold.
- **FR-002**: Health factor preview MUST update in real time on input
  change.
- **FR-003**: System MUST block submission when the resulting health
  factor would be below 1.25.
- **FR-004**: System MUST prevent repayment of more than the outstanding
  debt.

### Key Entities

- **Loan**: Borrowed asset, amount outstanding, accrued interest, parent
  collateral position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Borrow preview matches post-confirmation health factor within
  the precision of on-chain pricing.
- **SC-002**: 100% of attempted borrows that would cross the 1.25 threshold
  are blocked client-side.

## Assumptions

- Aave reserve and liquidation parameters are read from the Aave protocol,
  not hardcoded.
- Asset price updates are timely enough that the preview is meaningful.
