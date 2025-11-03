# Migration Completion Plan

## Overview
Complete the integration of the hooks-first architecture by migrating the real deposit flow implementation to the new structure.

## Current Gaps

### API Differences
The new and old `useDepositFlow` have different APIs:

**OLD (Current)**
```typescript
useDepositFlow({
  amount, btcWalletProvider, depositorEthAddress,
  selectedProviders, vaultProviderBtcPubkey, 
  liquidatorBtcPubkeys, modalOpen, onSuccess
})
Returns: { executeDepositFlow, currentStep, processing, error }
```

**NEW (Not integrated)**
```typescript
useDepositFlow(btcAddress, ethAddress)
Returns: { state, isProcessing, canSubmit, startDeposit, 
          submitDeposit, cancelDeposit, reset, estimatedFees, progress }
```

### Missing Functionality in New Implementation
1. ❌ Real WASM transaction creation
2. ❌ Proof of possession signing
3. ❌ Actual smart contract submission
4. ❌ Payout signature handling
5. ❌ UTXO selection logic
6. ❌ Provider validation

## Migration Steps

### Phase 1: Port Real Logic to Service Layer ✅
Extract pure functions from old implementation:

1. **Create `services/deposit/utxo.ts`**
   - Move UTXO selection logic
   - Move UTXO validation

2. **Create `services/deposit/providers.ts`**
   - Provider validation logic
   - Provider data transformation

3. **Update `services/deposit/calculations.ts`**
   - Add real fee calculation from old code
   - Add UTXO amount calculations

### Phase 2: Update Hooks Layer
Enhance hooks with real functionality:

1. **Update `hooks/deposit/useDepositFlow.ts`**
   - Match the API of the old hook
   - Integrate real WASM calls
   - Add proof of possession
   - Add payout signature handling

2. **Create `hooks/deposit/useDepositWasm.ts`**
   - Encapsulate WASM transaction creation
   - Handle BTC transaction building

3. **Create `hooks/deposit/usePayoutSignature.ts`**
   - Handle payout signature flow
   - Polling for transactions

### Phase 3: Update Component Integration
Switch components to new architecture:

1. **Update `DepositSignModal/index.tsx`**
   ```typescript
   // Change from:
   import { useDepositFlow } from "./hooks/useDepositFlow";
   // To:
   import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";
   ```

2. **Update other deposit components**
   - DepositFormModal
   - DepositReviewModal
   - DepositOverview

### Phase 4: Testing & Validation
1. Test end-to-end deposit flow
2. Verify WASM integration
3. Check smart contract interactions
4. Validate state management

### Phase 5: Cleanup
1. Delete old implementation files:
   - `components/Overview/Deposits/DepositSignModal/hooks/`
   - Duplicate state management
2. Update imports throughout codebase
3. Document migration

## Implementation Priority

### Quick Win (1-2 hours)
Port the most critical functionality first:

1. **Copy real logic to new hooks**
   - Take working code from old `useDepositFlow`
   - Adapt it to new structure
   - Keep same functionality

2. **Make API compatible**
   - Adjust new hook to match old API
   - Ensure drop-in replacement

3. **Switch one component**
   - Start with DepositSignModal
   - Test thoroughly
   - Rollback if issues

### Full Migration (4-6 hours)
Complete architectural transformation:

1. Extract all pure functions to services
2. Refactor all hooks
3. Update all components
4. Remove old code

## Code Examples

### Service Layer Enhancement
```typescript
// services/deposit/wasm.ts
export async function createPeginTransaction(params: {
  depositorPubkey: string;
  vaultProviderPubkey: string;
  liquidatorPubkeys: string[];
  amount: bigint;
  utxos: UTXO[];
}): Promise<{ 
  unsignedTxHex: string;
  txid: string;
}> {
  // Port from old implementation
  return createPegInTransaction({
    depositorBtcPubkey: params.depositorPubkey,
    // ... real WASM call
  });
}
```

### Hook Compatibility Layer
```typescript
// hooks/deposit/useDepositFlow.ts (updated)
export function useDepositFlow(params: OldAPIParams): OldAPIReturn {
  // Internal new architecture
  const validation = useDepositValidation();
  const transaction = useDepositTransaction();
  
  // Adapt to old API
  const executeDepositFlow = async () => {
    // Use new services but return old format
  };
  
  return {
    executeDepositFlow,
    currentStep,
    processing,
    error
  };
}
```

## Risk Mitigation

1. **Feature flag approach**
   ```typescript
   const USE_NEW_ARCHITECTURE = process.env.REACT_APP_NEW_ARCH === 'true';
   
   import { useDepositFlow as useOldFlow } from "./hooks/useDepositFlow";
   import { useDepositFlow as useNewFlow } from "@/hooks/deposit/useDepositFlow";
   
   const useDepositFlow = USE_NEW_ARCHITECTURE ? useNewFlow : useOldFlow;
   ```

2. **Incremental rollout**
   - Test with one component first
   - Monitor for issues
   - Gradually migrate others

3. **Rollback plan**
   - Keep old code in separate branch
   - Quick revert if critical issues
   - Document rollback procedure

## Success Criteria

✅ All deposit functionality works as before
✅ No regression in features
✅ Cleaner code structure
✅ Better testability
✅ No duplicate code
✅ Clear separation of concerns

## Timeline

- **Option A: Quick Fix** (2-4 hours)
  - Make new hook API-compatible
  - Port critical logic
  - Switch imports
  - Test

- **Option B: Full Migration** (6-8 hours)
  - Complete service layer
  - Full hook refactor
  - All components updated
  - Comprehensive testing
  - Documentation

## Decision Point

**Recommendation: Start with Option A (Quick Fix)**

1. Lower risk
2. Proves the architecture works
3. Can be done incrementally
4. Easy rollback if needed

Once validated, proceed to Option B for full benefits.

## Next Immediate Steps

1. ✅ Copy real deposit logic to new `useDepositFlow`
2. ✅ Match the API signature
3. ✅ Update one import in DepositSignModal
4. ✅ Test the flow
5. ✅ If successful, continue migration

This approach ensures we complete the migration without breaking existing functionality.
