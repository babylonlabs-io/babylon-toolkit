# Option 3: Hooks-First Architecture (React-Centric)

## Overview

A React-native approach that embraces hooks as the primary abstraction for business logic. This architecture uses custom hooks to encapsulate all business logic, with services as pure utility functions. Components remain purely presentational.

## Architecture Structure

```
┌─────────────────────────────────────────────┐
│         Presentation Components              │
│  (Pure UI, no business logic)                │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│           Business Hooks Layer               │
│  (All business logic, orchestration,         │
│   state management, side effects)            │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│           Service Functions                  │
│  (Pure functions for complex operations,     │
│   no state, no side effects)                 │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│              API Layer                       │
│  (Data fetching, external services)          │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── components/               # Pure presentational components
│   ├── deposit/
│   │   ├── DepositForm.tsx
│   │   ├── DepositCard.tsx
│   │   └── DepositStatus.tsx
│   ├── position/
│   │   ├── PositionList.tsx
│   │   └── PositionCard.tsx
│   └── shared/
│       ├── Button.tsx
│       └── Modal.tsx
│
├── hooks/                    # Business logic hooks
│   ├── deposit/
│   │   ├── useDepositFlow.ts       # Main deposit orchestration
│   │   ├── useDepositForm.ts       # Form logic and validation
│   │   ├── useDepositStatus.ts     # Status tracking
│   │   └── useDepositSignature.ts  # Signature handling
│   │
│   ├── position/
│   │   ├── usePositions.ts         # Position management
│   │   ├── usePositionActions.ts   # Position actions
│   │   └── useLiquidation.ts       # Liquidation logic
│   │
│   ├── market/
│   │   ├── useMarkets.ts           # Market data
│   │   └── useMarketStats.ts       # Market statistics
│   │
│   └── shared/
│       ├── useWallet.ts            # Wallet connection
│       ├── useTransaction.ts       # Transaction handling
│       └── usePolling.ts           # Generic polling
│
├── services/                 # Pure service functions
│   ├── deposit/
│   │   ├── calculateFees.ts
│   │   ├── validateDeposit.ts
│   │   └── buildTransaction.ts
│   ├── position/
│   │   ├── calculateLTV.ts
│   │   └── checkLiquidation.ts
│   └── shared/
│       └── formatters.ts
│
├── api/                      # API and external services
│   ├── queries/              # React Query queries
│   │   ├── useVaultsQuery.ts
│   │   └── useMarketsQuery.ts
│   ├── mutations/            # React Query mutations
│   │   ├── useDepositMutation.ts
│   │   └── useRedeemMutation.ts
│   └── clients/              # API clients
│       ├── vaultApi.ts
│       └── ethClient.ts
│
├── types/                    # TypeScript types
│   ├── deposit.ts
│   ├── position.ts
│   └── market.ts
│
└── utils/                    # Utility functions
    ├── btc/
    ├── eth/
    └── formatters/
```

## Implementation Example

### Business Hook (Main Logic)
```typescript
// hooks/deposit/useDepositFlow.ts
export function useDepositFlow() {
  // State management
  const [step, setStep] = useState<DepositStep>('form');
  const [depositData, setDepositData] = useState<DepositData | null>(null);
  
  // API hooks
  const { mutate: createDeposit, isPending } = useDepositMutation();
  const { data: utxos } = useUTXOsQuery();
  
  // Wallet hooks
  const { btcWallet, ethWallet } = useWallet();
  
  // Service functions (pure)
  const calculateFees = useCallback((amount: bigint) => {
    return depositService.calculateFees(amount, utxos);
  }, [utxos]);
  
  // Business logic orchestration
  const submitDeposit = useCallback(async (formData: DepositFormData) => {
    try {
      setStep('signing');
      
      // Step 1: Validate
      const validation = depositService.validateDeposit(formData);
      if (!validation.valid) throw new Error(validation.error);
      
      // Step 2: Create proof
      const proof = await btcWallet.signMessage(validation.message);
      
      // Step 3: Build transaction
      const tx = depositService.buildTransaction({
        ...formData,
        proof,
        utxos
      });
      
      // Step 4: Submit
      setStep('submitting');
      await createDeposit(tx);
      
      setStep('success');
    } catch (error) {
      setStep('error');
      throw error;
    }
  }, [btcWallet, createDeposit, utxos]);
  
  return {
    step,
    depositData,
    isPending,
    submitDeposit,
    calculateFees,
    reset: () => {
      setStep('form');
      setDepositData(null);
    }
  };
}
```

### Service Functions (Pure)
```typescript
// services/deposit/depositService.ts
export const depositService = {
  calculateFees(amount: bigint, utxos: UTXO[]): DepositFees {
    // Pure calculation logic
    const btcFee = calculateBtcTransactionFee(utxos.length);
    const ethFee = estimateEthGasFee();
    return {
      btcFee,
      ethFee,
      total: btcFee + ethFee
    };
  },
  
  validateDeposit(data: DepositFormData): ValidationResult {
    // Pure validation logic
    if (data.amount < MIN_DEPOSIT) {
      return { valid: false, error: 'Amount too low' };
    }
    // More validation...
    return { valid: true, message: createSigningMessage(data) };
  },
  
  buildTransaction(params: BuildTxParams): Transaction {
    // Pure transaction building
    return {
      inputs: selectUTXOs(params.utxos, params.amount),
      outputs: createOutputs(params),
      signature: params.proof
    };
  }
};
```

### API Layer (React Query)
```typescript
// api/mutations/useDepositMutation.ts
export function useDepositMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (transaction: Transaction) => {
      const client = new VaultApiClient();
      return client.submitDeposit(transaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
    }
  });
}
```

### Pure Presentation Component
```typescript
// components/deposit/DepositForm.tsx
interface DepositFormProps {
  onSubmit: (data: DepositFormData) => void;
  isPending: boolean;
  fees: DepositFees | null;
}

export function DepositForm({ onSubmit, isPending, fees }: DepositFormProps) {
  // Only UI state and handlers
  const [amount, setAmount] = useState('');
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ amount: parseAmount(amount) });
    }}>
      <input 
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={isPending}
      />
      {fees && <FeeDisplay fees={fees} />}
      <button type="submit" disabled={isPending}>
        Deposit
      </button>
    </form>
  );
}
```

### Container Component (Connects hooks to UI)
```typescript
// containers/DepositContainer.tsx
export function DepositContainer() {
  const depositFlow = useDepositFlow();
  
  return (
    <>
      {depositFlow.step === 'form' && (
        <DepositForm
          onSubmit={depositFlow.submitDeposit}
          isPending={depositFlow.isPending}
          fees={depositFlow.calculateFees()}
        />
      )}
      {depositFlow.step === 'signing' && <SigningModal />}
      {depositFlow.step === 'success' && <SuccessMessage />}
    </>
  );
}
```

## Benefits

✅ **React-native** - Leverages React patterns fully
✅ **Simple mental model** - Hooks contain logic, components are pure UI
✅ **Great DX** - Familiar patterns for React developers [[memory:10537065]]
✅ **Progressive enhancement** - Can migrate incrementally
✅ **Testable** - Hooks and services can be tested separately
✅ **Reusable** - Business logic hooks can be composed

## Drawbacks

❌ **React dependency** - Business logic tied to React
❌ **Hook complexity** - Complex flows can lead to large hooks
❌ **Testing complexity** - Hooks require React testing utilities
❌ **Performance** - Need to be careful with re-renders

## Migration Strategy

### Phase 1: Service Layer (This PR)
- Extract all pure functions to service layer
- Remove side effects from existing services
- Create service functions for calculations and validations

### Phase 2: Business Hooks
- Create orchestration hooks for each flow
- Move business logic from components to hooks
- Standardize hook patterns

### Phase 3: Pure Components
- Refactor components to be purely presentational
- Create container components to connect hooks
- Remove all business logic from components

### Phase 4: API Layer
- Consolidate all React Query usage
- Standardize query/mutation patterns
- Implement proper caching strategies

## Example PR Implementation

For the first PR:

1. Create service layer with pure functions
2. Refactor deposit flow to use new hook pattern
3. Make deposit components purely presentational
4. Keep other features working with minimal changes

This provides immediate value while allowing incremental migration.
