# AAVE v4 Integration with Babylon TBV

Use Bitcoin (via TBV vaults) as collateral in AAVE v4 lending protocol.

## Overview

This integration enables AAVE v4 users to deposit Bitcoin vaults as collateral and borrow stablecoins (USDC, etc.) against their BTC holdings. The SDK provides pure TypeScript functions for all AAVE operations, health factor calculations, and risk management utilities.

**Key Features:**

- ✅ Use BTC vaults as collateral in AAVE v4
- ✅ Borrow stablecoins against BTC holdings
- ✅ Health factor monitoring and risk management
- ✅ Automatic vault selection algorithms
- ✅ Pure TypeScript functions with zero side effects
- ✅ Full type safety with TypeScript interfaces
- ✅ Production-ready error handling

## Installation

```bash
npm install @babylonlabs-io/ts-sdk viem
```

## Quick Links

- **[Quickstart Guide](./quickstart.md)** - Step-by-step SDK function examples
- **[Full Integration Guide](./integration-guide.md)** - Complete implementation with indexer + SDK
- **[API Reference](../../api/integrations/aave.md)** - Auto-generated API documentation (TypeDoc)
- **[TBV Core Docs](../../README.md)** - Bitcoin vault (peg-in) documentation

---

## Architecture

### Complete System Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Your Frontend                                                 │
│  - UI Components, Wallet Integration, User Experience          │
└────────────────────────────────────────────────────────────────┘
         ↓ imports                    ↓ GraphQL queries
┌──────────────────────────────┐  ┌─────────────────────────────┐
│  @babylonlabs-io/ts-sdk      │  │  Babylon Indexer (GraphQL)  │
│  /tbv/integrations/aave      │  │  - Contract addresses       │
│  - Transaction Builders      │  │  - Reserve IDs & metadata   │
│  - RPC Query Functions       │  │  - User positions           │
│  - Utility Functions         │  │  - Vault status & history   │
└──────────────────────────────┘  │  - Collateral details       │
         ↓ RPC calls              └─────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  Smart Contracts (Ethereum)                                    │
│  - AaveIntegrationController, AaveSpoke, BTCVaultsManager      │
└────────────────────────────────────────────────────────────────┘
```

### Data Sources & Responsibilities

**This SDK (`@babylonlabs-io/ts-sdk`)** provides:

- ✅ **Transaction Builders** - Build unsigned transactions for all operations
- ✅ **RPC Queries** - Read live on-chain data (health factor, debt, account data)
- ✅ **Utilities** - Calculate health factor, select vaults, format values

**Babylon Indexer** (separate service, accessed via GraphQL):

- ✅ **Configuration** - Contract addresses, reserve IDs, reserve metadata
- ✅ **Position Data** - User's positions, collateral details, position history
- ✅ **Vault Management** - Vault status (available/in_use/redeemed), vault lists
- ✅ **Historical Data** - Transaction history, events, position changes

**Integration Pattern**: Your frontend should use **both** the SDK and the Indexer:

1. **Indexer** → Get contract addresses, positions, available vaults
2. **SDK** → Build transactions, query live RPC data (health factor, debt)
3. **SDK + Indexer** → Combine for complete UX (e.g., positions with live health factor)

> 📘 **Need complete integration examples?** See the **[Full Integration Guide](./integration-guide.md)** which shows GraphQL queries, service layer patterns, and complete end-to-end workflows using both the indexer and SDK together.

---

## SDK Functions

This SDK provides pure functions for interacting with Aave smart contracts. You'll need to fetch configuration data (contract addresses, positions, vaults) from the Babylon indexer separately - see the [Integration Guide](./integration-guide.md) for complete examples.

### RPC Queries (Included in SDK)

For live on-chain data, use these SDK query functions:

```typescript
import {
  getUserAccountData,
  getUserTotalDebt,
  hasDebt,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Get live health factor and account values
const accountData = await getUserAccountData(
  publicClient,
  spokeAddress,
  proxyAddress,
);

// Get exact current debt (includes accrued interest)
const debt = await getUserTotalDebt(
  publicClient,
  spokeAddress,
  reserveId,
  proxyAddress,
);
```

---

## Key Concepts

### Collateral Operations

**Add Collateral** - Deposit BTC vaults into AAVE position

- Creates new position on first deposit
- Vaults change status: `Available` → `InUse`
- Use `selectVaultsForAmount()` to choose optimal vaults

**Withdraw Collateral** - Remove vaults from AAVE

- Requires zero debt across all reserves
- Vaults return to `Available` status
- Use `hasDebt()` to verify before withdrawing

**Vault Selection** - SDK utilities for choosing vaults

- `selectVaultsForAmount()` - Greedy algorithm (largest first)
- `calculateTotalVaultAmount()` - Sum vault amounts

### Debt Operations

**Borrow** - Take loan against collateral

- Requires healthy position (HF > 1.0)
- Use `calculateHealthFactor()` to check safety
- Borrowed assets sent to specified receiver address

**Repay** - Pay back borrowed assets

- Partial or full repayment supported
- Requires ERC20 token approval first
- Use `getUserTotalDebt()` for exact amount

**Health Factor** - Monitor liquidation risk

- HF = (Collateral × Liquidation Threshold) / Debt
- HF < 1.0 = Position can be liquidated
- HF < 1.5 = Warning (at risk)
- HF ≥ 1.5 = Safe

### Core Types

**Position** - Your AAVE lending position

- Contains depositor info, reserve ID, proxy contract
- Tracks vault IDs and total collateral
- Get with `getPosition()`

**Reserve** - AAVE market for an asset

- Each asset has unique reserve ID (e.g., vBTC reserve, USDC reserve)
- Get reserve IDs from AAVE config or indexer

**Proxy Contract** - User-specific AAVE contract

- Deployed automatically on first collateral deposit
- Holds your collateral and debt positions
- Address returned in position data

---

## Five Core Operations

### 1. Add Collateral

```typescript
import {
  buildAddCollateralTx,
  selectVaultsForAmount,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Select vaults
const { vaultIds } = selectVaultsForAmount(availableVaults, 0.5);

// Build transaction
const txParams = buildAddCollateralTx(
  controllerAddress,
  vaultIds,
  vbtcReserveId,
);

// Execute
const hash = await walletClient.sendTransaction(txParams);
```

### 2. Borrow

```typescript
import {
  buildBorrowTx,
  getUserAccountData,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Check health
const accountData = await getUserAccountData(
  publicClient,
  spokeAddress,
  proxyAddress,
);

// Build borrow transaction
const txParams = buildBorrowTx(
  controllerAddress,
  positionId,
  usdcReserveId,
  amount,
  receiver,
);

// Execute
const hash = await walletClient.sendTransaction(txParams);
```

### 3. Repay

```typescript
import {
  buildRepayTx,
  getUserTotalDebt,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Get exact debt
const totalDebt = await getUserTotalDebt(
  publicClient,
  spokeAddress,
  usdcReserveId,
  proxyAddress,
);

// Approve token spending first (ERC20)
// await approveTokens(...)

// Build repay transaction
const txParams = buildRepayTx(
  controllerAddress,
  positionId,
  usdcReserveId,
  totalDebt,
);

// Execute
const hash = await walletClient.sendTransaction(txParams);
```

### 4. Withdraw Collateral

```typescript
import {
  buildWithdrawAllCollateralTx,
  hasDebt,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Verify zero debt
const userHasDebt = await hasDebt(
  publicClient,
  spokeAddress,
  usdcReserveId,
  proxyAddress,
);
if (userHasDebt) throw new Error("Repay debt first");

// Build withdraw transaction
const txParams = buildWithdrawAllCollateralTx(controllerAddress, vbtcReserveId);

// Execute
const hash = await walletClient.sendTransaction(txParams);
```

### 5. Redeem Vault

```typescript
import { buildDepositorRedeemTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Build redeem transaction (only for original depositors)
const txParams = buildDepositorRedeemTx(controllerAddress, vaultId);

// Execute
const hash = await walletClient.sendTransaction(txParams);
```

---

## What You Get

### Transaction Builders (5 functions)

Build unsigned transactions for all AAVE operations:

- `buildAddCollateralTx()` - Add BTC vaults as collateral
- `buildBorrowTx()` - Borrow against collateral
- `buildRepayTx()` - Repay debt
- `buildWithdrawAllCollateralTx()` - Remove all collateral
- `buildDepositorRedeemTx()` - Redeem vault to vault provider

### Query Functions (6 functions)

Read on-chain state:

- `getPosition()` - Get position data
- `getUserAccountData()` - Get health factor and values
- `getUserPosition()` - Get reserve-specific position
- `getUserTotalDebt()` - Get exact debt amount
- `hasDebt()` - Check if user has debt
- `hasCollateral()` - Check if user has collateral

### Utility Functions (13+ functions)

Pure calculations and helpers:

- `calculateHealthFactor()` - Calculate HF from values
- `selectVaultsForAmount()` - Choose optimal vaults
- `formatHealthFactor()` - Format HF for display
- `getHealthFactorStatus()` - Get status (safe/warning/danger)
- `aaveValueToUsd()` - Convert AAVE values to USD
- `wadToNumber()` - Convert WAD to number
- And more...

### Types & Constants

- TypeScript interfaces for all data structures
- Protocol constants (decimals, thresholds, etc.)
- Contract ABIs for AAVE Integration Controller and Spoke

---

## Contract Addresses

You need these addresses to use the SDK:

- **AaveIntegrationController** - Main contract for TBV operations
- **AaveSpoke** - Aave v4 Core Spoke contract
- **Reserve IDs** - Numeric IDs for each asset (vBTC, USDC, etc.)

**Recommended**: Fetch addresses from the Babylon GraphQL indexer at runtime. See the **[Integration Guide](./integration-guide.md#babylon-indexer-integration)** for complete GraphQL query examples.

**Alternative**: For testnet development, you can hardcode addresses:

```typescript
const AAVE_CONTROLLER = "0x123..." as Address;
const AAVE_SPOKE = "0x456..." as Address;
const VBTC_RESERVE_ID = 1n;
```

> **Production**: Always fetch from indexer to use latest deployed contracts.

---

## Prerequisites

Before integrating the Aave SDK:

### 1. Access to Babylon Indexer

**Required** - The indexer provides contract addresses, positions, and vault data.

- **Indexer Endpoint**: Contact Babylon team for endpoint URL
- **GraphQL Queries**: See [Integration Guide](./integration-guide.md#babylon-indexer-integration) for complete examples

### 2. Active BTC Vaults

Users must have completed the TBV peg-in flow to have vaults available for collateral.

- See [TBV Peg-In Guide](../../quickstart/managers.md) for implementation
- Vaults must be in `Available` status
- Check vault status via indexer: `aaveVaultStatuss` query

### 3. Ethereum Wallet

viem `WalletClient` for signing transactions.

- Connected to Sepolia testnet (for testing) or mainnet
- User must have ETH for gas fees

### 4. Development Dependencies

```bash
npm install @babylonlabs-io/ts-sdk viem
```

For indexer integration, also install:

```bash
npm install graphql-request
```

---

## Next Steps

### New to the SDK?

1. **[Quickstart Guide](./quickstart.md)** - Step-by-step SDK function examples
2. **[Full Integration Guide](./integration-guide.md)** - Complete implementation with indexer + SDK

### Looking for Specific Functions?

**[API Reference](../../api/integrations/aave.md)** - Complete documentation of all 24 functions

### Need to Create BTC Vaults First?

**[TBV Peg-In Guide](../../quickstart/managers.md)** - Deposit Bitcoin into vaults

---

## Common Workflows

### First-Time User Flow

1. Complete TBV peg-in (create BTC vaults)
2. Add collateral to AAVE (creates position)
3. Borrow stablecoins
4. Monitor health factor
5. Repay debt when needed
6. Withdraw collateral
7. Optionally redeem vaults

### Complete Integration Example

For a complete end-to-end example combining the Babylon indexer with SDK functions, see the **[Integration Guide](./integration-guide.md#complete-operation-flows)** which shows:

- How to fetch configuration and vaults from the indexer
- How to use SDK functions to build and execute transactions
- How to combine indexer data with live RPC queries
- Real-world patterns from the Babylon vault service

---

## Support

- **GitHub Issues**: [babylon-toolkit/issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- **SDK Source**: [packages/babylon-ts-sdk](https://github.com/babylonlabs-io/babylon-toolkit/tree/main/packages/babylon-ts-sdk)
- **Documentation**: [babylon-ts-sdk/docs](https://github.com/babylonlabs-io/babylon-toolkit/tree/main/packages/babylon-ts-sdk/docs)

---

## Related Documentation

- **[Quickstart Guide](./quickstart.md)** - Step-by-step SDK function examples
- **[Full Integration Guide](./integration-guide.md)** - Complete implementation with indexer
- **[API Reference](../../api/integrations/aave.md)** - Complete function documentation
- **[TBV Guide](../../quickstart/managers.md)** - Create Bitcoin vaults
