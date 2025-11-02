# Migration Guide - Hooks-First Architecture

## Overview

This guide explains how to migrate existing features to the new hooks-first architecture. The migration can be done progressively, one feature at a time.

## Migration Steps

### Step 1: Identify Feature Boundaries

Before migrating, identify what constitutes a "feature":
- **Deposit Flow**: Form, validation, transaction creation, status tracking
- **Position Management**: List, create, modify, liquidation checks
- **Market Operations**: Market list, stats, user positions in market

### Step 2: Extract Pure Functions to Service Layer

1. **Identify business logic in components/hooks**
   ```typescript
   // Before (in component):
   const calculateFee = (amount) => {
     const base = amount * 0.001;
     const network = 0.0001;
     return base + network;
   };
   
   // After (in service):
   // services/[feature]/calculations.ts
   export function calculateFee(amount: bigint): bigint {
     // Pure calculation logic
   }
   ```

2. **Categories of service functions**:
   - **Calculations**: Math, fee calculations, conversions
   - **Validations**: Input validation, business rules
   - **Transformers**: Data format conversions

3. **Service function rules**:
   - Must be pure (no side effects)
   - Must be synchronous (no async/await)
   - Must not access React hooks
   - Must not modify input parameters

### Step 3: Create Business Logic Hooks

1. **Main orchestration hook**
   ```typescript
   // hooks/[feature]/use[Feature]Flow.ts
   export function useFeatureFlow() {
     // State management
     // API integration
     // Service function calls
     // Action handlers
   }
   ```

2. **Specialized hooks** (as needed):
   - Form management: `use[Feature]Form.ts`
   - Validation: `use[Feature]Validation.ts`
   - Data fetching: `use[Feature]Query.ts`

3. **Hook composition pattern**:
   ```typescript
   function useMainFeature() {
     const validation = useFeatureValidation();
     const transaction = useFeatureTransaction();
     
     // Compose behaviors
   }
   ```

### Step 4: Refactor Components to be Presentational

1. **Remove business logic**:
   ```typescript
   // Before:
   function DepositForm() {
     const [amount, setAmount] = useState('');
     
     const validateAmount = () => { /* logic */ };
     const calculateFees = () => { /* logic */ };
     const submit = async () => { /* logic */ };
     
     return <form>...</form>;
   }
   
   // After:
   function DepositForm({ onSubmit, fees, isValid }) {
     const [amount, setAmount] = useState('');
     
     return (
       <form onSubmit={(e) => {
         e.preventDefault();
         onSubmit(amount);
       }}>
         {/* Pure UI */}
       </form>
     );
   }
   ```

2. **Create container components**:
   ```typescript
   function DepositContainer() {
     const depositFlow = useDepositFlow();
     
     return (
       <DepositForm
         onSubmit={depositFlow.submit}
         fees={depositFlow.fees}
         isValid={depositFlow.canSubmit}
       />
     );
   }
   ```

## Migration Example: Position Feature

### Before Migration

```typescript
// components/Position/PositionList.tsx
function PositionList() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchPositions().then(data => {
      // Complex transformation logic
      const transformed = data.map(p => ({
        ...p,
        ltv: (p.debt / p.collateral) * 100,
        health: calculateHealth(p),
        // More calculations
      }));
      setPositions(transformed);
      setLoading(false);
    });
  }, []);
  
  const liquidate = async (id) => {
    // Liquidation logic
  };
  
  return (
    <div>
      {/* UI rendering with embedded logic */}
    </div>
  );
}
```

### After Migration

```typescript
// services/position/calculations.ts
export function calculateLTV(debt: bigint, collateral: bigint): number {
  if (collateral === 0n) return 0;
  return Number((debt * 10000n) / collateral) / 100;
}

export function calculateHealth(position: Position): HealthStatus {
  // Pure calculation
}

// hooks/position/usePositions.ts
export function usePositions() {
  const { data, isLoading } = usePositionsQuery();
  
  const positions = useMemo(() => {
    if (!data) return [];
    
    return data.map(p => ({
      ...p,
      ltv: positionService.calculateLTV(p.debt, p.collateral),
      health: positionService.calculateHealth(p)
    }));
  }, [data]);
  
  const liquidate = useCallback(async (id: string) => {
    // Orchestration logic using services
  }, []);
  
  return { positions, isLoading, liquidate };
}

// components/Position/PositionList.tsx
function PositionList({ positions, onLiquidate }) {
  return (
    <div>
      {positions.map(position => (
        <PositionCard
          key={position.id}
          position={position}
          onLiquidate={() => onLiquidate(position.id)}
        />
      ))}
    </div>
  );
}

// components/Position/PositionContainer.tsx
function PositionContainer() {
  const { positions, isLoading, liquidate } = usePositions();
  
  if (isLoading) return <Loading />;
  
  return (
    <PositionList
      positions={positions}
      onLiquidate={liquidate}
    />
  );
}
```

## Common Patterns

### Pattern 1: Form with Validation

```typescript
// Service
export function validateInput(value: string): ValidationResult {
  // Pure validation
}

// Hook
export function useFormValidation() {
  const [errors, setErrors] = useState({});
  
  const validate = useCallback((field, value) => {
    const result = service.validateInput(value);
    setErrors(prev => ({ ...prev, [field]: result.error }));
    return result.valid;
  }, []);
  
  return { errors, validate };
}

// Component
function Form({ errors, onValidate, onSubmit }) {
  // Pure UI
}
```

### Pattern 2: Data Fetching with Transformation

```typescript
// Service
export function transformApiData(raw: ApiResponse): DisplayData {
  // Pure transformation
}

// Hook
export function useData() {
  const { data: raw } = useQuery({
    queryKey: ['data'],
    queryFn: fetchData
  });
  
  const transformed = useMemo(() => {
    return raw ? service.transformApiData(raw) : null;
  }, [raw]);
  
  return transformed;
}
```

### Pattern 3: Multi-Step Flow

```typescript
// Hook
export function useMultiStepFlow() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({});
  
  const nextStep = useCallback(() => {
    setStep(s => s + 1);
  }, []);
  
  const previousStep = useCallback(() => {
    setStep(s => Math.max(1, s - 1));
  }, []);
  
  return { step, data, nextStep, previousStep };
}
```

## Testing Strategy

### Service Layer Tests

```typescript
// services/deposit/calculations.test.ts
describe('calculateDepositFees', () => {
  it('calculates correct fees', () => {
    const result = calculateDepositFees(100000n, 2);
    expect(result.totalFee).toBe(expectedFee);
  });
});
```

### Hook Tests

```typescript
// hooks/deposit/useDepositFlow.test.ts
import { renderHook, act } from '@testing-library/react-hooks';

describe('useDepositFlow', () => {
  it('transitions through states correctly', async () => {
    const { result } = renderHook(() => useDepositFlow());
    
    act(() => {
      result.current.startDeposit();
    });
    
    expect(result.current.state.step).toBe('form');
  });
});
```

### Component Tests

```typescript
// components/DepositForm.test.tsx
import { render, fireEvent } from '@testing-library/react';

describe('DepositForm', () => {
  it('calls onSubmit with form data', () => {
    const onSubmit = jest.fn();
    const { getByRole } = render(<DepositForm onSubmit={onSubmit} />);
    
    fireEvent.submit(getByRole('form'));
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

## Checklist for Migration

- [ ] Identify feature boundaries
- [ ] Extract calculations to service functions
- [ ] Extract validations to service functions
- [ ] Extract transformers to service functions
- [ ] Create main orchestration hook
- [ ] Create specialized hooks as needed
- [ ] Refactor components to be presentational
- [ ] Create container components
- [ ] Add TypeScript types
- [ ] Write tests for services
- [ ] Write tests for hooks
- [ ] Write tests for components
- [ ] Update imports in existing code
- [ ] Document any breaking changes

## Benefits After Migration

1. **Clear separation of concerns**: Business logic in hooks, UI in components
2. **Better testability**: Each layer can be tested in isolation
3. **Improved reusability**: Hooks and services can be shared
4. **Easier maintenance**: Clear structure makes code easier to understand
5. **Progressive enhancement**: Can migrate one feature at a time

## Next Steps

1. Start with the smallest, most isolated feature
2. Complete the migration for that feature
3. Get team feedback and iterate
4. Apply learnings to next feature
5. Continue until all features are migrated

Remember: The migration doesn't have to be perfect on the first try. The architecture can evolve as you learn what works best for your team.
