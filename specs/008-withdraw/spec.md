# Feature Specification: Withdraw Flow (Vault → BTC)

**Feature Branch**: `008-withdraw`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-19, BT-20)

## User Scenarios & Testing *(mandatory)*

### User Story BT-19 - Initiate vault withdrawal (pegout) (Priority: P1)

From the withdraw flow the user selects one or more ACTIVE vaults to redeem
and triggers the pegout process. The vault provider then orchestrates the
on-chain claim and payout broadcast back to the user's Bitcoin address.

**Why this priority**: Required for users to recover their BTC; mirrors the
deposit path.

**Independent Test**: With ACTIVE vaults and signed payouts on file,
initiate withdrawal and verify the expected return amount and the resulting
state transition.

**Acceptance Scenarios**:

1. **Given** the withdraw selection list, **When** it renders, **Then**
   only vaults in ACTIVE state with signed payouts on file are selectable.
2. **Given** selected vaults, **When** the user reviews the request,
   **Then** the expected BTC return amount (net of fees) is displayed
   before confirmation.
3. **Given** the user confirms, **When** the request is submitted, **Then**
   the vault transitions to a pending-pegout state on the Ethereum side.
4. **Given** the state transitions, **When** the dashboard polls, **Then**
   the UI reflects the updated status without a page reload.

---

### User Story BT-20 - Monitor in-flight withdrawal (Priority: P1)

After initiating a withdrawal, the user can see the pegout lifecycle
progressing through its seven states (`ClaimEventReceived` →
`ClaimBroadcast` → `AssertBroadcast` → `PayoutBroadcast` or `Failed`).
Polling continues automatically until a terminal state is reached.

**Why this priority**: Without progress visibility, users cannot
distinguish a healthy pegout from a stalled one.

**Independent Test**: Drive a pegout through each state and verify display
labels, terminal-state stop, and the stalled-detection thresholds.

**Acceptance Scenarios**:

1. **Given** a withdrawing vault, **When** the dashboard polls, **Then**
   the current pegout state is displayed next to the vault.
2. **Given** a terminal state (`PayoutBroadcast` or `Failed`), **When**
   the state is observed, **Then** polling stops automatically.
3. **Given** 10 consecutive polling failures or 20 unknown-status
   responses, **When** the threshold is crossed, **Then** the UI marks the
   withdrawal as effectively stalled and prompts the user to contact
   support.
4. **Given** `PayoutBroadcast` confirms, **When** state refreshes, **Then**
   the vault status updates to REDEEMED and the BTC TXID is shown.

### Edge Cases

- A vault was ACTIVE at selection time but is no longer ACTIVE at submit.
- The pegout TXID is provided but the BTC node has not yet seen it.
- The indexer returns an unknown status code repeatedly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Only ACTIVE vaults with signed payouts MUST be selectable.
- **FR-002**: Expected return MUST be computed net of fees and shown
  before confirmation.
- **FR-003**: Polling MUST stop on terminal states.
- **FR-004**: System MUST mark a withdrawal as stalled after 10 consecutive
  polling failures or 20 unknown-status responses, and prompt the user to
  contact support.

### Key Entities

- **Pegout Session**: Selected vaults, expected BTC return, current
  pegout state, polling counters, BTC TXID (when available).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Healthy pegouts always end on `PayoutBroadcast` and surface
  a BTC TXID.
- **SC-002**: Stalled pegouts surface the support prompt within the
  documented thresholds.

## Assumptions

- The vault provider broadcasts payouts in a timely manner once the on-
  chain claim is confirmed.
- The indexer or RPC provides distinguishable status codes for each
  pegout state.
