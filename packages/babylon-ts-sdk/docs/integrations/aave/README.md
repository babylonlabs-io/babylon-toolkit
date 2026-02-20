# Babylon Aave v4 Integration

Use BTC vaults as collateral in Aave v4 to borrow other assets.

## About Aave v4

Aave is a decentralized lending protocol where users can supply assets as collateral and borrow other assets against it. This SDK integration allows you to use Bitcoin vaults as collateral in Aave v4 Babylon Core Spoke.

## What This Provides

The SDK provides pure functions for Babylon's custom Aave integration:

- **Transaction Builders** - Build unsigned transactions (you execute with your wallet)
- **Query Functions** - Read on-chain data (health factor, debt, positions)
- **Utilities** - Calculate health factor, select vaults, format values

> **Note:** Under the hood, the Spoke is a standard Aave contract. Since you can't interact with native BTC directly, the Controller contract translates your vault requests into what Aave understands.

## Prerequisites

1. **Active BTC Vaults** - Created via `PeginManager` (see [managers quickstart](../../quickstart/managers.md))
2. **Contract Addresses** - Aave controller, spoke, reserve IDs (from your config/indexer)
3. **Ethereum Wallet** - viem `WalletClient` for signing transactions

## Key Concepts

This integration uses Aave v4's lending mechanics, see the [Aave Documentation](https://docs.aave.com/) for protocol overview and guides.

### SDK-Specific Behavior

When using BTC vaults as collateral in this integration:

- **Vault Status** - When you create a vault (becomes Active), it automatically goes into the position. When you withdraw, it triggers redemption.
- **Proxy Contract** - Aave deploys a proxy contract for your account on first deposit to manage your position (collateral, borrows, liquidations). See public docs for details.
- **Position Tracking** - Your position tracks vault IDs, collateral value, and debt across reserves

**Health Factor Quick Reference:**

| Health Factor | Status  | Action                      |
| ------------- | ------- | --------------------------- |
| ≥ 1.5         | Safe    | Healthy position            |
| 1.0 - 1.5     | Warning | Consider repaying debt      |
| < 1.0         | Danger  | Position will be liquidated |

---

## Function Categories

### Transaction Builders

Build unsigned transactions. Returns `{ to, data }` for you to execute.

| Function                         | Purpose                                    |
| -------------------------------- | ------------------------------------------ |
| `buildAddCollateralTx()`         | Add BTC vaults as collateral               |
| `buildBorrowTx()`                | Borrow against collateral                  |
| `buildRepayTx()`                 | Repay borrowed assets                      |
| `buildWithdrawAllCollateralTx()` | Remove all collateral (requires zero debt) |
| `buildDepositorRedeemTx()`       | Redeem vault to vault provider             |

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
| `selectVaultsForAmount()` | Choose optimal vaults for target amount |
| `calculateHealthFactor()` | Calculate HF from values                |
| `formatHealthFactor()`    | Format HF for display                   |
| `getHealthFactorStatus()` | Get status (safe/warning/danger)        |
| `aaveValueToUsd()`        | Convert Aave base currency to USD       |

---

## When to Use What

| I want to...               | Use this function                            |
| -------------------------- | -------------------------------------------- |
| Add vaults as collateral   | `buildAddCollateralTx()`                     |
| Choose which vaults to use | `selectVaultsForAmount()`                    |
| Borrow stablecoins         | `buildBorrowTx()`                            |
| Check if safe to borrow    | `getUserAccountData()` → check health factor |
| Get exact debt amount      | `getUserTotalDebt()`                         |
| Repay debt                 | `buildRepayTx()`                             |
| Check if can withdraw      | `hasDebt()` → must be false                  |
| Withdraw collateral        | `buildWithdrawAllCollateralTx()`             |
| Redeem vault for BTC       | `buildDepositorRedeemTx()`                   |

---

## Quick Example

```typescript
import {
  buildAddCollateralTx,
  selectVaultsForAmount,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Select vaults for 0.5 BTC
const { vaultIds } = selectVaultsForAmount(availableVaults, 0.5);

// Build transaction
const tx = buildAddCollateralTx(controllerAddress, vaultIds, reserveId);

// Execute with your wallet
await walletClient.sendTransaction({ to: tx.to, data: tx.data });
```

---

## Next Steps

- **[Quickstart](./quickstart.md)** - Operation sequences with examples
- **[API Reference](../../api/integrations/aave.md)** - Complete function signatures (auto-generated)
