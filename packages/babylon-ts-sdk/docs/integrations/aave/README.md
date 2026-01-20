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

- **[Quickstart Guide](./quickstart.md)** - Step-by-step examples for all operations
- **[API Reference](../../api/integrations/aave.md)** - Auto-generated API documentation (TypeDoc)
- **[TBV Core Docs](../../README.md)** - Bitcoin vault (peg-in) documentation

---

## Architecture

```
┌─────────────────────────────────────┐
│  Your Frontend (AAVE Team)         │  ← Build your own React/Vue/etc app
│  - UI Components                    │
│  - Wallet Integration               │
│  - User Experience                  │
└─────────────────────────────────────┘
              ↓ imports
┌─────────────────────────────────────┐
│  @babylonlabs-io/ts-sdk             │  ← This package
│  /tbv/integrations/aave             │
│  - Transaction Builders             │
│  - Query Functions                  │
│  - Utility Functions                │
└─────────────────────────────────────┘
              ↓ interacts with
┌─────────────────────────────────────┐
│  Smart Contracts                    │
│  - AaveIntegrationController        │
│  - AaveSpoke (AAVE v4)              │
│  - BTCVaultsManager                 │
└─────────────────────────────────────┘
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

You'll need these addresses to use the SDK (get from AAVE team or indexer):

| Contract                    | Description                                   | Where to Get                   |
| --------------------------- | --------------------------------------------- | ------------------------------ |
| `AaveIntegrationController` | Main controller for TBV integration           | AAVE team / deployment logs    |
| `AaveSpoke`                 | AAVE v4 Core Spoke contract                   | AAVE team / AAVE docs          |
| Reserve IDs                 | Numeric IDs for each asset (vBTC, USDC, etc.) | AAVE config endpoint / indexer |

**Example:**

```typescript
const CONTRACTS = {
  aaveController: "0x123...", // AaveIntegrationController
  aaveSpoke: "0x456...", // AaveSpoke
  vbtcReserveId: 1n, // vBTC reserve
  usdcReserveId: 2n, // USDC reserve
};
```

---

## Prerequisites

Before using this SDK:

1. **Active BTC Vaults** - Complete the TBV peg-in flow
   - See [TBV Core Docs](../../README.md) for peg-in guide
   - Vaults must be in `Available` status

2. **Ethereum Wallet** - viem `WalletClient` for signing
   - Connected to Sepolia testnet (or mainnet)

3. **Contract Addresses** - Get from AAVE team
   - AAVE Integration Controller address
   - AAVE Spoke address
   - Reserve IDs for assets

4. **Understanding of AAVE** - Basic knowledge of:
   - Collateral and debt
   - Health factor and liquidations
   - AAVE v4 protocol

---

## Next Steps

### New to the SDK?

Start with the **[Quickstart Guide](./quickstart.md)** for step-by-step examples of all 5 operations.

### Looking for Specific Functions?

See the **[API Reference](./api-reference.md)** for complete documentation of all 24 functions.

### Need to Create BTC Vaults First?

See the **[TBV Peg-In Guide](../../quickstart/managers.md)** to deposit Bitcoin into vaults.

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

### Health Factor Monitoring

```typescript
import {
  getUserAccountData,
  getHealthFactorStatus,
  aaveValueToUsd,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Get live data
const accountData = await getUserAccountData(
  publicClient,
  spokeAddress,
  proxyAddress,
);

// Convert to numbers
const healthFactor = Number(accountData.healthFactor) / 1e18;
const collateralUsd = aaveValueToUsd(accountData.totalCollateralValue);
const debtUsd = aaveValueToUsd(accountData.totalDebtValue);

// Check status
const status = getHealthFactorStatus(
  healthFactor,
  accountData.borrowedCount > 0n,
);
// Returns: "safe" | "warning" | "danger" | "no_debt"

console.log(`HF: ${healthFactor.toFixed(2)} (${status})`);
console.log(`Collateral: $${collateralUsd.toFixed(2)}`);
console.log(`Debt: $${debtUsd.toFixed(2)}`);
```

---

## Support

- **GitHub Issues**: [babylon-toolkit/issues](https://github.com/babylonlabs-io/babylon-toolkit/issues)
- **SDK Source**: [packages/babylon-ts-sdk](https://github.com/babylonlabs-io/babylon-toolkit/tree/main/packages/babylon-ts-sdk)
- **Documentation**: [babylon-ts-sdk/docs](https://github.com/babylonlabs-io/babylon-toolkit/tree/main/packages/babylon-ts-sdk/docs)

---

## Related Documentation

- **[Quickstart Guide](./quickstart.md)** - Hands-on examples
- **[API Reference](./api-reference.md)** - Complete function docs
- **[TBV Primitives](../../guides/primitives.md)** - Low-level Bitcoin ops
- **[TBV Managers](../../guides/managers.md)** - High-level peg-in flow
