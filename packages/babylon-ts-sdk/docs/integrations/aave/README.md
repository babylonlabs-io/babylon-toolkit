# AAVE v4 Integration

Use BTC vaults as collateral in AAVE v4 to borrow stablecoins.

## What This Provides

The SDK provides pure functions for AAVE operations:

- **Transaction Builders** - Build unsigned transactions (you execute with your wallet)
- **Query Functions** - Read live on-chain data (health factor, debt, positions)
- **Utilities** - Calculate health factor, select vaults, format values

## Key Concepts

### Health Factor

Measures how safe your position is from liquidation.

```
Health Factor = (Collateral Value × Liquidation Threshold) / Total Debt
```

| Health Factor | Status  | Meaning                    |
| ------------- | ------- | -------------------------- |
| ∞ (no debt)   | Safe    | No borrowed assets         |
| ≥ 1.5         | Safe    | Healthy position           |
| 1.0 - 1.5     | Warning | At risk, consider repaying |
| < 1.0         | Danger  | Can be liquidated          |

### Collateral

BTC vaults can be deposited as collateral. When you add collateral:

- Vault status changes: `Available` → `InUse`
- A proxy contract is deployed for your position (first time only)
- You can borrow against the collateral value

### Position

Your AAVE lending position contains:

- **Proxy Contract** - User-specific contract holding your collateral/debt
- **Collateral** - List of vault IDs deposited
- **Debt** - Borrowed amounts per reserve

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
| `aaveValueToUsd()`        | Convert AAVE base currency to USD       |

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

## Prerequisites

1. **Active BTC Vaults** - Created via `PeginManager` (see [managers quickstart](../../quickstart/managers.md))
2. **Contract Addresses** - AAVE controller, spoke, reserve IDs (from your config/indexer)
3. **Ethereum Wallet** - viem `WalletClient` for signing transactions

---

## Installation

```bash
npm install @babylonlabs-io/ts-sdk viem
```

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
