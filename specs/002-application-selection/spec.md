# Feature Specification: Application Selection

**Feature Branch**: `002-application-selection`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-23)

## User Scenarios & Testing *(mandatory)*

### User Story BT-23 - Choose a DeFi application for the deposit (Priority: P1)

Before starting a deposit the user lands on an application selector page that
shows available integrations (currently Aave). Selecting an application
determines the vault split logic, collateral adapter, and downstream borrow
and repay flows.

**Why this priority**: This is the entry point to the deposit flow; without
selection no deposit can begin.

**Independent Test**: Visit the entry route, see the available applications,
select one, observe the deposit form pre-scoped to that application.

**Acceptance Scenarios**:

1. **Given** a user enters the dApp, **When** they reach the deposit entry
   point, **Then** the application selector is the first page shown.
2. **Given** the selector page is rendered, **When** an application card
   loads, **Then** the card shows the application's name, a brief
   description, and its supported assets.
3. **Given** the user selects an available application, **When** the
   selection is confirmed, **Then** they are routed to the deposit form
   pre-scoped to that application.
4. **Given** an application is unavailable (e.g. at capacity), **When** the
   selector renders, **Then** the application card is shown as disabled,
   not hidden.

### Edge Cases

- All applications are at capacity simultaneously.
- An application is removed from the registry while the user is on the
  selector page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present an application selector as the entry point
  to the deposit flow.
- **FR-002**: Each application card MUST show name, brief description, and
  supported assets.
- **FR-003**: Selecting an available application MUST route the user to the
  deposit form pre-scoped to that application's vault split logic and
  adapter.
- **FR-004**: Unavailable applications MUST remain visible but be marked
  disabled, with the reason surfaced.

### Key Entities

- **Application**: Identifier, display name, description, supported assets,
  availability state, downstream adapter reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of registered applications appear on the selector without
  code changes.
- **SC-002**: Disabled applications are visually distinguishable from
  available ones in usability tests.

## Assumptions

- Aave is the only supported integration today; the selector is built to
  accept additional applications without restructuring.
