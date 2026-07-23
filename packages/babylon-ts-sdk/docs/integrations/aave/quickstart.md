# Aave Quickstart

Operation sequences and examples for each Aave function.

> For concepts and function overview, see [README](./README.md).
> For complete function signatures, see [API Reference](../../api/integrations/aave.md).

## Setup

```typescript
import {
  // Transaction builders
  buildBorrowTx,
  buildRepayTx,
  buildWithdrawCollateralsTx,
  // Query functions
  getPosition,
  getPositionReserveTotalDebt,
  getUserAccountData,
  hasDebt,
  // Utilities
  selectVaultsForAmount,
  aaveValueToUsd,
  aaveRayValueToUsd,
  getHealthFactorStatus,
  FULL_REPAY_BUFFER_DIVISOR,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";

const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(),
  account: "0x...",
});

// You provide these (from your config/indexer)
const ADAPTER: Address = "0x...";
const SPOKE: Address = "0x...";
const VBTC_RESERVE_ID = 1n;
const USDC_RESERVE_ID = 2n;
```

---

## Operation 1: Borrow

**Sequence:** Get position → Check health → Build transaction → Execute

```typescript
// 1. Get the user's proxy address from their position
const account = walletClient.account;
if (!account) {
  throw new Error("Wallet client has no connected account configured.");
}
const userAddress: Address =
  typeof account === "string" ? account : account.address;

const position = await getPosition(publicClient, ADAPTER, userAddress);
if (!position) throw new Error("No position found");
const proxyAddress = position.proxyContract;

// 2. Check current health
const accountData = await getUserAccountData(publicClient, SPOKE, proxyAddress);

const healthFactor = Number(accountData.healthFactor) / 1e18;
const status = getHealthFactorStatus(
  healthFactor,
  accountData.borrowCount > 0n,
);

if (status !== "safe" && status !== "no_debt") {
  throw new Error(`Unsafe to borrow: ${status}`);
}

// 3. Build transaction
const amount = parseUnits("100", 6); // 100 USDC

// USDC_RESERVE_ID can be any debt reserve
const tx = buildBorrowTx(ADAPTER, USDC_RESERVE_ID, amount, userAddress);

// 4. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Borrowed amount transferred to receiver address
- Debt recorded in the borrower's Aave position
- Health factor recalculated

**Important:** Always check health factor before borrowing.

---

## Operation 2: Repay

**Sequence:** Get position → Get debt → Approve token → Build transaction → Execute

> **Gotcha:** Requires ERC20 approval before repaying!

```typescript
// 1. Get the user's proxy address from their position
const account = walletClient.account;
if (!account) {
  throw new Error("Wallet client has no connected account configured.");
}
const userAddress: Address =
  typeof account === "string" ? account : account.address;

const position = await getPosition(publicClient, ADAPTER, userAddress);
if (!position) throw new Error("No position found");
const proxyAddress = position.proxyContract;

// 2. Get the FEE-INCLUSIVE current debt from the position proxy (queried
// live). Do not size a full repayment from the Spoke's getUserTotalDebt —
// it excludes the adapter's interest fee, and repaying a plain amount can
// leave residual debt shares (dust).
const totalDebt = await getPositionReserveTotalDebt(
  publicClient,
  proxyAddress,
  USDC_RESERVE_ID,
);

// Approval headroom for interest that accrues between this query and
// transaction execution; the adapter only pulls what's actually owed.
// Ceiling division keeps ≥ 1 base unit of headroom even for dust-scale debts.
const approvalCap =
  totalDebt + (totalDebt + FULL_REPAY_BUFFER_DIVISOR - 1n) / FULL_REPAY_BUFFER_DIVISOR;

// 3. Approve token spending (required!)
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
  args: [ADAPTER, approvalCap],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });

// 4. Build transaction with the repay-all sentinel: the adapter resolves it
// to the fee-inclusive debt inside the tx and pulls exactly that, hitting
// the contract's exact full-repay branch (no rounding dust possible).
const borrower: Address = "0x..."; // Borrower's address
const tx = buildRepayTx(ADAPTER, borrower, USDC_RESERVE_ID, 2n ** 256n - 1n);

// 5. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Repayment tokens transferred from the borrower's wallet to adapter
- Debt zeroed out in the borrower's Aave position
- Health factor improves

**Partial repayment:** Pass the specific amount (and approve that amount) instead of the sentinel.

---

## Operation 3: Withdraw Collateral

**Sequence:** Get position → Verify zero debt → Build transaction → Execute

> **Gotcha:** Must repay ALL debt before withdrawing!

```typescript
// 1. Get the user's proxy address from their position
const account = walletClient.account;
if (!account) {
  throw new Error("Wallet client has no connected account configured.");
}
const userAddress: Address =
  typeof account === "string" ? account : account.address;

const position = await getPosition(publicClient, ADAPTER, userAddress);
if (!position) throw new Error("No position found");
const proxyAddress = position.proxyContract;

// 2. Verify zero debt
const userHasDebt = await hasDebt(
  publicClient,
  SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

if (userHasDebt) {
  throw new Error("Repay all debt before withdrawing");
}

// 3. Build transaction (withdraw selected vaults)
const vaultIdsToWithdraw: Hex[] = position.vaultIds; // or a subset
const tx = buildWithdrawCollateralsTx(ADAPTER, vaultIdsToWithdraw);

// 4. Execute
const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
await publicClient.waitForTransactionReceipt({ hash });
```

**What happens on-chain:**

- Collateral removed from the user's Aave position
- Vaults are automatically redeemed (triggers BTC payout)

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
console.log("Debt:", aaveRayValueToUsd(accountData.totalDebtValueRay), "USD");
console.log("Health Factor:", Number(accountData.healthFactor) / 1e18);
```

### Full Repayment (repay-all sentinel)

```typescript
// Quote the fee-inclusive debt from the position proxy to size the approval;
// send type(uint256).max as the repay amount — the adapter resolves it to the
// exact fee-inclusive debt in the same transaction and pulls only that.
const quote = await getPositionReserveTotalDebt(
  publicClient,
  proxyAddress,
  reserveId,
);
const approvalCap =
  quote + (quote + FULL_REPAY_BUFFER_DIVISOR - 1n) / FULL_REPAY_BUFFER_DIVISOR; // ceil: interest headroom
const tx = buildRepayTx(ADAPTER, borrower, reserveId, 2n ** 256n - 1n);
```

---

## Error Reference

| Error                   | Cause                         | Solution               |
| ----------------------- | ----------------------------- | ---------------------- |
| "Vault already in use"  | Vault is collateral elsewhere | Use different vault    |
| "Health factor too low" | Would become liquidatable     | Reduce borrow amount   |
| "Must have zero debt"   | Debt exists when withdrawing  | Repay all debt first   |
| "Approval required"     | Token not approved            | Call ERC20 `approve()` |

---

## Next Steps

- **[README](./README.md)** - Concepts and function overview
- **[API Reference](../../api/integrations/aave.md)** - Complete function signatures
- **[Managers Quickstart](../../quickstart/managers.md)** - Create BTC vaults first
