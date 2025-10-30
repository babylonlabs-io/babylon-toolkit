# Vault Service Improvement Tickets

This document contains actionable, atomic tickets for improving the vault service architecture, error handling, and performance.

## Overview

The tickets are organized into three main categories:
1. **Error Handling** - Centralized error handling, user-friendly messages, error boundaries
2. **Performance** - Replace Morpho SDK calls with API endpoints, optimize data fetching
3. **Architecture** - React Query configuration, API client improvements, wallet error handling

---

## Error Handling

### EH-001: Configure React Query with centralized error handling
**Priority:** High  
**Estimated Effort:** 2 hours

**Problem:**
React Query is initialized without default error handling configuration. Each hook manually sets `retry: 2` without consistent retry strategies or error callbacks.

**Solution:**
1. Create a centralized QueryClient configuration in `src/config/queryClient.ts`
2. Configure default retry logic with exponential backoff
3. Add a global `onError` handler for logging errors to error tracking service
4. Set sensible defaults for `staleTime`, `gcTime`, and `retry` options
5. Update `providers.tsx` to use the configured QueryClient

**Acceptance Criteria:**
- QueryClient has centralized configuration with default options
- Global error handler logs errors appropriately
- Default retry strategy uses exponential backoff (max 3 retries)
- All new queries inherit sensible defaults

**Files to modify:**
- `src/providers.tsx`
- Create `src/config/queryClient.ts`

---

### EH-002: Create error types and error message utilities
**Priority:** High  
**Estimated Effort:** 3 hours

**Problem:**
Errors are thrown as generic `Error` objects without structured types. Error messages are not user-friendly and don't provide actionable guidance.

**Solution:**
1. Create `src/utils/errors/types.ts` with error classes:
   - `ApiError` - for REST API errors
   - `ContractError` - for on-chain contract errors
   - `NetworkError` - for network failures
   - `WalletError` - for wallet connection/transaction errors
   - `ValidationError` - for user input validation errors
2. Create `src/utils/errors/messages.ts` with user-friendly error message mapping
3. Update `RestClientError` to extend `ApiError`
4. Add error code constants for common error scenarios

**Acceptance Criteria:**
- Error types are defined and exported
- User-friendly error messages are mapped for common errors
- Error messages guide users on how to resolve issues
- All error classes include error codes for programmatic handling

**Files to modify:**
- Create `src/utils/errors/types.ts`
- Create `src/utils/errors/messages.ts`
- Update `src/utils/rest-client.ts`

---

### EH-003: Add error boundary for transaction flows
**Priority:** Medium  
**Estimated Effort:** 2 hours

**Problem:**
Transaction flows (deposit, borrow, repay, redeem) can fail without proper error boundaries. Errors during transaction signing or broadcasting can crash the UI.

**Solution:**
1. Create `src/components/ErrorBoundary/TransactionErrorBoundary.tsx`
2. Wrap transaction modal components with the error boundary
3. Display user-friendly error messages with retry options
4. Log errors to error tracking service
5. Provide "Reset" functionality to allow users to restart the flow

**Acceptance Criteria:**
- Transaction flows have error boundaries
- Error messages are user-friendly and actionable
- Users can retry failed transactions
- Errors are logged appropriately

**Files to modify:**
- Create `src/components/ErrorBoundary/TransactionErrorBoundary.tsx`
- Update transaction modal components

---

### EH-004: Improve wallet connection error handling
**Priority:** Medium  
**Estimated Effort:** 1 hour

**Problem:**
Wallet connection errors in `VaultWalletConnectionProvider` only log to console. Users don't see actionable error messages when wallet connections fail.

**Solution:**
1. Update `VaultWalletConnectionProvider.onError` callback to:
   - Show toast notifications for non-rejected errors
   - Distinguish between user rejection and actual errors
   - Provide guidance for common wallet connection issues
2. Add error handling for wallet disconnection events
3. Display user-friendly error messages in the wallet connection UI

**Acceptance Criteria:**
- Wallet connection errors show toast notifications
- User rejection doesn't show error notifications
- Common wallet issues have helpful error messages
- Disconnection errors are handled gracefully

**Files to modify:**
- `src/context/wallet/VaultWalletConnectionProvider.tsx`
- `src/components/Wallet/Connect.tsx`

---

### EH-005: Add error handling for React Query hooks
**Priority:** Medium  
**Estimated Effort:** 2 hours

**Problem:**
React Query hooks return errors but don't consistently handle them in UI components. Error states are not always displayed to users.

**Solution:**
1. Create a shared `useErrorHandler` hook that:
   - Maps errors to user-friendly messages
   - Shows toast notifications for errors
   - Logs errors to error tracking service
2. Update hooks (`useMarkets`, `useUserPositions`, `useMarketDetailData`) to use the error handler
3. Ensure all components using these hooks display error states in the UI

**Acceptance Criteria:**
- Error handler hook is created and used consistently
- Error states are displayed in UI components
- User-friendly error messages are shown
- Errors are logged appropriately

**Files to modify:**
- Create `src/hooks/useErrorHandler.ts`
- Update `src/hooks/useMarkets.ts`
- Update `src/hooks/useUserPositions.ts`
- Update `src/hooks/useMarketDetailData.ts`
- Update components that use these hooks

---

## Performance

### P-001: Add API endpoint for user positions with market data
**Priority:** High  
**Estimated Effort:** 4 hours

**Problem:**
`getUserPositionsWithMorpho` makes multiple on-chain calls:
- `VaultController.getUserPositions` - get position IDs
- `VaultController.getPositionsBulk` - get position data
- `Morpho.getMarketWithData` - get market data for each unique market
- `MorphoOracle.getOraclePrice` - get oracle prices
- `Morpho.getUserPositionsBulk` - get Morpho positions

All of this could be served by a single API endpoint.

**Solution:**
1. Add `getUserPositions(userAddress: string)` endpoint to `VaultApiClient`
2. Endpoint should return positions with:
   - Position data from VaultController
   - Market data (supply, borrow, utilization, etc.)
   - User's Morpho position data
   - BTC price from oracle
3. Update `positionService.ts` to use API endpoint instead of SDK calls
4. Update `useUserPositions` hook to use the new service function
5. Add error handling for API failures with fallback to SDK calls

**Acceptance Criteria:**
- API endpoint exists for user positions
- Service layer uses API instead of SDK
- Fallback to SDK if API fails
- Response time improves significantly

**Files to modify:**
- `src/clients/vault-api/api.ts`
- `src/clients/vault-api/types.ts`
- `src/services/position/positionService.ts`
- `src/hooks/useUserPositions.ts`

---

### P-002: Add API endpoint for market data summaries
**Priority:** High  
**Estimated Effort:** 3 hours

**Problem:**
Market data is fetched directly from Morpho contracts via `Morpho.getMarketWithData`, which makes 2 contract calls per market. This is slow when fetching multiple markets.

**Solution:**
1. Add `getMarketSummaries()` endpoint to `VaultApiClient` that returns market data including:
   - Market parameters (tokens, oracle, IRM, LLTV)
   - Market state (total supply, total borrow, utilization)
   - Derived metrics (utilization %, LLTV %)
2. Add `getMarketSummary(marketId: string)` for single market
3. Update `marketService.ts` to use API endpoints with fallback to contract calls
4. Update `useMarketDetailData` to use API endpoint

**Acceptance Criteria:**
- API endpoints exist for market summaries
- Service layer uses API with SDK fallback
- Market fetching is faster
- No functionality regression

**Files to modify:**
- `src/clients/vault-api/api.ts`
- `src/clients/vault-api/types.ts`
- `src/services/market/marketService.ts`
- `src/hooks/useMarketDetailData.ts`

---

### P-003: Optimize market list fetching with API
**Priority:** Medium  
**Estimated Effort:** 2 hours

**Problem:**
`useMarkets` fetches markets from API correctly, but `useMarketDetailData` refetches markets separately. Additionally, `getMarketsWithValidation` makes on-chain calls to validate each market.

**Solution:**
1. Ensure market list is cached globally and shared across hooks
2. Remove redundant market validation calls (API should return valid markets)
3. Update `getMarketsWithValidation` to trust API data or validate only on-demand
4. Optimize React Query cache keys to share market data

**Acceptance Criteria:**
- Markets are fetched once and cached globally
- No redundant market validation calls
- Market list fetching is optimized
- Cache is shared across components

**Files to modify:**
- `src/hooks/useMarkets.ts`
- `src/hooks/useMarketDetailData.ts`
- `src/services/market/marketService.ts`

---

### P-004: Add API endpoint for single position with full data
**Priority:** Medium  
**Estimated Effort:** 2 hours

**Problem:**
`getSinglePositionWithMorpho` makes multiple on-chain calls that could be served by a single API endpoint.

**Solution:**
1. Add `getPosition(positionId: string)` endpoint to `VaultApiClient`
2. Endpoint returns position with full Morpho data and market data
3. Update `positionService.ts` to use API endpoint
4. Update `useSinglePosition` hook to use new service function

**Acceptance Criteria:**
- API endpoint exists for single position
- Service uses API with SDK fallback
- Performance improves for position detail views

**Files to modify:**
- `src/clients/vault-api/api.ts`
- `src/clients/vault-api/types.ts`
- `src/services/position/positionService.ts`
- `src/hooks/useSinglePosition.ts`

---

### P-005: Implement request deduplication for parallel API calls
**Priority:** Low  
**Estimated Effort:** 2 hours

**Problem:**
Multiple components may request the same data simultaneously (e.g., market data), causing redundant API calls even with React Query caching.

**Solution:**
1. React Query already handles deduplication, but ensure query keys are consistent
2. Add request deduplication in `RestClient` for identical concurrent requests
3. Implement a request queue for identical requests within a short time window
4. Cache responses temporarily to prevent duplicate requests

**Acceptance Criteria:**
- Identical concurrent requests are deduplicated
- Request queue prevents duplicate API calls
- No unnecessary network requests

**Files to modify:**
- `src/utils/rest-client.ts`

---

## Architecture

### A-001: Standardize React Query hook return types
**Priority:** Medium  
**Estimated Effort:** 2 hours

**Problem:**
React Query hooks have inconsistent return types. Some return `{ data, loading, error }`, others return `{ markets, loading, error }` or `{ positions, loading, error }`.

**Solution:**
1. Create a shared type `UseQueryResult<T>` in `src/types/react-query.ts`
2. Standardize all hook return types to use consistent naming:
   - `data` for the main data array/object
   - `loading` for loading state
   - `error` for error state
   - `refetch` for refetch function
3. Update all hooks to use the standardized type

**Acceptance Criteria:**
- All hooks use consistent return type structure
- Type safety is improved
- Easier to use hooks in components

**Files to modify:**
- Create `src/types/react-query.ts`
- Update all React Query hooks in `src/hooks/`

---

### A-002: Improve API client error handling and retry logic
**Priority:** Medium  
**Estimated Effort:** 2 hours

**Problem:**
`RestClient` throws errors but doesn't distinguish between retryable errors (network failures, 5xx) and non-retryable errors (4xx, validation errors).

**Solution:**
1. Update `RestClientError` to include `retryable` flag
2. Add method `isRetryableError(error: RestClientError): boolean`
3. Implement exponential backoff retry logic in `RestClient`
4. Add max retry attempts configuration
5. Update error messages to indicate if request should be retried

**Acceptance Criteria:**
- Retryable vs non-retryable errors are distinguished
- Automatic retry with exponential backoff for retryable errors
- Max retry attempts are configurable
- Error messages are clear

**Files to modify:**
- `src/utils/rest-client.ts`

---

### A-003: Add API response caching strategy
**Priority:** Low  
**Estimated Effort:** 3 hours

**Problem:**
Some API responses (markets, providers) change infrequently but are refetched on every mount or navigation.

**Solution:**
1. Configure React Query cache times based on data freshness requirements:
   - Markets: 5 minutes staleTime, 10 minutes gcTime
   - Providers: 5 minutes staleTime, 10 minutes gcTime
   - Positions: 30 seconds staleTime, 2 minutes gcTime
   - Market details: 30 seconds staleTime, 2 minutes gcTime
2. Add cache persistence for markets and providers
3. Implement cache invalidation strategies for position updates

**Acceptance Criteria:**
- Cache times are configured appropriately
- Less redundant API calls
- Improved performance on navigation
- Cache invalidation works correctly

**Files to modify:**
- `src/config/queryClient.ts`
- Update individual hooks with appropriate cache settings

---

### A-004: Add API timeout configuration per endpoint
**Priority:** Low  
**Estimated Effort:** 1 hour

**Problem:**
All API requests use the same 30-second timeout. Some endpoints (like position fetching) may need longer timeouts.

**Solution:**
1. Add timeout configuration to `VaultApiClient` methods
2. Allow per-endpoint timeout configuration
3. Set appropriate timeouts:
   - Markets/Providers: 10 seconds
   - Positions: 30 seconds
   - Single position: 20 seconds
   - Vault details: 20 seconds

**Acceptance Criteria:**
- Per-endpoint timeout configuration
- Sensible default timeouts
- Timeout errors are handled gracefully

**Files to modify:**
- `src/clients/vault-api/api.ts`
- `src/utils/rest-client.ts`

---

### A-005: Create centralized API client configuration
**Priority:** Low  
**Estimated Effort:** 1 hour

**Problem:**
`VaultApiClient` is instantiated multiple times in different hooks, creating redundant instances.

**Solution:**
1. Create a singleton API client instance
2. Export the instance from `src/clients/vault-api/index.ts`
3. Update all hooks to use the singleton instance
4. Centralize API URL and timeout configuration

**Acceptance Criteria:**
- Single API client instance is used
- Configuration is centralized
- No redundant client instances

**Files to modify:**
- `src/clients/vault-api/api.ts`
- Create `src/clients/vault-api/index.ts`
- Update hooks to use singleton

---

## Summary

**Total Tickets:** 15  
**High Priority:** 6  
**Medium Priority:** 6  
**Low Priority:** 3

**Estimated Total Effort:** ~35 hours

---

## Implementation Order Recommendation

1. **Phase 1 - Error Handling Foundation** (EH-001, EH-002)
2. **Phase 2 - Critical Performance** (P-001, P-002)
3. **Phase 3 - Error Handling UI** (EH-003, EH-004, EH-005)
4. **Phase 4 - Remaining Performance** (P-003, P-004, P-005)
5. **Phase 5 - Architecture Improvements** (A-001 through A-005)

