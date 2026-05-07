# Feature Specification: Liquidation

**Feature Branch**: `011-liquidation`
**Created**: 2026-05-07
**Status**: Draft
**Input**: Generated from Figma frame `2646:116649` - TBV x Master File (Updated Flow), page "Liquidation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Notify user of full liquidation (Priority: P1)

When the user's borrowed position falls below the required collateral level
and the lending protocol liquidates their entire position, the app shows a
modal explaining what happened: liquidation price, total BTC liquidated, and
loan amount repaid. The modal links to Activity for the full breakdown.

**Why this priority**: Liquidation is an irreversible loss event. Users must
be notified immediately and clearly, with actionable next steps (review,
deposit again, contact support).

**Independent Test**: Force a vault into a liquidated state via the lending
protocol; assert the modal renders with correct values and the Activity link
opens the matching record.

**Acceptance Scenarios**:

1. **Given** the user's full position is liquidated, **When** the user next
   opens the dApp, **Then** the liquidation modal is displayed with
   liquidation price, BTC amount, and repaid loan amount.
2. **Given** the modal is displayed, **When** the user clicks "View
   Activity", **Then** they are taken to the Activity log filtered to the
   liquidation event.
3. **Given** the user checks "Do not show again", **When** future
   liquidations occur, **Then** the modal is suppressed but the Activity
   log still records the event.

---

### User Story 2 - Notify user of partial liquidation across multiple vaults (Priority: P1)

When only some of the user's vaults are liquidated to repay a loan (because
the user has multiple vaults backing the same position), the app shows a
paginated modal walking through each liquidated vault (`Vault liquidated
1/N`, `2/N`, `...`, `N/N`). Each page shows the vault-specific liquidation
price, BTC liquidated, and portion of loan repaid.

**Why this priority**: Multi-vault positions need per-vault transparency so
the user understands exactly which vaults are gone and which are still
active.

**Independent Test**: Set up a position backed by 3 vaults, trigger
liquidation that consumes 2 of them, confirm the modal paginates 1/2 → 2/2
with correct per-vault values, and the third vault remains active on the
dashboard.

**Acceptance Scenarios**:

1. **Given** N vaults out of M are liquidated, **When** the modal is
   displayed, **Then** it shows N pages (1/N through N/N), each scoped to
   one vault.
2. **Given** the user is on page X/N, **When** they click "Next", **Then**
   the modal advances to page X+1/N.
3. **Given** the user reaches page N/N, **When** they click "Done",
   **Then** the modal closes and the dashboard reflects the post-
   liquidation state.

---

### User Story 3 - Reorder vaults to control liquidation priority (Priority: P2)

For positions backed by multiple vaults, the user can reorder them to
control which vault is liquidated first if the position becomes unhealthy.

**Why this priority**: Gives users agency over which collateral they keep
in worst-case scenarios (e.g. preserve a long-duration vault, sacrifice a
short-duration one). Not on the primary liquidation path but an important
risk-management tool.

**Independent Test**: With multiple vaults backing one loan, change the
order and confirm subsequent liquidations consume vaults in the new order.

**Acceptance Scenarios**:

1. **Given** the user has 3 vaults backing one loan, **When** they open the
   Reorder UI, **Then** vaults are listed in their current liquidation
   order (1st, 2nd, 3rd).
2. **Given** the user changes the order, **When** they save, **Then** the
   new order is persisted and reflected on the dashboard.
3. **Given** a liquidation is triggered after reorder, **When** the
   protocol consumes collateral, **Then** the first vault in the new order
   is liquidated first.

---

### User Story 4 - Liquidation events appear in Activity log (Priority: P2)

Every liquidation produces a structured set of Activity entries so the user
can audit what happened independently of the modal. Entries include
"Partially Liquidated" / "Collateral Liquidated", "Loan Repaid", and (when
applicable) "Fairness Debt Repayment", each with timestamp, amount, and
transaction hash.

**Why this priority**: The modal can be dismissed; the Activity log is the
permanent record and the source of truth users return to.

**Independent Test**: Trigger a liquidation; assert each expected Activity
row exists with the correct amount, timestamp, and transaction hash.

**Acceptance Scenarios**:

1. **Given** a liquidation completes, **When** Activity is opened, **Then**
   one row per protocol event is shown (collateral movement, loan
   repayment, residual settlement).
2. **Given** an Activity row references a transaction, **When** the user
   clicks the hash, **Then** they reach the corresponding block explorer.

### Edge Cases

- A liquidation occurs while the user is mid-action (e.g. depositing into
  another vault).
- The user has "Do not show again" enabled; the next liquidation must still
  be discoverable via Activity and dashboard state.
- All vaults backing a loan are liquidated simultaneously - paginated modal
  reaches N/N where N equals the full vault count.
- Vault reorder is attempted while a liquidation is already in flight.
- "Fairness Debt Repayment" entry is present in some liquidations but not
  others. [NEEDS CLARIFICATION: when does Fairness Debt Repayment apply -
  every liquidation, or only when residual debt remains after collateral
  is exhausted?]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show a liquidation modal the first time the user
  opens the dApp after a liquidation, displaying liquidation price, BTC
  amount liquidated, and loan amount repaid.
- **FR-002**: Modal MUST distinguish full liquidation ("Vault
  liquidated") from partial liquidation ("Vault partially liquidated"),
  using copy that matches the design.
- **FR-003**: When multiple vaults are liquidated for one loan, the modal
  MUST paginate through each vault (`X/N`) with vault-scoped values per
  page.
- **FR-004**: User MUST be able to suppress future liquidation modals via
  a "Do not show again" preference; suppression MUST NOT affect Activity
  log recording.
- **FR-005**: Activity log MUST record one row per protocol event in a
  liquidation: collateral movement, loan repayment, and (when present)
  fairness debt repayment.
- **FR-006**: Each Activity row MUST include timestamp, amount, currency,
  and transaction hash linking to a block explorer.
- **FR-007**: Dashboard MUST render post-liquidation state showing
  remaining vaults, updated health factor, updated total collateral, and
  liquidated vaults marked with their terminal status.
- **FR-008**: User MUST be able to reorder vaults backing a single loan
  position; the resulting order MUST be respected by subsequent
  liquidations.
- **FR-009**: Liquidation modal MUST link to Activity (filtered to the
  triggering liquidation) so the user can audit details beyond the modal.

### Key Entities

- **Liquidation Event**: Source vault, liquidation price, BTC amount,
  repaid loan amount and currency, transaction hash, timestamp,
  partial/full indicator, parent loan position.
- **Loan Position**: Backing vaults (ordered), collateral total, borrowed
  total, health factor, liquidation price.
- **Vault Order**: User-defined priority list of vaults backing one loan,
  governing liquidation sequence.
- **Liquidation Notice Preference**: Per-user flag suppressing the
  liquidation modal (Activity log unaffected).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: User sees the liquidation modal within one poll interval of
  the on-chain liquidation event being indexed.
- **SC-002**: 100% of on-chain liquidation events surface in the Activity
  log with all related rows (collateral, loan, fairness if applicable).
- **SC-003**: Multi-vault liquidations are presented as a single
  paginated modal, not N independent modals.
- **SC-004**: Vault reorder changes take effect on the next liquidation
  without requiring app restart.

## Assumptions

- Liquidation is executed by the lending protocol (Aave integration; see
  `005-aave-collateral`, `006-aave-borrow`); the dApp observes events
  rather than triggering them.
- Liquidation price thresholds and health factors come from the lending
  protocol's oracle, not from internal computation.
- "Fairness Debt Repayment" refers to a protocol mechanism for handling
  residual debt; exact trigger conditions to be confirmed (see Edge
  Cases).
- The vault reorder feature applies only to positions backed by multiple
  vaults; single-vault positions hide the control.
