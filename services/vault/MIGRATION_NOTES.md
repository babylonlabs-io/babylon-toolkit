# Vault Service Migration Notes

## ✅ Completed Migrations

### 1. VaultProviders Service → Repository Pattern
**Status**: ✅ Migrated

**Old Implementation**:
- `services/vault/vaultProviderService.ts` - Direct API calls
- `components/Overview/Deposits/hooks/useVaultProviders.ts` - React Query wrapper

**New Implementation**:
- `infrastructure/repositories/VaultProviderRepository.ts` - Repository with caching
- `presentation/hooks/useVaultProviders.ts` - Clean hook using repository
- `components/Overview/Deposits/hooks/useVaultProviders.ts` - Compatibility layer (kept for backward compatibility)

**Changes Made**:
1. Deleted `vaultProviderService.ts` 
2. Updated existing hook to use repository pattern
3. Repository handles caching internally (5 min cache)
4. All 6 components using the hook continue to work without changes

**Files Modified**:
- `components/Overview/Deposits/hooks/useVaultProviders.ts` - Refactored to use repository
- `services/vault/index.ts` - Removed export of deleted service
- **DELETED**: `services/vault/vaultProviderService.ts`

## 🔄 Migration Pattern

When migrating existing code to the new architecture:

1. **Create Domain Models**: Define entities, value objects, and interfaces
2. **Implement Repository**: Create infrastructure implementation
3. **Add Use Cases**: Business logic in application layer
4. **Refactor Existing Hook**: Update to use new layers
5. **Delete Old Service**: Remove the old implementation
6. **Update Imports**: Fix any broken imports

## 📊 Migration Tracker

| Module | Old Location | New Location | Status |
|--------|-------------|--------------|---------|
| Vault Providers | `services/vault/vaultProviderService.ts` | `infrastructure/repositories/VaultProviderRepository.ts` | ✅ Migrated |
| Deposit Creation | `services/vault/vaultTransactionService.ts` | `application/use-cases/CreateDepositUseCase.ts` | 🚧 Parallel |
| Deposit Query | `hooks/useVaultDeposits.ts` | `presentation/hooks/useDepositList.ts` | 🚧 Parallel |
| Proof of Possession | `services/vault/vaultProofOfPossessionService.ts` | - | ⏳ Pending |
| Pegin Broadcast | `services/vault/vaultPeginBroadcastService.ts` | - | ⏳ Pending |
| BTC Transactions | `services/vault/vaultBtcTransactionService.ts` | - | ⏳ Pending |

## 🎯 Next Steps

1. **Migrate `vaultTransactionService.ts`** - Contains deposit creation logic
2. **Migrate `useVaultDeposits` hook** - Update to use `GetDepositsUseCase`
3. **Migrate proof of possession logic** - Move to domain service
4. **Remove remaining service files** once all dependencies are migrated

## ⚠️ Breaking Changes

None yet - all migrations maintain backward compatibility through:
- Compatibility layers in existing locations
- Type mapping to preserve existing interfaces
- Gradual migration approach
