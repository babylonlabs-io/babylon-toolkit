# Vault Architecture - Hooks-First Pattern

## Overview

The Vault project follows a **Hooks-First Architecture** that leverages React hooks as the primary abstraction for business logic. This architecture separates concerns into distinct layers while maintaining React's composability and developer experience.

## Core Principles

1. **Business Logic in Hooks** - All business logic, orchestration, and state management lives in custom hooks
2. **Pure Service Functions** - Services contain only pure functions for calculations and transformations
3. **Presentational Components** - Components are purely presentational with no business logic
4. **Composable Patterns** - Hooks can be composed to create complex behaviors from simple pieces

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│         Presentation Layer                   │
│  Components (Pure UI, no business logic)     │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│         Business Logic Layer                 │
│  Hooks (Orchestration, State, Side Effects)  │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│           Service Layer                      │
│  Pure Functions (Calculations, Validations)  │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│             API Layer                        │
│  Data Fetching (React Query, API Clients)    │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── components/           # Presentational components only
│   └── [feature]/       # Feature-specific components
│
├── hooks/               # Business logic hooks
│   ├── [feature]/      # Feature-specific hooks
│   │   ├── use[Feature]Flow.ts      # Main orchestration
│   │   ├── use[Feature]Form.ts      # Form logic
│   │   └── use[Feature]State.ts     # State management
│   └── shared/         # Shared hooks
│
├── services/           # Pure service functions
│   ├── [feature]/     # Feature-specific services
│   │   ├── calculations.ts
│   │   ├── validations.ts
│   │   └── transformers.ts
│   └── shared/        # Shared services
│
├── api/               # API layer
│   ├── queries/       # React Query queries
│   ├── mutations/     # React Query mutations
│   └── clients/       # Raw API clients
│
├── types/             # TypeScript definitions
├── utils/             # Utility functions
└── constants/         # Application constants
```

## Pattern Examples

### Business Logic Hook

```typescript
// hooks/deposit/useDepositFlow.ts
export function useDepositFlow() {
  // State management
  const [step, setStep] = useState<DepositStep>('form');
  
  // API integration
  const { mutate: submitDeposit } = useDepositMutation();
  
  // Service functions
  const validateAmount = (amount: bigint) => 
    depositService.validateAmount(amount);
  
  // Orchestration logic
  const handleSubmit = async (data: DepositData) => {
    if (!validateAmount(data.amount)) return;
    
    setStep('processing');
    await submitDeposit(data);
    setStep('complete');
  };
  
  return { step, handleSubmit };
}
```

### Pure Service Function

```typescript
// services/deposit/validations.ts
export const depositValidations = {
  validateAmount(amount: bigint): ValidationResult {
    if (amount < MIN_DEPOSIT_AMOUNT) {
      return { valid: false, error: 'Amount too low' };
    }
    return { valid: true };
  }
};
```

### Presentational Component

```typescript
// components/deposit/DepositForm.tsx
interface DepositFormProps {
  onSubmit: (data: DepositData) => void;
  isProcessing: boolean;
}

export function DepositForm({ onSubmit, isProcessing }: DepositFormProps) {
  // Only UI state and handlers, no business logic
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit(formData);
    }}>
      {/* Pure UI rendering */}
    </form>
  );
}
```

## Migration Strategy

### Phase 1: Foundation (Current)
- ✅ Establish directory structure
- ✅ Migrate deposit flow as proof of concept
- ✅ Document patterns

### Phase 2: Feature Migration
- [ ] Position management
- [ ] Market operations
- [ ] Vault overview

### Phase 3: Optimization
- [ ] Performance improvements
- [ ] Advanced hook composition
- [ ] Complete test coverage

## Best Practices

### DO ✅
- Keep hooks focused on a single responsibility
- Use composition to combine hooks
- Extract complex calculations to service functions
- Keep components purely presentational
- Use TypeScript for type safety

### DON'T ❌
- Put business logic in components
- Create hooks with too many responsibilities
- Mix UI state with business state
- Use services for side effects (use hooks instead)
- Bypass the architecture layers

## Benefits of This Architecture

1. **Clear Separation** - Business logic is clearly separated from UI
2. **Testability** - Each layer can be tested independently
3. **Reusability** - Hooks and services can be reused across components
4. **Developer Experience** - Familiar React patterns
5. **Progressive Migration** - Can migrate feature by feature

## Future Considerations

This architecture can evolve towards:
- Feature-based modules (if features become more complex)
- Domain-driven design (if business logic grows significantly)
- Micro-frontends (if team scales)

The current architecture provides a solid foundation that can adapt to future needs without major rewrites.
