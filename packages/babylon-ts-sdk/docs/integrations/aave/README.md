# Babylon Aave v4 Integration

Use BTC vaults as collateral in Aave v4 to borrow other assets.

## About Aave v4

Aave is a decentralized lending protocol where users can supply assets as collateral and borrow other assets against it. This SDK integration allows using Bitcoin vaults as collateral in Aave v4 Babylon Core Spoke.

## What This Provides

The SDK provides pure functions for Babylon's custom Aave integration:

- **Transaction Builders** - Build unsigned transactions (the caller executes with their wallet)
- **Query Functions** - Read on-chain data (health factor, debt, positions)
- **Utilities** - Calculate health factor, select vaults, format values

> **Note:** Since you can't interact with native BTC directly on Aave, the SDK calls go through a Controller contract that translates BTC vault operations into standard Aave actions on the Spoke (the Aave pool contract).

## Prerequisites

1. **Active BTC Vaults** - Created via `PeginManager` (see [managers quickstart](../../quickstart/managers.md))
2. **Contract Addresses** - Aave controller, spoke, reserve IDs (from config/indexer)
3. **Ethereum Wallet** - viem `WalletClient` for signing transactions

## Key Concepts

This integration uses Aave v4's lending mechanics, see the [Aave Documentation](https://docs.aave.com/) for protocol overview and guides.

### SDK-Specific Behavior

When using BTC vaults as collateral in this integration:

- **BTC Vault Status** - When a BTC vault is activated, it is automatically deposited as collateral in the user's Aave v4 position. When collateral is withdrawn, it triggers redemption.
- **Proxy Position Manager** - Aave deploys a proxy position manager contract for the user's account on first deposit to manage their position (collateral, borrows, liquidations). See the [Aave Documentation](https://docs.aave.com/) for details.
- **Position Tracking** - The position contains vault IDs with certain collateral value, and debt across reserves

**Health Factor Quick Reference:**

| Health Factor | Status  | Action                      |
| ------------- | ------- | --------------------------- |
| ≥ 1.5         | Safe    | Healthy position            |
| 1.0 - 1.5     | Warning | Consider repaying debt      |
| < 1.0         | Danger  | Position will be liquidated |

---

## Function Categories

### Transaction Builders

Build unsigned transactions. Returns `{ to, data }` for the caller to execute.

| Function                         | Purpose                                    |
| -------------------------------- | ------------------------------------------ |
| `buildBorrowTx()`                | Borrow against collateral                  |
| `buildRepayTx()`                 | Repay borrowed assets                      |
| `buildWithdrawAllCollateralTx()` | Remove all collateral (requires zero debt) |

### Query Functions

Read live on-chain state via RPC.

| Function               | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `getPosition()`        | Get position data (vaults, collateral, proxy)      |
| `getUserAccountData()` | Get health factor, collateral value, debt value    |
| `getUserTotalDebt()`   | Get exact current debt (includes accrued interest) |
| `hasDebt()`            | Check if user has debt in a reserve                |
| `hasCollateral()`      | Check if user has collateral                       |

### Utilities

Pure calculations and helpers.

| Function                  | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `selectVaultsForAmount()` | Choose optimal BTC vaults for target amount |
| `calculateHealthFactor()` | Calculate HF from values                |
| `formatHealthFactor()`    | Format HF for display                   |
| `getHealthFactorStatus()` | Get status (safe/warning/danger)        |
| `aaveValueToUsd()`        | Convert Aave base currency to USD       |

---

## When to Use What

| I want to...               | Use this function                            |
| -------------------------- | -------------------------------------------- |
| Borrow stablecoins         | `buildBorrowTx()`                            |
| Check if safe to borrow    | `getUserAccountData()` → check health factor |
| Get exact debt amount      | `getUserTotalDebt()`                         |
| Repay debt                 | `buildRepayTx()`                             |
| Check if can withdraw      | `hasDebt()` → must be false                  |
| Withdraw collateral        | `buildWithdrawAllCollateralTx()`             |

---

## Quick Example

```typescript
import {
  buildBorrowTx,
  getUserAccountData,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { parseUnits } from "viem";

// Check position health before borrowing
const accountData = await getUserAccountData(publicClient, spokeAddress, proxyAddress);
const healthFactor = Number(accountData.healthFactor) / 1e18;

// Borrow 100 USDC against BTC vault collateral
const tx = buildBorrowTx(controllerAddress, reserveId, parseUnits("100", 6), receiver);
await walletClient.sendTransaction({ to: tx.to, data: tx.data });
```

---

## Next Steps

- **[Quickstart](./quickstart.md)** - Operation sequences with examples
- **[API Reference](../../api/integrations/aave.md)** - Complete function signatures (auto-generated)
