# Vault Service Refactoring Plan: Morpho Isolation + Indexer Integration

## Goals
1. Consolidate all Morpho-related code under dedicated directories
2. Replace on-chain position reads with indexer GraphQL queries
3. Keep Morpho completely isolated so other apps can be added cleanly
4. Reduce RPC calls by leveraging indexed data

---

## Phase 1: Directory Restructure (No Logic Changes)

### Current Structure → New Structure

```
MOVE: services/applications/morpho/
  TO: services/morpho/

MOVE: hooks/useUserPositions.ts
  TO: hooks/morpho/useUserPositions.ts

MOVE: hooks/useMarkets.ts
  TO: hooks/morpho/useMarkets.ts

KEEP: clients/eth-contract/morpho/           (already isolated)
KEEP: clients/eth-contract/morpho-controller/ (already isolated)
```

### Files to Create

```
services/morpho/index.ts              - Barrel export
hooks/morpho/index.ts                 - Barrel export
services/morpho/graphql/              - New GraphQL queries for positions
```

### Import Updates Required

| File | Current Import | New Import |
|------|---------------|------------|
| services/position/positionService.ts | ../applications/morpho | ../morpho |
| services/position/positionTransactionService.ts | ../applications/morpho | ../morpho |
| hooks/index.ts | ./useUserPositions | ./morpho/useUserPositions |
| hooks/index.ts | ./useMarkets | ./morpho/useMarkets |

---

## Phase 2: Add Indexer GraphQL Queries for Positions

### New File: services/morpho/graphql/fetchPositions.ts

```typescript
// GraphQL queries for Morpho positions from indexer
export async function fetchUserPositions(depositor: Hex): Promise<MorphoPositionFromIndexer[]>
export async function fetchPositionById(positionId: Hex): Promise<MorphoPositionFromIndexer | null>
export async function fetchPositionCollateral(positionId: Hex): Promise<MorphoPositionCollateral[]>
```

### Data Available from Indexer (Static)
- Position ID, depositor, marketId, proxyContract
- totalCollateral (vBTC amount)
- Status (active/closed/liquidated)
- Vault IDs used as collateral
- Collateral amounts per vault
- Created/updated timestamps

### Data Still Needed from Chain (Dynamic)
- Borrow shares/assets (changes with interest accrual)
- Current LTV (calculated from price + debt)
- Oracle price (constantly changing)

---

## Phase 3: Refactor useUserPositions Hook

### Current Flow (7+ RPC calls):
```
1. MorphoController.getUserPositions() → position IDs
2. MorphoController.getPositionsBulk() → position data (multicall)
3. Deduplicate markets
4. Fetch market data for each market
5. Fetch oracle prices for each oracle
6. Morpho.getUserPositionsBulk() → borrow data per market
7. Combine all data
```

### New Flow (1 GraphQL + 2 RPC calls):
```
1. GraphQL: fetchUserPositions(depositor) → positions + collateral + market info
2. RPC: Morpho.getUserPositionsBulk() → borrow shares (dynamic)
3. RPC: Oracle prices (only for positions with active borrows)
```

### Benefits
- Reduce RPC calls from ~7 to ~2-3
- Faster initial load (GraphQL indexed data)
- Still accurate borrow amounts (on-chain read)

---

## Phase 4: Clean Application Interface

### Create: types/application.ts

```typescript
// Generic application interface for vault integrations
export interface VaultApplication {
  id: string;                           // Application controller address
  name: string;                         // Display name

  // Position queries
  fetchUserPositions: (depositor: Hex) => Promise<ApplicationPosition[]>;

  // Vault status
  getVaultStatus: (vaultId: Hex) => Promise<VaultUsageStatus>;

  // Optional: UI metadata
  metadata?: ApplicationMetadata;
}

export interface ApplicationPosition {
  id: string;
  collateralAmount: bigint;
  vaultIds: Hex[];
  // ... other common fields
}
```

### Morpho Implementation

```typescript
// services/morpho/application.ts
export const morphoApplication: VaultApplication = {
  id: CONTRACTS.MORPHO_CONTROLLER,
  name: "Morpho",
  fetchUserPositions: async (depositor) => {
    // Use new GraphQL + minimal RPC approach
  },
  getVaultStatus: async (vaultId) => {
    // Query indexer for vault status
  },
};
```

---

## File Changes Summary

### Phase 1: Moves & Renames
```
git mv services/applications/morpho services/morpho
mkdir -p hooks/morpho
git mv hooks/useUserPositions.ts hooks/morpho/
git mv hooks/useMarkets.ts hooks/morpho/
```

### Phase 2: New Files
```
services/morpho/graphql/fetchPositions.ts   (NEW)
services/morpho/graphql/queries.ts          (NEW - GraphQL query strings)
services/morpho/graphql/types.ts            (NEW - Response types)
services/morpho/graphql/index.ts            (NEW - Barrel)
```

### Phase 3: Modified Files
```
hooks/morpho/useUserPositions.ts            (REFACTOR - use indexer)
services/morpho/index.ts                    (UPDATE - add graphql exports)
```

### Phase 4: New Files
```
types/application.ts                        (NEW - Generic interface)
services/morpho/application.ts              (NEW - Morpho implementation)
registry/applications.ts                    (UPDATE - use new interface)
```

---

## Testing Checklist

- [ ] Build passes after directory moves
- [ ] All imports resolved correctly
- [ ] useUserPositions returns same data shape
- [ ] Position list loads faster (measure)
- [ ] Borrow amounts still accurate
- [ ] Vault status displays correctly
- [ ] Repay/Borrow flows still work
- [ ] Add collateral flow still works

---

## Rollback Plan

If issues arise:
1. Git revert the directory moves
2. Keep new GraphQL code but don't use it
3. Gradually migrate hook by hook

---

## Future: Adding Another Application

With this structure, adding a new app (e.g., "Aave") would be:

```
services/aave/
  ├── index.ts
  ├── graphql/
  │   └── fetchPositions.ts
  ├── marketContract.ts
  └── application.ts        (implements VaultApplication)

hooks/aave/
  ├── index.ts
  └── useUserPositions.ts

clients/eth-contract/
  └── aave-controller/
      ├── query.ts
      └── transaction.ts
```

Each app is completely isolated with no cross-dependencies.
