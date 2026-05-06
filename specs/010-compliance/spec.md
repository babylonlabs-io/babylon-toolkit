# Feature Specification: Geofencing & Compliance

**Feature Branch**: `010-compliance`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-22)

## User Scenarios & Testing *(mandatory)*

### User Story BT-22 - Block restricted jurisdictions and flagged addresses (Priority: P1)

The app checks the user's geolocation and screens their wallet addresses
against sanctions lists on load. Users in restricted regions or with
flagged addresses are shown a block screen rather than the dApp.

**Why this priority**: Legal/compliance requirement; supersedes feature
access.

**Independent Test**: With a fixture for a restricted region or flagged
address, verify the block screen replaces the dApp and that no
client-side state can bypass the check.

**Acceptance Scenarios**:

1. **Given** the app is loading, **When** geolocation runs, **Then** the
   geolocation check completes before any wallet connection is
   permitted.
2. **Given** a user from a restricted region, **When** the block screen
   renders, **Then** it presents a clear explanation that the service is
   unavailable in their region.
3. **Given** a connected wallet, **When** address screening runs, **Then**
   interaction is blocked if the address is flagged.
4. **Given** geolocation or sanctions results, **When** they are stored,
   **Then** they are not stored in a way the user can tamper with on the
   client side to bypass the check.

### Edge Cases

- The geolocation provider is unreachable.
- The sanctions screening service times out.
- A user connects an address that is flagged after a previously-allowed
  session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST run geolocation before allowing any wallet
  connection.
- **FR-002**: Restricted users MUST see a block screen with a clear
  explanation, not a generic error.
- **FR-003**: System MUST screen wallet addresses against sanctions
  lists after connection and block interaction on a flag.
- **FR-004**: Compliance check results MUST not be stored client-side in
  a way that can be tampered with to bypass the check.
- **FR-005**: System MUST fail closed if any compliance check service is
  unreachable.

### Key Entities

- **Compliance Result**: Geolocation outcome, sanctions outcome, source
  (region or address), tamper-resistant identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0% of restricted-region or flagged-address sessions reach
  the dApp.
- **SC-002**: Compliance failures fail closed; no fallback grants access.

## Assumptions

- Geolocation and sanctions screening providers are configured and
  reachable in production.
- The compliance policy on which regions and which lists apply is set
  outside this spec.
