# Peg-In State Management Documentation

## Overview

This document describes the centralized state management system for peg-in flows, using a state machine pattern to ensure consistency across the application.

## State Machine Location

**Primary File**: `routes/vault/src/models/peginStateMachine.ts`

This file is the **single source of truth** for all state-related logic.

## State Sources

The peg-in flow involves multiple state sources that must be coordinated:

### 1. Contract Status (On-Chain, Source of Truth)

```typescript
enum ContractStatus {
  PENDING = 0,      // Request submitted, waiting for ACKs
  VERIFIED = 1,     // ACKs collected, ready for inclusion proof
  AVAILABLE = 2,    // vBTC minted, available for positions
  IN_POSITION = 3,  // Vault used as collateral in lending position
  EXPIRED = 4,      // Vault redeemed or liquidated (terminal)
}
```

- **Source**: Smart contract events
- **Authority**: Blockchain (immutable)
- **Query**: Read from contract via indexer API

### 2. Local Storage Status (Off-Chain, Temporary)

```typescript
enum LocalStorageStatus {
  PENDING = 'pending',              // Initial state
  PAYOUT_SIGNED = 'payout_signed',  // User signed, waiting for on-chain ACK
  CONFIRMING = 'confirming',        // BTC broadcasted, waiting for confirmations
  CONFIRMED = 'confirmed',          // Should be removed (blockchain is truth)
}
```

- **Source**: Browser localStorage
- **Authority**: Local browser only (temporary)
- **Purpose**: Bridge time gaps between user actions and blockchain updates
- **Cleanup**: Removed when contract status progresses

### 3. Backend Daemon Status (Off-Chain, Internal)

```typescript
enum DaemonStatus {
  PENDING_CHALLENGER_SIGNATURES = 'PendingChallengerSignatures',
  PENDING_DEPOSITOR_SIGNATURES = 'PendingDepositorSignatures',
  ACKNOWLEDGED = 'Acknowledged',
  ACTIVATED = 'Activated',
  CLAIM_POSTED = 'ClaimPosted',
  CHALLENGE_PERIOD = 'ChallengePeriod',
  PEGGED_OUT = 'PeggedOut',
}
```

- **Source**: Vault provider daemon database
- **Authority**: Vault provider internal state
- **Not directly used by frontend** (informational only)

## Complete State Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STATE 1: PENDING (Contract: 0)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Sub-State A: Waiting for Transactions                              │
│   Contract: 0                                                       │
│   Local: pending (or undefined)                                    │
│   Transactions Ready: false                                        │
│   ────────────────────────────────────────────────────             │
│   Display: "Pending"                                               │
│   Action: NONE (no user action available)                         │
│   Message: "Waiting for vault provider to prepare..."             │
│                                                                     │
│ ↓ (Vault provider prepares claim + payout transactions)            │
│                                                                     │
│ Sub-State B: Ready to Sign                                         │
│   Contract: 0                                                       │
│   Local: pending                                                    │
│   Transactions Ready: true                                         │
│   ────────────────────────────────────────────────────             │
│   Display: "Ready to Sign"                                         │
│   Action: SIGN_PAYOUT_TRANSACTIONS                                │
│   Button: "Sign Payout Transactions"                              │
│                                                                     │
│ ↓ (User clicks button, signs payout transactions)                  │
│                                                                     │
│ Sub-State C: Waiting for Acknowledgement                           │
│   Contract: 0 (not updated yet)                                    │
│   Local: payout_signed ✓                                           │
│   ────────────────────────────────────────────────────             │
│   Display: "Processing"                                            │
│   Action: NONE (no user action available)                         │
│   Message: "Payout signatures submitted. Waiting for vault         │
│            provider to collect acknowledgements..."                │
│   Button: Hidden (prevents duplicate submission)                  │
│                                                                     │
│ ↓ (VP collects ACKs from liquidators, submits to contract)         │
│   (30-60 seconds background process)                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 2: VERIFIED (Contract: 1)                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Sub-State A: Ready to Broadcast                                    │
│   Contract: 1 ✓                                                    │
│   Local: removed (or payout_signed → cleaned up)                   │
│   ────────────────────────────────────────────────────             │
│   Display: "Verified"                                              │
│   Action: SIGN_AND_BROADCAST_TO_BITCOIN                           │
│   Button: "Sign & Broadcast to Bitcoin"                           │
│                                                                     │
│ ↓ (User clicks button, signs + broadcasts BTC transaction)         │
│                                                                     │
│ Sub-State B: Waiting for Confirmations                             │
│   Contract: 1 (not updated yet)                                    │
│   Local: confirming ✓                                              │
│   ────────────────────────────────────────────────────             │
│   Display: "Confirming"                                            │
│   Action: NONE (no user action available)                         │
│   Message: "Bitcoin transaction broadcasted. Waiting for           │
│            network confirmations..."                               │
│   Button: Hidden                                                   │
│                                                                     │
│ ↓ (6+ Bitcoin confirmations, VP submits inclusion proof)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 3: AVAILABLE (Contract: 2)                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Contract: 2 ✓                                                    │
│   Local: removed (blockchain is source of truth)                   │
│   ────────────────────────────────────────────────────────         │
│   Display: "Available"                                             │
│   Action: REDEEM                                                   │
│   Button: "Redeem" (peg-out)                                       │
│   Note: User can also create lending position                      │
│                                                                     │
│ ↓ (User creates lending position with vault as collateral)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 4: IN_POSITION (Contract: 3)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Contract: 3 ✓                                                    │
│   Local: removed (blockchain is source of truth)                   │
│   ────────────────────────────────────────────────────             │
│   Display: "In Position"                                           │
│   Action: NONE (vault locked as collateral)                        │
│   Message: "Vault is currently being used as collateral..."        │
│                                                                     │
│ ↓ (User repays loan, withdraws collateral, or gets liquidated)     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STATE 5: EXPIRED (Contract: 4)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Contract: 4 ✓                                                    │
│   Local: removed (blockchain is source of truth)                   │
│   ────────────────────────────────────────────────────             │
│   Display: "Expired"                                               │
│   Action: NONE (terminal state)                                    │
│   Message: "Vault has been redeemed or liquidated"                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Usage in Components

### 1. Get Current State

```typescript
import { getPeginState, ContractStatus, LocalStorageStatus } from '@/models/peginStateMachine';

// In component
const contractStatus = activity.contractStatus as ContractStatus;
const localStatus = pendingPegin?.status as LocalStorageStatus | undefined;
const transactionsReady = txReady;

const peginState = getPeginState(contractStatus, localStatus, transactionsReady);
```

### 2. Display State

```typescript
// Status badge
<StatusBadge
  status={peginState.displayVariant}
  label={peginState.displayLabel}
/>

// Warning message
{peginState.message && <Warning>{peginState.message}</Warning>}
```

### 3. Determine Actions

```typescript
import { getPrimaryActionButton, PeginAction } from '@/models/peginStateMachine';

const actionConfig = getPrimaryActionButton(peginState);

if (actionConfig?.action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
  // Show "Sign Payout Transactions" button
  <Button onClick={handleSign}>{actionConfig.label}</Button>
}
```

### 4. Update State After Actions

```typescript
import { getNextLocalStatus, PeginAction } from '@/models/peginStateMachine';

// After successful action
const nextStatus = getNextLocalStatus(PeginAction.SIGN_PAYOUT_TRANSACTIONS);
if (nextStatus) {
  updatePendingPeginStatus(peginId, nextStatus);
}
```

## Key Principles

### 1. Contract Status is King

- **Always trust the blockchain** for on-chain state
- Contract status can only move forward (0 → 1 → 2 → 3 → 4)
- Never override contract status with localStorage

### 2. localStorage is Temporary

- Only used to **bridge time gaps** between user actions and blockchain updates
- **Must be removed** when contract status catches up
- Never conflicts with contract status (contract always wins)

### 3. State Machine is Single Source of Truth

- **All state logic** should go through `peginStateMachine.ts`
- **No ad-hoc state checks** scattered in components
- Makes refactoring and debugging easier

### 4. Sub-States Within Contract States

- Contract state 0 has **3 sub-states** based on localStorage
- This prevents duplicate user actions during async processes
- Example: After signing payouts, hide button until on-chain ACK

### 5. Actions vs Waiting States

- **`availableActions`** only contains **ACTUAL user actions** (button clicks)
- **User Actions**: `SIGN_PAYOUT_TRANSACTIONS`, `SIGN_AND_BROADCAST_TO_BITCOIN`, `REDEEM`
- **`NONE`** means no action available - user must wait for background process
- Waiting states show informational messages but no actionable buttons

## Benefits of This Approach

✅ **Centralized**: All state logic in one file
✅ **Type-Safe**: Enums prevent typos and invalid states
✅ **Testable**: Pure functions, easy to unit test
✅ **Maintainable**: Change state logic in one place
✅ **Documented**: State flow is explicitly defined
✅ **Predictable**: State machine prevents invalid transitions
✅ **Debuggable**: Easy to trace state changes

## Adding New States

To add a new state to the system:

1. **Update enum** in `peginStateMachine.ts`
2. **Update `getPeginState()`** function with new logic
3. **Update `getPrimaryActionButton()`** if new action needed
4. **Update `getNextLocalStatus()`** for state transitions
5. **Update this documentation** with new flow
6. **Add tests** for new state behavior

## Common Pitfalls to Avoid

❌ **Don't** check `activity.status.label === 'Verified'` directly
✅ **Do** use `contractStatus === ContractStatus.VERIFIED`

❌ **Don't** manually set `status: 'payout_signed'`
✅ **Do** use `getNextLocalStatus(PeginAction.SIGN_PAYOUT_TRANSACTIONS)`

❌ **Don't** add state logic scattered in components
✅ **Do** add logic to state machine and use it everywhere

❌ **Don't** forget to handle sub-states
✅ **Do** consider localStorage status for accurate state

## Testing

```typescript
import { getPeginState, ContractStatus, LocalStorageStatus } from './peginStateMachine';

describe('Peg-In State Machine', () => {
  it('should show sign button when transactions ready', () => {
    const state = getPeginState(
      ContractStatus.PENDING,
      undefined,
      true // transactions ready
    );

    expect(state.displayLabel).toBe('Ready to Sign');
    expect(state.availableActions).toContain(PeginAction.SIGN_PAYOUT_TRANSACTIONS);
  });

  it('should hide sign button after submission', () => {
    const state = getPeginState(
      ContractStatus.PENDING,
      LocalStorageStatus.PAYOUT_SIGNED,
      true
    );

    expect(state.displayLabel).toBe('Processing');
    expect(state.availableActions).toContain(PeginAction.NONE);
    expect(state.message).toContain('Waiting for vault provider');
  });
});
```

## Future Enhancements

- [ ] Add state history tracking for debugging
- [ ] Add state transition logging
- [ ] Add analytics events for state changes
- [ ] Add timeout handling for stuck states
- [ ] Add retry logic for failed transitions
