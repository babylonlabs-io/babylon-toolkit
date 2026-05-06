# Feature Specification: Vault Lifecycle

**Feature Branch**: `004-vault-lifecycle`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-11, BT-12)

## User Scenarios & Testing *(mandatory)*

### User Story BT-11 - View status of all vaults (Priority: P1)

The dashboard shows every vault the user owns, its lifecycle status (Pending,
Signing Required, Awaiting Key, Processing, Ready to Activate, Available, In
Use, Redeemed, Liquidated, Expired, Refunding, Failed, Invalid), and the BTC
value locked.

**Why this priority**: The dashboard is the operational surface for all
post-deposit actions; users need accurate status visibility.

**Independent Test**: Seed accounts in each lifecycle state and assert the
correct label, BTC amount, and polling behaviour.

**Acceptance Scenarios**:

1. **Given** the user is viewing the dashboard, **When** statuses are
   computed, **Then** each status is derived from on-chain contract state
   combined with off-chain tracking state.
2. **Given** the 14 distinct lifecycle states, **When** labels are mapped,
   **Then** each display label maps to a distinct combination of contract
   and off-chain states.
3. **Given** a vault transitions, **When** polling runs, **Then** the
   status refreshes automatically without a page reload.
4. **Given** vaults in terminal states (Redeemed, Liquidated, Invalid),
   **When** the dashboard renders, **Then** they remain visible but are
   clearly marked as inactive.

---

### User Story BT-12 - Refund expired pre-peg-in HTLC (Priority: P2)

If a deposit's HTLC times out before activation (e.g. the user abandoned the
flow), the user can claim a refund. The app builds and broadcasts a refund
transaction to the Bitcoin network that returns the locked BTC minus fees.

**Why this priority**: Recovery path for abandoned deposits; not on the
primary deposit path but essential for user trust.

**Independent Test**: Force a vault into expired state; trigger the refund
flow; observe PSBT signing and Bitcoin broadcast.

**Acceptance Scenarios**:

1. **Given** the vault's HTLC timeout has not elapsed, **When** the
   dashboard renders, **Then** the Refund option is not presented.
2. **Given** the timeout has elapsed, **When** the user opens the refund
   flow, **Then** the refund fee is estimated before the user confirms.
3. **Given** the refund is confirmed, **When** signing runs, **Then** the
   refund PSBT is signed by the user's Bitcoin wallet before broadcast.
4. **Given** the refund is broadcast, **When** the TXID returns, **Then**
   the vault status transitions to Refunding and the TXID is recorded.

### Edge Cases

- A vault transitions between non-terminal and terminal state mid-poll.
- The HTLC timeout passes while the user is on the dashboard.
- A refund broadcast fails after the PSBT is signed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all 14 lifecycle states using distinct
  labels.
- **FR-002**: Vault status MUST be derived from on-chain + off-chain state,
  not a single source.
- **FR-003**: Polling MUST refresh status without a page reload, and stop
  for terminal states.
- **FR-004**: Refund option MUST only appear after the HTLC timeout has
  elapsed.
- **FR-005**: Refund flow MUST present a fee estimate before user
  confirmation.

### Key Entities

- **Vault**: Identifier, BTC amount, lifecycle state, contract state,
  off-chain tracking state, terminal flag.
- **Refund Session**: Source vault, fee estimate, refund PSBT, broadcast
  TXID.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dashboard reflects state changes within one poll interval of
  the underlying chain update.
- **SC-002**: 100% of expired pre-peg-in HTLCs surface a working refund
  option.

## Assumptions

- A reliable indexer or RPC provides timely state updates for vault
  computation.
- HTLC timeouts and refund construction are documented in the SDK.
