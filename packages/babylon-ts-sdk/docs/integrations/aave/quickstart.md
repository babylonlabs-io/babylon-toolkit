# Aave Quickstart

Operation sequences and examples for each Aave function.

> For concepts and function overview, see [README](./README.md).
> For complete function signatures, see [API Reference](../../api/integrations/aave.md).

## Setup

```typescript
import {
  // Transaction builders
  buildAddCollateralTx,
  buildBorrowTx,
  buildRepayTx,
  buildWithdrawAllCollateralTx,
  buildDepositorRedeemTx,
  // Query functions
  getUserAccountData,
  getUserTotalDebt,
  hasDebt,
  // Utilities
  selectVaultsForAmount,
  aaveValueToUsd,
  getHealthFactorStatus,
  FULL_REPAY_BUFFER_BPS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { sepolia } from "viem/chains";

const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(),
  account: "0x...",
});

// You provide these (from your config/indexer)
const CONTROLLER: Address = "0x...";
const SPOKE: Address = "0x...";
const VBTC_RESERVE_ID = 1n;
const USDC_RESERVE_ID = 2n;
```

---

## Operation 1: Add Collateral

> Vaults are automatically added to your position when created (`Active` state). This operation allows adding additional vaults to an existing position.

**Sequence:** Select vaults → Build transaction → Execute

```typescript
// Your available vaults (from your data source)
const availableVaults = [
  { id: "0xabc...", amount: 0.5 },
  { id: "0xdef...", amount: 0.3 },
];

// 1. Select vaults for target amount
const { vaultIds, actualAmount } = selectVaultsForAmount(availableVaults, 0.5);
// Note: May select more than target (whole vaults only)

// 2. Build transaction
const tx = buildAddCollateralTx(CONTROLLER, vaultIds, VBTC_RESERVE_ID);

// 3. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- First time: Aave deploys your proxy contract
- Vaults transfer to controller
- Collateral added to your Aave position

---

## Operation 2: Borrow

**Sequence:** Check health → Build transaction → Execute

```typescript
// 1. Check current health (need proxy address from your position data)
const proxyAddress: Address = "0x..."; // From your position data
const accountData = await getUserAccountData(publicClient, SPOKE, proxyAddress);

const healthFactor = Number(accountData.healthFactor) / 1e18;
const status = getHealthFactorStatus(
  healthFactor,
  accountData.borrowedCount > 0n,
);

if (status !== "safe" && status !== "no_debt") {
  throw new Error(`Unsafe to borrow: ${status}`);
}

// 2. Build transaction
const positionId: Hex = "0x..."; // From your position data
const amount = parseUnits("100", 6); // 100 USDC

const account = walletClient.account;
if (!account) {
  throw new Error("Wallet client has no connected account configured.");
}
const receiver: Address =
  typeof account === "string" ? account : account.address;

const tx = buildBorrowTx(
  CONTROLLER,
  positionId,
  USDC_RESERVE_ID,
  amount,
  receiver,
);

// 3. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Borrowed amount transferred to receiver address
- Debt recorded in your Aave position
- Health factor recalculated

**Important:** Always check health factor before borrowing.

---

## Operation 3: Repay

**Sequence:** Get debt → Approve token → Build transaction → Execute

> **Gotcha:** Requires ERC20 approval before repaying!

```typescript
// 1. Get exact current debt
const proxyAddress: Address = "0x...";
const totalDebt = await getUserTotalDebt(
  publicClient,
  SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

// For full repayment, add buffer for accruing interest
const repayAmount = totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;

// 2. Approve token spending (required!)
const USDC_ADDRESS: Address = "0x..."; // USDC token contract
const approveHash = await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: [
    {
      name: "approve",
      type: "function",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
    },
  ],
  functionName: "approve",
  args: [CONTROLLER, repayAmount],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });

// 3. Build transaction
const positionId: Hex = "0x...";
const tx = buildRepayTx(CONTROLLER, positionId, USDC_RESERVE_ID, repayAmount);

// 4. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Repayment tokens transferred from your wallet to controller
- Debt reduced in your Aave position
- Health factor improves

**Partial repayment:** Pass specific amount instead of `totalDebt`.

---

## Operation 4: Withdraw Collateral

**Sequence:** Verify zero debt → Build transaction → Execute

> **Gotcha:** Must repay ALL debt before withdrawing!

```typescript
// 1. Verify zero debt
const proxyAddress: Address = "0x...";
const userHasDebt = await hasDebt(
  publicClient,
  SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

if (userHasDebt) {
  throw new Error("Repay all debt before withdrawing");
}

// 2. Build transaction (withdraws ALL collateral)
const tx = buildWithdrawAllCollateralTx(CONTROLLER, VBTC_RESERVE_ID);

// 3. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Collateral removed from your Aave position
- Vaults are automatically redeemed (triggers BTC payout)

---

## Operation 5: Redeem Vault

**Purpose:** Redeem vault back to vault provider (triggers BTC payout).

```typescript
const vaultId: Hex = "0x..."; // Vault to redeem

// Build and execute
const tx = buildDepositorRedeemTx(CONTROLLER, vaultId);
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Vault redeemed to provider
- BTC payout initiated

**Requirements:**

- Caller must be original depositor
- Vault must be withdrawn from the position first (see Operation 4)

---

## Common Patterns

### Check Health Before Borrow

```typescript
const accountData = await getUserAccountData(publicClient, SPOKE, proxyAddress);
const hf = Number(accountData.healthFactor) / 1e18;

if (hf < 1.5) {
  console.warn("Health factor too low for safe borrowing");
}
```

### Display Position Summary

```typescript
const accountData = await getUserAccountData(publicClient, SPOKE, proxyAddress);

console.log(
  "Collateral:",
  aaveValueToUsd(accountData.totalCollateralValue),
  "USD",
);
console.log("Debt:", aaveValueToUsd(accountData.totalDebtValue), "USD");
console.log("Health Factor:", Number(accountData.healthFactor) / 1e18);
```

### Full Repayment with Buffer

```typescript
const debt = await getUserTotalDebt(
  publicClient,
  SPOKE,
  reserveId,
  proxyAddress,
);
const withBuffer = debt + debt / FULL_REPAY_BUFFER_BPS; // Covers interest accrual
```

---

## Error Reference

| Error                     | Cause                         | Solution               |
| ------------------------- | ----------------------------- | ---------------------- |
| "Vault already in use"    | Vault is collateral elsewhere | Use different vault    |
| "Insufficient collateral" | Not enough for borrow amount  | Add more collateral    |
| "Health factor too low"   | Would become liquidatable     | Reduce borrow amount   |
| "Must have zero debt"     | Debt exists when withdrawing  | Repay all debt first   |
| "Approval required"       | Token not approved            | Call ERC20 `approve()` |

---

## Next Steps

- **[README](./README.md)** - Concepts and function overview
- **[API Reference](../../api/integrations/aave.md)** - Complete function signatures
- **[Managers Quickstart](../../quickstart/managers.md)** - Create BTC vaults first
