# Option 2: Feature-Based Modular Architecture

## Overview

Organize code by features/modules rather than technical layers. Each feature is self-contained with its own components, hooks, services, and types. This approach emphasizes feature cohesion and independence.

## Architecture Structure

```
┌─────────────────────────────────────────────┐
│              Feature Modules                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Deposit │ │Position │ │ Market  │       │
│  │ Module  │ │ Module  │ │ Module  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────┘
                     │
┌─────────────────────▼───────────────────────┐
│             Shared Core                      │
│  (Common components, utilities, types)       │
└─────────────────────────────────────────────┘
                     │
┌─────────────────────▼───────────────────────┐
│            Infrastructure                    │
│  (API clients, blockchain, external deps)    │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── features/                 # Feature modules
│   ├── deposit/             # Deposit feature
│   │   ├── components/      # Feature-specific components
│   │   ├── hooks/          # Feature-specific hooks
│   │   ├── services/       # Business logic services
│   │   ├── types/          # Feature types
│   │   ├── utils/          # Feature utilities
│   │   └── index.ts        # Public API
│   │
│   ├── position/            # Position management feature
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   │
│   ├── market/              # Market feature
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   │
│   └── vault-overview/      # Vault overview feature
│       ├── components/
│       ├── hooks/
│       └── index.ts
│
├── shared/                  # Shared across features
│   ├── components/          # Shared UI components
│   ├── hooks/              # Shared hooks
│   ├── types/              # Common types
│   └── utils/              # Common utilities
│
├── core/                    # Core business logic
│   ├── models/             # Core domain models
│   ├── services/           # Core services
│   └── state-machines/     # State machines
│
└── infrastructure/          # External dependencies
    ├── api/
    ├── blockchain/
    └── storage/
```

## Implementation Example

### Feature Module Structure
```typescript
// features/deposit/index.ts
// Public API for the deposit feature
export { DepositForm } from './components/DepositForm';
export { DepositOverview } from './components/DepositOverview';
export { useCreateDeposit } from './hooks/useCreateDeposit';
export { useDepositStatus } from './hooks/useDepositStatus';
export type { Deposit, DepositStatus } from './types';
```

### Feature Service
```typescript
// features/deposit/services/depositService.ts
import { btcClient, ethClient } from '@/infrastructure';
import { VaultModel } from '@/core/models';

export class DepositService {
  async createDeposit(params: CreateDepositParams): Promise<Deposit> {
    // All deposit logic encapsulated here
    const proof = await this.createProof(params);
    const transaction = await this.buildTransaction(params);
    const result = await this.submitToContract(transaction);
    
    return new VaultModel(result).toDeposit();
  }

  private async createProof(params: CreateDepositParams) {
    // Proof creation logic
  }

  private async buildTransaction(params: CreateDepositParams) {
    // Transaction building logic
  }
}
```

### Feature Hook
```typescript
// features/deposit/hooks/useCreateDeposit.ts
import { useMutation } from '@tanstack/react-query';
import { depositService } from '../services';

export function useCreateDeposit() {
  return useMutation({
    mutationFn: depositService.createDeposit,
    onSuccess: (deposit) => {
      // Feature-specific success handling
    }
  });
}
```

### Feature Component
```typescript
// features/deposit/components/DepositForm.tsx
import { useCreateDeposit } from '../hooks/useCreateDeposit';
import { DepositAmountInput } from './DepositAmountInput';

export function DepositForm() {
  const { mutate: createDeposit, isPending } = useCreateDeposit();
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      createDeposit(formData);
    }}>
      <DepositAmountInput />
      <button disabled={isPending}>Deposit</button>
    </form>
  );
}
```

## Benefits

✅ **Feature independence** - Features can be developed/tested in isolation
✅ **Easy to understand** - All related code is in one place
✅ **Parallel development** - Teams can work on different features independently
✅ **Progressive migration** - Can migrate one feature at a time
✅ **Clear boundaries** - Easy to see what belongs to each feature

## Drawbacks

❌ **Code duplication** - Some logic might be duplicated across features
❌ **Cross-feature complexity** - Interactions between features can be complex
❌ **Shared state challenges** - Managing shared state across features
❌ **Refactoring difficulty** - Moving code between features requires more work

## Migration Strategy

### Phase 1: Core Infrastructure (This PR)
- Set up infrastructure layer with all clients
- Create core models and state machines
- Establish shared components and utilities

### Phase 2: First Feature Module - Deposits
- Move all deposit-related code to feature module
- Create deposit service with all business logic
- Refactor components to use feature hooks

### Phase 3: Position Feature
- Extract position management to its own module
- Create position service
- Update components to use modular structure

### Phase 4: Market Feature
- Isolate market functionality
- Implement market service
- Complete the modular transformation

## Example PR Implementation

For the first PR, we would:

1. Create the new directory structure
2. Migrate the deposit feature completely
3. Update imports to use the new structure
4. Keep other features working with minimal changes

This allows for a gradual, feature-by-feature migration.
