# Option 1: Clean Layered Architecture (Domain-Driven Design Inspired)

## Overview

A clean separation of concerns with well-defined layers, inspired by Domain-Driven Design principles. This architecture emphasizes business logic isolation and clear boundaries between layers.

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│           Presentation Layer                 │
│  (Components, Pages, UI-specific logic)      │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│           Application Layer                  │
│  (Use Cases, Application Services,           │
│   Orchestration, State Management)           │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│            Domain Layer                      │
│  (Entities, Value Objects, Domain Services,  │
│   Business Rules, Domain Events)             │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│         Infrastructure Layer                 │
│  (API Clients, Blockchain Clients,           │
│   External Services, Persistence)            │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── presentation/              # UI Layer
│   ├── components/           # Pure UI components
│   ├── pages/               # Page components
│   └── layouts/             # Layout components
│
├── application/              # Application Services
│   ├── use-cases/           # Business use cases
│   │   ├── deposit/
│   │   ├── position/
│   │   └── market/
│   ├── services/            # Application services
│   └── state/               # Global state management
│
├── domain/                   # Core Business Logic
│   ├── entities/            # Domain entities
│   │   ├── Vault.ts
│   │   ├── Position.ts
│   │   └── Market.ts
│   ├── value-objects/       # Value objects
│   │   ├── BtcAmount.ts
│   │   └── VaultId.ts
│   ├── services/            # Domain services
│   └── events/              # Domain events
│
└── infrastructure/           # External dependencies
    ├── api/                 # API clients
    ├── blockchain/          # Blockchain clients
    └── storage/             # Local storage

```

## Implementation Example

### Domain Entity
```typescript
// domain/entities/Vault.ts
export class Vault {
  constructor(
    private readonly id: VaultId,
    private readonly depositor: Address,
    private readonly amount: BtcAmount,
    private readonly status: VaultStatus
  ) {}

  canBeRedeemed(): boolean {
    return this.status === VaultStatus.AVAILABLE;
  }

  canBeUsedAsCollateral(): boolean {
    return this.status === VaultStatus.AVAILABLE && !this.isExpired();
  }

  private isExpired(): boolean {
    // Business logic for expiry
  }
}
```

### Use Case
```typescript
// application/use-cases/deposit/CreateDepositUseCase.ts
export class CreateDepositUseCase {
  constructor(
    private vaultRepository: VaultRepository,
    private btcService: BtcService,
    private ethService: EthService
  ) {}

  async execute(params: CreateDepositParams): Promise<Vault> {
    // Orchestrate the deposit flow
    const proof = await this.btcService.createProofOfPossession(params);
    const tx = await this.btcService.buildTransaction(params);
    const vault = await this.ethService.submitToContract(tx);
    return this.vaultRepository.save(vault);
  }
}
```

### React Hook (Presentation Layer)
```typescript
// presentation/hooks/useCreateDeposit.ts
export function useCreateDeposit() {
  const createDepositUseCase = useInjection(CreateDepositUseCase);
  
  return useMutation({
    mutationFn: (params) => createDepositUseCase.execute(params),
    onSuccess: (vault) => {
      // Update UI state
    }
  });
}
```

## Benefits

✅ **Clear separation of concerns** - Business logic is completely isolated from UI
✅ **Testable** - Each layer can be tested independently
✅ **Scalable** - Easy to add new features without affecting existing code
✅ **Framework agnostic** - Core business logic doesn't depend on React
✅ **Type-safe** - Strong typing throughout with clear boundaries

## Drawbacks

❌ **More boilerplate** - Requires more initial setup
❌ **Learning curve** - Team needs to understand DDD concepts
❌ **Over-engineering risk** - Might be too complex for simple features
❌ **Migration effort** - Significant refactoring required

## Migration Strategy

### Phase 1: Core Domain (This PR)
- Create domain entities for Vault, Position, Market
- Implement core value objects
- Add domain services for business rules

### Phase 2: Use Cases
- Migrate deposit flow to use cases
- Refactor position management
- Update market operations

### Phase 3: Infrastructure
- Consolidate all API clients
- Standardize data fetching patterns
- Implement repository pattern

### Phase 4: Presentation
- Refactor components to use only presentation logic
- Connect components to use cases via hooks
- Remove business logic from components
