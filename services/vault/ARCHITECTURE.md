# Vault Service Architecture

## Overview

This document describes the architecture migration plan for the Vault service. We are moving from a mixed architecture with business logic scattered across components to a clean, layered architecture following Domain-Driven Design (DDD) and Clean Architecture principles.

## Architecture Principles

### Core Principles
1. **Separation of Concerns**: Each layer has a single, well-defined responsibility
2. **Dependency Rule**: Dependencies only point inward (from outer layers to inner layers)
3. **Testability**: Business logic is isolated and easily testable
4. **Modularity**: Features are organized into modules that can be migrated independently

### Layer Structure

```
┌──────────────────────────────────────────────┐
│            Presentation Layer                 │
│  (Components, Hooks, State Management)        │
├──────────────────────────────────────────────┤
│            Application Layer                  │
│  (Use Cases, DTOs, Application Services)      │
├──────────────────────────────────────────────┤
│              Domain Layer                     │
│  (Entities, Value Objects, Domain Services)   │
├──────────────────────────────────────────────┤
│           Infrastructure Layer                │
│  (Repositories, External APIs, Data Sources)  │
└──────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. Domain Layer (`src/domain/`)
- **Entities**: Core business objects with identity (e.g., `Vault`, `Deposit`, `Position`)
- **Value Objects**: Immutable objects without identity (e.g., `BtcAmount`, `VaultAddress`)
- **Domain Services**: Business logic that doesn't belong to a single entity
- **Repository Interfaces**: Contracts for data access (implementations in infrastructure)
- **Domain Errors**: Business-specific exceptions

**Key Rule**: This layer has NO dependencies on other layers or external libraries.

### 2. Application Layer (`src/application/`)
- **Use Cases**: Orchestrate domain logic to achieve specific business goals
- **DTOs**: Data Transfer Objects for communication between layers
- **Mappers**: Convert between domain entities and DTOs
- **Application Services**: Coordinate multiple use cases

**Key Rule**: Depends only on the Domain layer.

### 3. Infrastructure Layer (`src/infrastructure/`)
- **Repository Implementations**: Concrete data access implementations
- **External Service Adapters**: API clients, blockchain interactions
- **Configuration**: Environment-specific settings
- **Technical Services**: Caching, logging, monitoring

**Key Rule**: Can depend on Domain and Application layers.

### 4. Presentation Layer (`src/components/`, `src/presentation/`)
- **UI Components**: React components (pure UI, no business logic)
- **Custom Hooks**: UI-specific logic and state management
- **View Models**: Data formatting for UI display
- **State Management**: Application state (using hooks or state libraries)

**Key Rule**: Business logic should live in hooks or be delegated to use cases.

## Migration Strategy

### Phase 1: Foundation (Current PR)
1. ✅ Create architecture documentation
2. Implement domain models for Vault module
3. Create repositories and use cases for deposit flow
4. Refactor deposit components to use new architecture
5. Keep existing code functional during migration

### Phase 2: Expand Core Modules
1. Migrate Position module
2. Migrate Market module
3. Migrate Activity/Transaction modules

### Phase 3: Complete Infrastructure
1. Centralize all API clients in infrastructure
2. Implement proper error handling
3. Add logging and monitoring

### Phase 4: Final Cleanup
1. Remove old service implementations
2. Clean up unused utilities
3. Complete test coverage

## Module Structure Example: Vault Deposits

```
src/
├── domain/
│   ├── entities/
│   │   ├── Deposit.ts
│   │   └── Vault.ts
│   ├── value-objects/
│   │   ├── BtcAmount.ts
│   │   ├── VaultAddress.ts
│   │   └── DepositStatus.ts
│   ├── repositories/
│   │   └── IDepositRepository.ts
│   └── services/
│       └── DepositValidationService.ts
├── application/
│   ├── use-cases/
│   │   ├── CreateDepositUseCase.ts
│   │   ├── GetDepositsUseCase.ts
│   │   └── RedeemDepositUseCase.ts
│   ├── dtos/
│   │   ├── CreateDepositDTO.ts
│   │   └── DepositDTO.ts
│   └── mappers/
│       └── DepositMapper.ts
├── infrastructure/
│   ├── repositories/
│   │   └── DepositRepository.ts
│   └── services/
│       ├── VaultApiClient.ts
│       └── BtcWalletService.ts
└── presentation/
    ├── hooks/
    │   ├── useCreateDeposit.ts
    │   └── useDepositList.ts
    └── components/
        └── deposits/
            └── DepositForm.tsx
```

## Benefits of This Architecture

1. **Clear Separation**: Business logic is isolated from UI and infrastructure
2. **Testability**: Each layer can be tested independently
3. **Maintainability**: Changes in one layer don't affect others
4. **Scalability**: New features can be added without affecting existing code
5. **Team Collaboration**: Clear boundaries enable parallel development

## Migration Guidelines

### Do's
- ✅ Keep business logic in domain/application layers
- ✅ Use dependency injection for repositories
- ✅ Create proper domain models with validation
- ✅ Use DTOs at layer boundaries
- ✅ Keep components focused on UI

### Don'ts
- ❌ Don't put business logic in components
- ❌ Don't make direct API calls from components
- ❌ Don't import infrastructure in domain layer
- ❌ Don't use domain entities in API responses
- ❌ Don't create giant "god" services

## Current Migration Status

### Completed ✅
- Architecture documentation
- Domain models for Deposit module
- Repository interfaces for Deposits
- Use cases for deposit operations
- Infrastructure implementation for deposits

### In Progress 🚧
- Refactoring deposit components
- Creating presentation hooks

### Pending ⏳
- Position module migration
- Market module migration
- Activity module migration
- Complete test coverage

## Code Examples

### Domain Entity Example
```typescript
// src/domain/entities/Deposit.ts
export class Deposit {
  constructor(
    private readonly id: string,
    private readonly vaultId: string,
    private readonly amount: BtcAmount,
    private status: DepositStatus,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.amount.isPositive()) {
      throw new InvalidDepositError('Amount must be positive');
    }
  }

  // Business logic methods
  canRedeem(): boolean {
    return this.status.isConfirmed();
  }
}
```

### Use Case Example
```typescript
// src/application/use-cases/CreateDepositUseCase.ts
export class CreateDepositUseCase {
  constructor(
    private depositRepository: IDepositRepository,
    private vaultService: IVaultService,
  ) {}

  async execute(dto: CreateDepositDTO): Promise<DepositDTO> {
    // Validate business rules
    const vault = await this.vaultService.getVault(dto.vaultId);
    if (!vault.isActive()) {
      throw new VaultNotActiveError();
    }

    // Create domain entity
    const deposit = new Deposit(
      generateId(),
      dto.vaultId,
      new BtcAmount(dto.amountSat),
      DepositStatus.pending(),
    );

    // Persist
    await this.depositRepository.save(deposit);

    // Return DTO
    return DepositMapper.toDTO(deposit);
  }
}
```

### Hook Example
```typescript
// src/presentation/hooks/useCreateDeposit.ts
export function useCreateDeposit() {
  const createDepositUseCase = useInjection(CreateDepositUseCase);
  
  return useMutation({
    mutationFn: (data: CreateDepositRequest) => {
      return createDepositUseCase.execute(data);
    },
  });
}
```

## Next Steps

1. Review and approve this architecture
2. Complete Phase 1 implementation in this PR
3. Create follow-up tickets for remaining phases
4. Establish code review guidelines for architecture compliance
