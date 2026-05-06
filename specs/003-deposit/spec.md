# Feature Specification: Deposit Flow (BTC → Vault)

**Feature Branch**: `003-deposit`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-04 through BT-10)

## User Scenarios & Testing *(mandatory)*

### User Story BT-04 - Enter deposit amount and select vault provider (Priority: P1)

From the deposit page the user types a BTC amount, selects a vault provider
from the available registry, and sees real-time validation (minimum amount,
remaining capacity, UTXO availability) before proceeding to the signing
steps.

**Why this priority**: First step of the deposit pipeline; gates every
subsequent signing step.

**Independent Test**: Submit boundary values to the form, verify validation
behaviour and that the provider list comes from the on-chain registry.

**Acceptance Scenarios**:

1. **Given** a user enters an amount below the protocol minimum or above
   remaining vault capacity, **When** validation runs, **Then** the form
   rejects the input.
2. **Given** the deposit form loads, **When** the provider list renders,
   **Then** it is populated from the on-chain registry, not hardcoded.
3. **Given** a valid amount is entered, **When** the form recalculates,
   **Then** fee estimates are shown before the user commits.
4. **Given** any validation error is active, **When** the user views the
   form, **Then** the Continue action is disabled.

---

### User Story BT-05 - Sign proof-of-possession over BTC public key (Priority: P1)

As the first step of the deposit signing ceremony, the user signs a BIP-322
message with their connected Bitcoin wallet. This binds the Bitcoin public
key to the deposit session and is required by the protocol before vault
registration.

**Why this priority**: Without PoP the protocol rejects the deposit; required
before any on-chain registration.

**Independent Test**: Drive the wallet through a successful BIP-322 signing
and through a rejection path; assert flow advances or returns accordingly.

**Acceptance Scenarios**:

1. **Given** the user reaches the PoP step, **When** the modal renders,
   **Then** it presents a human-readable explanation of what is being signed.
2. **Given** the user confirms the signing request, **When** the app calls
   the wallet, **Then** it invokes the wallet's BIP-322 signing method, not
   a generic message-sign fallback.
3. **Given** the wallet rejects or times out, **When** the rejection is
   handled, **Then** the user is returned to the previous step with an
   actionable error.
4. **Given** a valid signature is returned, **When** verification succeeds,
   **Then** the flow advances to vault registration automatically.

---

### User Story BT-06 - Register peg-in on Ethereum (Priority: P1)

After proof-of-possession, the app submits an Ethereum transaction to the
BTCVaultRegistry contract to register one or more vaults atomically. For
multi-vault (Aave split) deposits this is a single batch registration call.
The user signs via their connected Ethereum wallet.

**Why this priority**: Anchors the deposit on Ethereum and is required before
the BTC broadcast step.

**Independent Test**: Submit a single-vault and a multi-vault registration;
verify both go through one Ethereum transaction.

**Acceptance Scenarios**:

1. **Given** a deposit batch contains one or more vaults, **When**
   registration is submitted, **Then** a single Ethereum transaction
   registers all of them.
2. **Given** no valid PoP exists, **When** registration is attempted,
   **Then** the transaction is not submitted.
3. **Given** the registration transaction is submitted, **When** the network
   responds, **Then** on-chain confirmation is awaited before the flow
   advances.
4. **Given** the transaction reverts, **When** the failure is observed,
   **Then** the user sees the revert reason and can retry.

---

### User Story BT-07 - Broadcast pre-peg-in transaction to Bitcoin (Priority: P1)

The user signs the Pre-PegIn PSBT with their Bitcoin wallet and the app
broadcasts it to the Bitcoin network. This funds the HTLC output(s) that
lock the user's BTC. UTXOs are selected automatically by the SDK; the user
only approves the signing request.

**Why this priority**: This is the irreversible commitment of BTC; the
deposit cannot proceed without it.

**Independent Test**: Drive a full deposit through to broadcast; verify
mempool confirmation and TXID persistence.

**Acceptance Scenarios**:

1. **Given** the prior steps succeeded, **When** broadcast is reached,
   **Then** the PSBT is constructed before the signing request is shown.
2. **Given** UTXOs are being selected, **When** the SDK runs the iterative
   selection, **Then** fee accounting iterates and is not hardcoded.
3. **Given** the transaction is broadcast, **When** the TXID returns,
   **Then** the TXID is persisted in local storage so the flow can be
   resumed across page refresh.
4. **Given** the transaction is in the mempool, **When** the indexer/mempool
   confirms, **Then** the app surfaces a confirmation message.

---

### User Story BT-08 - Sign payout transactions for vault payouts (Priority: P1)

The vault provider sends pre-built payout PSBT(s); the user reviews and signs
each one via their Bitcoin wallet. These pre-authorized payouts define how
BTC will be returned to the user at withdrawal time.

**Why this priority**: Without pre-signed payouts the vault cannot be
redeemed; required before activation.

**Independent Test**: Walk through a deposit until payout signing; assert
displayed amounts come from independent (on-chain or WASM) computation, not
from the provider verbatim.

**Acceptance Scenarios**:

1. **Given** the vault provider returns payout PSBTs, **When** the modal
   renders, **Then** the payout amounts displayed are derived from on-chain
   or WASM-computed values, not taken verbatim from the vault provider.
2. **Given** multiple payout PSBTs, **When** signing runs, **Then** each
   PSBT is signed individually with the user's Bitcoin wallet.
3. **Given** the user rejects any payout signature, **When** the rejection
   is handled, **Then** the flow pauses and presents a retry option.
4. **Given** all payouts are signed, **When** validation passes, **Then**
   the flow advances to artifact download.

---

### User Story BT-09 - Download vault artifacts (Priority: P2)

After payout signing, the user is offered a download of the vault artifacts
(WOTS keys, hashlock secrets, signed payouts) needed for future recovery.
This is the only point in the flow where these can be exported.

**Why this priority**: Critical for recovery, but skipping it does not block
the activation step.

**Independent Test**: Reach the artifact step, download the file, verify it
is valid JSON containing all recovery-critical fields.

**Acceptance Scenarios**:

1. **Given** payout signing has completed, **When** the next step renders,
   **Then** the download prompt is shown before vault activation.
2. **Given** the user requests the download, **When** the file is
   produced, **Then** it is in a documented JSON format including all
   recovery-critical data.
3. **Given** the user chooses to skip the download, **When** they
   continue, **Then** they receive a warning about irrecoverability.
4. **Given** the user has downloaded or skipped, **When** they continue,
   **Then** the flow proceeds to vault activation in either case.

---

### User Story BT-10 - Activate vault by revealing HTLC secret (Priority: P1)

The final deposit step: the user submits the HTLC hashlock preimage to the
Ethereum BTCVaultRegistry, transitioning the vault from VERIFIED to ACTIVE
and making the BTC collateral available for DeFi use.

**Why this priority**: Final step that unlocks DeFi use of the deposit;
required for any borrow flow.

**Independent Test**: Complete a deposit, run activation, verify hash check
and the resulting ACTIVE state on Ethereum.

**Acceptance Scenarios**:

1. **Given** activation is reached, **When** the secret is read, **Then**
   it is derived from the vault's own seed, not from UI state.
2. **Given** a candidate secret, **When** activation is about to submit,
   **Then** the app verifies `hash(secret) === expectedHash` before
   submitting the transaction.
3. **Given** the activation transaction confirms, **When** state refreshes,
   **Then** the vault status updates to ACTIVE.
4. **Given** the vault is already ACTIVE (resumed session), **When** the
   activation step runs, **Then** it is skipped automatically.

### Edge Cases

- The user refreshes mid-flow between any two steps.
- The vault provider returns mismatched payout amounts.
- A second deposit is initiated while one is in flight.
- The Ethereum registration confirms but the BTC broadcast fails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate amount, capacity, and UTXO availability
  in real time before allowing the user to advance.
- **FR-002**: Provider list MUST come from the on-chain registry.
- **FR-003**: System MUST sign PoP with the wallet's BIP-322 method, not a
  generic fallback.
- **FR-004**: Multi-vault deposits MUST be registered in a single Ethereum
  transaction.
- **FR-005**: System MUST iterate UTXO selection with fee recalculation; no
  hardcoded fee values.
- **FR-006**: System MUST persist broadcast TXIDs to local storage for
  refresh resilience.
- **FR-007**: Payout amounts shown to the user MUST be independently
  derived (on-chain or WASM), never taken verbatim from the vault provider.
- **FR-008**: Vault artifacts MUST be exportable as documented JSON.
- **FR-009**: Activation MUST verify `hash(secret) === expectedHash` before
  submitting the transaction.

### Key Entities

- **Deposit Session**: Vault batch, amount, provider, fee estimate,
  TXIDs, signing-ceremony state.
- **Vault Artifact Bundle**: WOTS keys, hashlock secrets, signed payout
  PSBTs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a single-vault deposit end-to-end without
  external help.
- **SC-002**: 0% mismatch between displayed payout amounts and
  independently-computed values across all sessions.
- **SC-003**: A refreshed deposit session resumes from the last completed
  step without re-broadcasting any transaction.

## Assumptions

- The Vault Provider returns well-formed payout PSBTs that the depositor's
  wallet can sign.
- Mempool confirmation latency is bounded and acceptable for UX (single-block
  expectation).
- The depositor seed material can be regenerated within the active session
  to validate hash preimages.
