# Feature Specification: Wallet Connection

**Feature Branch**: `001-wallet-connection`
**Created**: 2026-05-05
**Status**: Implemented (retroactive)
**Input**: Migrated from `stories.yaml` (BT-01, BT-02, BT-03)

## User Scenarios & Testing *(mandatory)*

### User Story BT-01 - Connect a Bitcoin wallet (Priority: P1)

The user selects one of eight supported Bitcoin wallets (OKX, Unisat, Ledger,
Ledger v2, Keystone, OneKey, AppKit, or injectable `window.bitcoin`
providers) and authorises the connection to obtain a Taproot address and
public key. Without this step no deposit or signing action is possible.

**Why this priority**: Every downstream flow (deposit, payout signing, refund,
withdraw) requires a connected BTC wallet. Without it the dApp is unusable.

**Independent Test**: Open the connect modal, complete authorisation against
each supported provider, observe the connected Taproot address surface.

**Acceptance Scenarios**:

1. **Given** the connect modal is open, **When** it renders, **Then** all
   supported BTC wallets are listed with their icons and names.
2. **Given** the user authorises connection, **When** the wallet returns,
   **Then** the app displays the connected Taproot (P2TR) address.
3. **Given** the user rejects the connection prompt, **When** the wallet
   responds, **Then** the modal closes without error and no address is stored.
4. **Given** a connected BTC wallet, **When** the user disconnects, **Then**
   the address and public key are cleared from app state.

---

### User Story BT-02 - Connect an Ethereum wallet (Priority: P1)

The user connects an Ethereum-compatible wallet through WalletConnect / AppKit
(covering 600+ wallets) to enable on-chain vault registration, WOTS key
submission, vault activation, borrowing, and repayment on Ethereum.

**Why this priority**: All Ethereum protocol steps (registration, activation,
borrow, repay) require this connection.

**Independent Test**: Trigger the ETH connect flow, complete pairing, see the
Ethereum address surface in the UI; verify ETH-side actions become available.

**Acceptance Scenarios**:

1. **Given** the user starts the Ethereum connect flow, **When** the modal
   opens, **Then** the AppKit modal lists available Ethereum wallets.
2. **Given** the user authorises connection, **When** the wallet returns,
   **Then** the app displays the connected Ethereum address.
3. **Given** no Ethereum wallet is connected, **When** the user attempts an
   Ethereum transaction, **Then** the action is blocked.
4. **Given** both BTC and ETH wallets are connected, **When** the user
   disconnects the Ethereum wallet, **Then** only the Ethereum address is
   removed; the BTC wallet remains connected.

---

### User Story BT-03 - Connect a Babylon chain wallet (Priority: P2)

The user connects a Babylon (BBN / Cosmos) wallet - Keplr, Leap, OKX, or an
injectable provider - to satisfy any Babylon-chain protocol steps in the
deposit lifecycle.

**Why this priority**: Required for Babylon-chain protocol steps but does not
gate the BTC ↔ ETH path; lower priority than BT-01/BT-02.

**Independent Test**: Open the Babylon wallet connect flow with at least
Keplr, Leap, and OKX, complete authorisation, see the Babylon address.

**Acceptance Scenarios**:

1. **Given** the Babylon connect modal is open, **When** it renders, **Then**
   the wallet list shows at least Keplr, Leap, and OKX.
2. **Given** the user authorises a Babylon wallet, **When** authorisation
   completes, **Then** the Babylon address is displayed in the UI.
3. **Given** the connected Babylon wallet is on a chain that does not match
   the expected Babylon chain, **When** the user attempts to proceed,
   **Then** the app surfaces a chain-mismatch error.

### Edge Cases

- The user closes the wallet connection modal mid-authorisation.
- The injected wallet provider is present but returns an empty address list.
- The user has multiple injected providers (e.g. OKX and Unisat) on the same
  page.
- A previously connected wallet is no longer available on app reload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST list all eight supported Bitcoin wallets in the
  connect modal with each wallet's icon and name.
- **FR-002**: System MUST obtain a Taproot (P2TR) address and public key from
  the connected Bitcoin wallet before any deposit or signing action is
  permitted.
- **FR-003**: System MUST clear the BTC address and public key from app
  state when the user disconnects.
- **FR-004**: System MUST present the AppKit modal (or equivalent) for
  Ethereum wallet selection, supporting WalletConnect.
- **FR-005**: System MUST block any Ethereum transaction submission when no
  Ethereum wallet is connected.
- **FR-006**: System MUST list at least Keplr, Leap, and OKX as Babylon
  wallet options.
- **FR-007**: System MUST surface a chain-mismatch error when the connected
  Babylon wallet is on the wrong chain.
- **FR-008**: System MUST handle user rejection of any connection prompt
  gracefully - modal closes, no error, no partial state stored.

### Key Entities

- **Connected Wallet**: Wallet kind (BTC | ETH | BBN), provider identifier,
  primary address, public key (where applicable), connection state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can complete BTC + ETH wallet connection in under
  60 seconds on the first attempt.
- **SC-002**: 100% of supported BTC wallets are reachable from the connect
  modal without code changes.
- **SC-003**: Disconnecting any one wallet never leaves another wallet's
  state stale (verified by automated state-clear tests).

## Assumptions

- Users have a supported wallet extension installed or a mobile wallet
  reachable via WalletConnect.
- The injected `window.bitcoin` providers conform to the documented BTC
  provider interface.
- Babylon-chain steps may be invoked optionally; not every deposit requires
  a connected Babylon wallet.
