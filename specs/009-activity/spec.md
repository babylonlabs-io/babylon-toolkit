# Feature Specification: Activity Log

**Feature Branch**: `009-activity`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-21)

## User Scenarios & Testing *(mandatory)*

### User Story BT-21 - Chronological activity log of vault events (Priority: P2)

The Activity page lists every significant event across the user's vaults -
peg-in creation, confirmation, activation, peg-out initiation and
completion, Aave borrow and repay operations, liquidations, and expirations
- with timestamps and amounts.

**Why this priority**: Auditing surface; not on the primary deposit or
borrow path but essential for transparency.

**Independent Test**: Generate one event of each type and verify all
appear in a single ordered list, sourced from the indexer.

**Acceptance Scenarios**:

1. **Given** the user has events of each type, **When** the Activity
   page renders, **Then** all event types (deposit, withdraw, borrow,
   repay, liquidation, expiration) appear in a single unified list.
2. **Given** a row in the list, **When** it renders, **Then** it shows
   event type, amount, status, and timestamp.
3. **Given** the page loads, **When** events are fetched, **Then** they
   come from the indexer, not reconstructed from local storage alone.
4. **Given** multiple events, **When** the list renders, **Then** the
   ordering is most-recent-first.

### Edge Cases

- A disconnected user visits the activity page (empty state).
- A connected user has no events yet (zero-state).
- The indexer is unreachable or returns partial data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST list deposit, withdraw, borrow, repay,
  liquidation, and expiration events in a single unified list.
- **FR-002**: Each row MUST show event type, amount, status, and
  timestamp.
- **FR-003**: Events MUST be sourced from the indexer; local storage
  alone is not authoritative.
- **FR-004**: Ordering MUST be most-recent-first.
- **FR-005**: System MUST distinguish disconnected vs connected-but-empty
  states with appropriate empty-state copy.

### Key Entities

- **Activity Event**: Type (deposit | withdraw | borrow | repay |
  liquidation | expiration), amount, status, timestamp, source vault or
  loan reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The list reflects new events within one indexer refresh
  interval of their occurrence.
- **SC-002**: Empty-state copy is distinct for disconnected vs no-activity
  cases.

## Assumptions

- The indexer is the system of record for activity events.
- Local storage is used only for transient session resilience, not as a
  primary source.
