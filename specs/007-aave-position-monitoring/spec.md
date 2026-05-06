# Feature Specification: Aave - Position Monitoring

**Feature Branch**: `007-aave-position-monitoring`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-17, BT-18)

## User Scenarios & Testing *(mandatory)*

### User Story BT-17 - Real-time health factor warnings (Priority: P1)

A persistent banner appears when the health factor approaches or breaches
the liquidation threshold (1.25). The banner severity (info / warning /
critical) changes with the calculated risk level and tells the user what
action to take.

**Why this priority**: Direct safety surface; reduces avoidable
liquidations.

**Independent Test**: Drive the health factor across each band and verify
banner presence, severity, and message content.

**Acceptance Scenarios**:

1. **Given** the user's health factor is above 2.0 with no risk, **When**
   the page renders, **Then** the banner is absent.
2. **Given** the health factor is between 1.25 and 2.0, **When** the page
   renders, **Then** a warning banner appears.
3. **Given** the health factor is at or below 1.25, **When** the page
   renders, **Then** a critical banner appears.
4. **Given** any banner is shown, **When** it renders, **Then** the
   message includes the current health factor value and a suggested
   remediation.

---

### User Story BT-18 - Cascading liquidation risk simulation (Priority: P2)

When multiple vaults are used as collateral, the position notification
system simulates the sequential seizure of vaults to predict whether a
single liquidation event could cascade and consume additional collateral.
This is surfaced in the notification banner.

**Why this priority**: Incremental safety insight; limited to multi-vault
users.

**Independent Test**: Configure ordered multi-vault scenarios that trigger
a cascade and verify the banner identifies the count of at-risk vaults.

**Acceptance Scenarios**:

1. **Given** an ordered list of vaults and current debt at the current
   price, **When** simulation runs, **Then** it iterates over the user's
   ordered vault list.
2. **Given** seizing one vault still leaves health factor below 1.25,
   **When** the simulation finishes, **Then** the cascade warning is
   shown.
3. **Given** a cascade is predicted, **When** the warning renders, **Then**
   it identifies how many vaults are at risk, not just that risk exists.
4. **Given** collateral value, debt, or vault order changes, **When** state
   refreshes, **Then** the simulation result updates.

### Edge Cases

- A price oracle update mid-simulation flips the cascade outcome.
- A vault transitions out of ACTIVE during the simulation window.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST classify health factor into three bands and
  surface a banner per band.
- **FR-002**: Banner copy MUST include the current health factor and a
  suggested remediation.
- **FR-003**: Cascade simulation MUST iterate the user's ordered vault list.
- **FR-004**: Cascade warning MUST report the count of at-risk vaults, not
  a binary risk flag.

### Key Entities

- **Risk Banner**: Severity, message, current health factor, suggested
  remediation.
- **Cascade Simulation Result**: At-risk vault count, terminal health
  factor under sequential seizure, snapshot inputs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Banner severity changes within one poll interval of the
  underlying state change.
- **SC-002**: Cascade prediction matches a manual walk-through of the
  ordered vaults for a sampled set of test scenarios.

## Assumptions

- Price oracle latency is consistent enough to make the simulation useful.
- Vault ordering reflects the same order that on-chain liquidation would
  follow.
