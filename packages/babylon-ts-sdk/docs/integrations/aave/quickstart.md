# Quickstart: AAVE Integration SDK

Step-by-step examples for using each SDK function.

> 💡 **Looking for a complete integration?** This guide shows SDK function usage with placeholder data. For full end-to-end implementation including indexer integration, see the **[Full Integration Guide](./integration-guide.md)**.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup](#setup)
3. [Operation 1: Add Collateral](#operation-1-add-collateral)
4. [Operation 2: Borrow Against Collateral](#operation-2-borrow-against-collateral)
5. [Operation 3: Repay Debt](#operation-3-repay-debt)
6. [Operation 4: Withdraw Collateral](#operation-4-withdraw-collateral)
7. [Operation 5: Redeem Vault](#operation-5-redeem-vault)
8. [Complete React Example](#complete-react-example)
9. [Error Handling](#error-handling)
10. [Testing Your Integration](#testing-your-integration)

---

## Prerequisites

### Required

- **Ethereum wallet** - viem `WalletClient` for signing transactions
- **Active BTC vaults** - Completed TBV peg-in flow (see [peg-in guide](../../quickstart/managers.md))
- **Contract addresses** - AAVE controller, spoke, and reserve IDs (get from AAVE team or indexer)

### Installation

```bash
npm install @babylonlabs-io/ts-sdk viem
```

### Data Requirements

You'll need to provide:

- Contract addresses (controller, spoke, reserve IDs)
- Available vaults for collateral
- User positions

**How to get this data**: See the **[Integration Guide](./integration-guide.md)** for complete examples using the Babylon GraphQL indexer.

---

## Setup

### Import SDK Functions

```typescript
import {
  // Transaction builders
  buildAddCollateralTx,
  buildBorrowTx,
  buildRepayTx,
  buildWithdrawAllCollateralTx,
  buildDepositorRedeemTx,

  // Query functions
  getPosition,
  getUserAccountData,
  getUserPosition,
  getUserTotalDebt,
  hasDebt,
  hasCollateral,

  // Utilities
  calculateHealthFactor,
  selectVaultsForAmount,
  calculateTotalVaultAmount,
  formatHealthFactor,
  getHealthFactorStatus,
  getHealthFactorColor,
  isHealthFactorHealthy,
  aaveValueToUsd,
  wadToNumber,

  // Constants
  FULL_REPAY_BUFFER_BPS,
  HEALTH_FACTOR_WARNING_THRESHOLD,
  MIN_HEALTH_FACTOR_FOR_BORROW,

  // ABIs
  AaveIntegrationControllerABI,
  AaveSpokeABI,

  // Types
  type AaveMarketPosition,
  type AaveSpokeUserAccountData,
  type AaveSpokeUserPosition,
  type TransactionParams,
  type SelectableVault,
  type VaultSelectionResult,
  type HealthFactorStatus,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
```

### Initialize Clients

```typescript
// Public client for reading contracts (no wallet needed)
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// Wallet client for signing transactions (requires connected wallet)
const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(),
  account: "0x...", // Your Ethereum account address
});
```

### Contract Addresses

You'll need contract addresses and reserve IDs. For this quickstart, we'll use placeholders:

```typescript
// These would come from your indexer integration
// See Integration Guide for how to fetch these: ./integration-guide.md
const AAVE_CONTROLLER: Address = "0x..."; // AaveIntegrationController
const AAVE_SPOKE: Address = "0x..."; // AaveSpoke
const VBTC_RESERVE_ID = 1n; // vBTC reserve ID
const USDC_RESERVE_ID = 2n; // USDC reserve ID
```

---

## Operation 1: Add Collateral

Deposit BTC vaults into your AAVE position as collateral.

### Step 1: Get Available Vaults

First, you need your available vaults. This data comes from the indexer (see [Integration Guide](./integration-guide.md) for details):

```typescript
// Example vault data (would come from indexer)
const availableVaults: SelectableVault[] = [
  { id: "0xabc...", amount: 0.5 }, // 0.5 BTC
  { id: "0xdef...", amount: 0.3 }, // 0.3 BTC
  { id: "0x123...", amount: 0.2 }, // 0.2 BTC
];
```

### Step 2: Select Vaults Using SDK

Use the SDK's vault selection utility to choose which vaults to use:

```typescript
// Select vaults to reach target amount (e.g., 0.6 BTC)
const targetBtc = 0.6;
const { vaultIds, actualAmount } = selectVaultsForAmount(
  availableVaults,
  targetBtc,
);

console.log(`Selected ${vaultIds.length} vaults`);
console.log(`Target: ${targetBtc} BTC, Actual: ${actualAmount} BTC`);
// Output: Selected 2 vaults
//         Target: 0.6 BTC, Actual: 0.8 BTC
// (Algorithm picks largest vaults first: 0.5 + 0.3 = 0.8)
```

**Note**: The algorithm may select more than the target amount since it selects whole vaults.

### Step 3: Build Transaction

```typescript
// Build unsigned transaction
const txParams: TransactionParams = buildAddCollateralTx(
  AAVE_CONTROLLER,
  vaultIds as Hex[], // Convert string[] to Hex[]
  VBTC_RESERVE_ID,
);

console.log("Transaction to:", txParams.to);
console.log("Transaction data:", txParams.data);
```

### Step 4: Execute Transaction

```typescript
try {
  // Send transaction
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  console.log(`Transaction sent: ${hash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log("✅ Collateral added successfully!");
    console.log(`Gas used: ${receipt.gasUsed}`);
  } else {
    console.error("❌ Transaction reverted");
  }
} catch (error) {
  console.error("Transaction failed:", error);
  throw error;
}
```

### What Happens On-Chain

1. **First time**: AAVE deploys your proxy contract automatically
2. Vaults transfer ownership: User → AAVE Controller
3. Vault status changes: `Available (0)` → `InUse (1)`
4. Position created/updated with new collateral
5. `CollateralAdded` event emitted

### Complete Add Collateral Function

```typescript
async function addCollateral(
  vaultIds: string[],
  reserveId: bigint,
): Promise<string> {
  // Build transaction
  const txParams = buildAddCollateralTx(
    AAVE_CONTROLLER,
    vaultIds as Hex[],
    reserveId,
  );

  // Execute
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("Transaction failed");
  }

  console.log(`✅ Added ${vaultIds.length} vaults as collateral`);
  return hash;
}

// Usage
const hash = await addCollateral(vaultIds, VBTC_RESERVE_ID);
```

---

## Operation 2: Borrow Against Collateral

Borrow stablecoins (e.g., USDC) against your BTC collateral.

### Step 1: Get Position Info

```typescript
// Position ID is returned from addCollateral or fetch from indexer
// For this example, assume we have it
const positionId: Hex = "0x..."; // bytes32 position ID

// Get position details
const position: AaveMarketPosition | null = await getPosition(
  publicClient,
  AAVE_CONTROLLER,
  positionId,
);

if (!position) {
  throw new Error("Position not found");
}

console.log("Position details:");
console.log("  Depositor:", position.depositor.ethAddress);
console.log("  Proxy contract:", position.proxyContract);
console.log("  Total collateral:", position.totalCollateral, "satoshis");
console.log("  Vault count:", position.vaultIds.length);
```

### Step 2: Check Account Health

```typescript
// Get live account data from AAVE Spoke
const accountData: AaveSpokeUserAccountData = await getUserAccountData(
  publicClient,
  AAVE_SPOKE,
  position.proxyContract,
);

// Convert to human-readable values
const healthFactor = Number(accountData.healthFactor) / 1e18;
const collateralUsd = aaveValueToUsd(accountData.totalCollateralValue);
const currentDebtUsd = aaveValueToUsd(accountData.totalDebtValue);

console.log(`Health Factor: ${healthFactor.toFixed(2)}`);
console.log(`Collateral: $${collateralUsd.toFixed(2)}`);
console.log(`Current Debt: $${currentDebtUsd.toFixed(2)}`);

// Check if healthy
const status = getHealthFactorStatus(
  healthFactor,
  accountData.borrowedCount > 0n,
);
console.log(`Status: ${status}`); // "safe" | "warning" | "danger" | "no_debt"
```

### Step 3: Calculate Safe Borrow Amount

```typescript
// Get liquidation threshold from AAVE reserve config (example: 80%)
// In production, fetch from AAVE config endpoint or indexer
const liquidationThresholdBps = 8000; // 80% = 8000 basis points

// Calculate max borrow to maintain health factor above 1.5 (safe threshold)
const targetHealthFactor = HEALTH_FACTOR_WARNING_THRESHOLD; // 1.5
const maxAdditionalDebtUsd =
  (collateralUsd * (liquidationThresholdBps / 10000)) / targetHealthFactor -
  currentDebtUsd;

console.log(`Max safe additional borrow: $${maxAdditionalDebtUsd.toFixed(2)}`);

// Use 80% of max for extra safety
const safeBorrowAmountUsd = maxAdditionalDebtUsd * 0.8;
console.log(`Recommended borrow: $${safeBorrowAmountUsd.toFixed(2)}`);

// Convert to USDC (6 decimals)
const borrowAmountUsdc = parseUnits(
  Math.floor(safeBorrowAmountUsd).toString(),
  6,
);
```

### Step 4: Build and Execute Borrow Transaction

```typescript
// Build borrow transaction
const receiverAddress: Address = walletClient.account!.address;

const txParams = buildBorrowTx(
  AAVE_CONTROLLER,
  positionId,
  USDC_RESERVE_ID,
  borrowAmountUsdc,
  receiverAddress,
);

// Execute
try {
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  console.log(`Borrow transaction: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log(`✅ Borrowed ${formatUnits(borrowAmountUsdc, 6)} USDC`);
  }
} catch (error) {
  console.error("Borrow failed:", error);
  throw error;
}
```

### Complete Borrow Function

```typescript
async function borrowAgainstCollateral(
  positionId: Hex,
  debtReserveId: bigint,
  amountUsd: number,
  decimals: number = 6,
): Promise<string> {
  // Convert USD to token amount
  const amount = parseUnits(amountUsd.toString(), decimals);

  // Get receiver address
  const receiver = walletClient.account!.address;

  // Build transaction
  const txParams = buildBorrowTx(
    AAVE_CONTROLLER,
    positionId,
    debtReserveId,
    amount,
    receiver,
  );

  // Execute
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("Borrow transaction failed");
  }

  console.log(`✅ Borrowed $${amountUsd}`);
  return hash;
}

// Usage
const hash = await borrowAgainstCollateral(positionId, USDC_RESERVE_ID, 100);
```

---

## Operation 3: Repay Debt

Repay borrowed assets (partial or full repayment).

### Step 1: Check Current Debt

```typescript
// Get exact current debt amount (includes accrued interest)
const totalDebt: bigint = await getUserTotalDebt(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  position.proxyContract,
);

console.log(`Total debt: ${totalDebt} (in token units)`);

// For display (USDC has 6 decimals)
const debtInUsdc = formatUnits(totalDebt, 6);
console.log(`Total debt: ${debtInUsdc} USDC`);
```

### Step 2: Approve Token Spending

**IMPORTANT**: User must approve the AAVE controller to spend their tokens.

```typescript
// ERC20 ABI for approve function
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// USDC token address (get from AAVE config)
const USDC_ADDRESS: Address = "0x..."; // USDC token contract

// For full repayment, add small buffer to account for interest accrual
// between fetching debt and transaction execution
const repayAmount = totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;

// Approve controller to spend USDC
try {
  const approveHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [AAVE_CONTROLLER, repayAmount],
  });

  console.log(`Approval transaction: ${approveHash}`);

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("✅ Token approval complete");
} catch (error) {
  console.error("Approval failed:", error);
  throw error;
}
```

### Step 3: Build and Execute Repay Transaction

```typescript
// Build repay transaction
const txParams = buildRepayTx(
  AAVE_CONTROLLER,
  positionId,
  USDC_RESERVE_ID,
  repayAmount,
);

// Execute
try {
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  console.log(`Repay transaction: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log(`✅ Repaid ${formatUnits(repayAmount, 6)} USDC`);
  }
} catch (error) {
  console.error("Repay failed:", error);
  throw error;
}
```

### Complete Repay Function

```typescript
async function repayDebt(
  positionId: Hex,
  debtReserveId: bigint,
  tokenAddress: Address,
  decimals: number = 6,
  partialAmount?: bigint,
): Promise<string> {
  // Get position
  const position = await getPosition(publicClient, AAVE_CONTROLLER, positionId);
  if (!position) throw new Error("Position not found");

  // Get total debt
  const totalDebt = await getUserTotalDebt(
    publicClient,
    AAVE_SPOKE,
    debtReserveId,
    position.proxyContract,
  );

  // Determine repay amount (partial or full)
  const amount = partialAmount ?? totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;

  // Approve tokens
  const ERC20_ABI = [
    {
      name: "approve",
      type: "function",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const;

  const approveHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [AAVE_CONTROLLER, amount],
  });

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("✅ Approval complete");

  // Build repay transaction
  const txParams = buildRepayTx(
    AAVE_CONTROLLER,
    positionId,
    debtReserveId,
    amount,
  );

  // Execute
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("Repay transaction failed");
  }

  console.log(`✅ Repaid ${formatUnits(amount, decimals)} tokens`);
  return hash;
}

// Usage - Full repayment
const hash = await repayDebt(positionId, USDC_RESERVE_ID, USDC_ADDRESS, 6);

// Usage - Partial repayment
const partialAmount = parseUnits("50", 6); // Repay 50 USDC
const hash2 = await repayDebt(
  positionId,
  USDC_RESERVE_ID,
  USDC_ADDRESS,
  6,
  partialAmount,
);
```

---

## Operation 4: Withdraw Collateral

Remove BTC vaults from AAVE (requires zero debt).

### Step 1: Verify Zero Debt

```typescript
// Check if user has any debt in the reserve
const userHasDebt = await hasDebt(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  position.proxyContract,
);

if (userHasDebt) {
  throw new Error(
    "Cannot withdraw collateral while debt exists. Repay all debt first.",
  );
}

console.log("✅ No debt - safe to withdraw");
```

### Step 2: Build and Execute Withdraw Transaction

```typescript
// Build withdraw transaction (withdraws ALL collateral for the reserve)
const txParams = buildWithdrawAllCollateralTx(AAVE_CONTROLLER, VBTC_RESERVE_ID);

// Execute
try {
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  console.log(`Withdraw transaction: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log("✅ Collateral withdrawn successfully");
    console.log("Vaults are now back to Available status");
  }
} catch (error) {
  console.error("Withdraw failed:", error);
  throw error;
}
```

### Complete Withdraw Function

```typescript
async function withdrawCollateral(
  positionId: Hex,
  reserveId: bigint,
): Promise<string> {
  // Get position
  const position = await getPosition(publicClient, AAVE_CONTROLLER, positionId);
  if (!position) throw new Error("Position not found");

  // Verify zero debt across all reserves
  // Note: In production, check all reserves user has borrowed from
  const userHasDebt = await hasDebt(
    publicClient,
    AAVE_SPOKE,
    USDC_RESERVE_ID,
    position.proxyContract,
  );

  if (userHasDebt) {
    throw new Error("Cannot withdraw with outstanding debt. Repay first.");
  }

  // Build withdraw transaction
  const txParams = buildWithdrawAllCollateralTx(AAVE_CONTROLLER, reserveId);

  // Execute
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("Withdraw transaction failed");
  }

  console.log("✅ Withdrew all collateral");
  return hash;
}

// Usage
const hash = await withdrawCollateral(positionId, VBTC_RESERVE_ID);
```

---

## Operation 5: Redeem Vault

Redeem individual vault back to vault provider (for original depositors only).

**Important**: This is different from withdrawing collateral. Redeem triggers the vault provider to pay out BTC on the Bitcoin network.

```typescript
async function redeemVault(vaultId: Hex): Promise<string> {
  // Build redeem transaction
  const txParams = buildDepositorRedeemTx(AAVE_CONTROLLER, vaultId);

  // Execute
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
    chain: sepolia,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("Redeem transaction failed");
  }

  console.log("✅ Vault redemption initiated");
  console.log("Vault provider will process Bitcoin payout");
  return hash;
}

// Usage
const vaultIdToRedeem: Hex = "0x..."; // Vault ID (peg-in tx hash)
const hash = await redeemVault(vaultIdToRedeem);
```

**Requirements**:

- Caller must be original depositor (who did the peg-in)
- Vault must be in `Available` status (not in use by AAVE)

---

## Complete React Example

Full React component demonstrating all AAVE operations:

```typescript
import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  buildAddCollateralTx,
  buildBorrowTx,
  buildRepayTx,
  buildWithdrawAllCollateralTx,
  getPosition,
  getUserAccountData,
  getUserTotalDebt,
  selectVaultsForAmount,
  formatHealthFactor,
  getHealthFactorStatus,
  getHealthFactorColor,
  aaveValueToUsd,
  type AaveMarketPosition,
  type AaveSpokeUserAccountData,
  type SelectableVault,
  type HealthFactorStatus,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { parseUnits, formatUnits, type Address, type Hex } from "viem";

const AAVE_CONTROLLER: Address = "0x...";
const AAVE_SPOKE: Address = "0x...";
const VBTC_RESERVE_ID = 1n;
const USDC_RESERVE_ID = 2n;
const USDC_ADDRESS: Address = "0x...";

interface AavePositionProps {
  positionId?: string;
  availableVaults: SelectableVault[];
}

export function AavePositionManager({
  positionId: initialPositionId,
  availableVaults,
}: AavePositionProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [positionId, setPositionId] = useState<string>(initialPositionId || "");
  const [position, setPosition] = useState<AaveMarketPosition | null>(null);
  const [accountData, setAccountData] = useState<AaveSpokeUserAccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch position data
  const fetchPosition = async () => {
    if (!positionId || !publicClient) return;

    try {
      const pos = await getPosition(
        publicClient,
        AAVE_CONTROLLER,
        positionId as Hex
      );

      if (pos) {
        setPosition(pos);

        const accData = await getUserAccountData(
          publicClient,
          AAVE_SPOKE,
          pos.proxyContract
        );
        setAccountData(accData);
      } else {
        setError("Position not found");
      }
    } catch (err) {
      console.error("Failed to fetch position:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch position");
    }
  };

  useEffect(() => {
    fetchPosition();
  }, [positionId, publicClient]);

  // Add collateral
  const handleAddCollateral = async (targetBtc: number) => {
    if (!walletClient || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Select vaults
      const { vaultIds } = selectVaultsForAmount(availableVaults, targetBtc);

      if (vaultIds.length === 0) {
        throw new Error("No vaults available for target amount");
      }

      // Build transaction
      const txParams = buildAddCollateralTx(
        AAVE_CONTROLLER,
        vaultIds as Hex[],
        VBTC_RESERVE_ID
      );

      // Execute
      const hash = await walletClient.sendTransaction({
        to: txParams.to,
        data: txParams.data,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Refresh data
      await fetchPosition();

      alert(`Successfully added ${vaultIds.length} vaults as collateral!`);
    } catch (err) {
      console.error("Add collateral failed:", err);
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  // Borrow
  const handleBorrow = async (amountUsdc: number) => {
    if (!walletClient || !publicClient || !positionId || !address) {
      setError("Wallet not connected or position not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const amount = parseUnits(amountUsdc.toString(), 6);

      const txParams = buildBorrowTx(
        AAVE_CONTROLLER,
        positionId as Hex,
        USDC_RESERVE_ID,
        amount,
        address
      );

      const hash = await walletClient.sendTransaction({
        to: txParams.to,
        data: txParams.data,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await fetchPosition();

      alert(`Successfully borrowed ${amountUsdc} USDC!`);
    } catch (err) {
      console.error("Borrow failed:", err);
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  // Repay
  const handleRepay = async (amountUsdc: number) => {
    if (!walletClient || !publicClient || !positionId || !position) {
      setError("Wallet not connected or position not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const amount = parseUnits(amountUsdc.toString(), 6);

      // Approve first
      const ERC20_ABI = [
        {
          name: "approve",
          type: "function",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ] as const;

      const approveHash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [AAVE_CONTROLLER, amount],
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // Repay
      const txParams = buildRepayTx(
        AAVE_CONTROLLER,
        positionId as Hex,
        USDC_RESERVE_ID,
        amount
      );

      const hash = await walletClient.sendTransaction({
        to: txParams.to,
        data: txParams.data,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await fetchPosition();

      alert(`Successfully repaid ${amountUsdc} USDC!`);
    } catch (err) {
      console.error("Repay failed:", err);
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  // Calculate display values
  const healthFactorValue = accountData
    ? Number(accountData.healthFactor) / 1e18
    : null;
  const collateralUsd = accountData
    ? aaveValueToUsd(accountData.totalCollateralValue)
    : 0;
  const debtUsd = accountData ? aaveValueToUsd(accountData.totalDebtValue) : 0;
  const healthFactorStatus: HealthFactorStatus = healthFactorValue
    ? getHealthFactorStatus(healthFactorValue, accountData!.borrowedCount > 0n)
    : "no_debt";
  const statusColor = getHealthFactorColor(healthFactorStatus);

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>AAVE Position Manager</h1>

      {error && (
        <div style={{ color: "red", padding: "10px", marginBottom: "20px" }}>
          ❌ Error: {error}
        </div>
      )}

      {/* Position Info */}
      {position && accountData && (
        <div style={{ background: "#f5f5f5", padding: "20px", marginBottom: "20px" }}>
          <h2>Position Status</h2>
          <p><strong>Position ID:</strong> {positionId.slice(0, 10)}...</p>
          <p><strong>Proxy Contract:</strong> {position.proxyContract}</p>
          <p><strong>Vaults:</strong> {position.vaultIds.length} vaults</p>
          <hr />
          <p><strong>Collateral Value:</strong> ${collateralUsd.toFixed(2)}</p>
          <p><strong>Debt Value:</strong> ${debtUsd.toFixed(2)}</p>
          <p>
            <strong>Health Factor:</strong>{" "}
            <span style={{ color: statusColor, fontWeight: "bold" }}>
              {formatHealthFactor(healthFactorValue)} ({healthFactorStatus})
            </span>
          </p>
        </div>
      )}

      {/* Actions */}
      <div>
        <h2>Actions</h2>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => handleAddCollateral(0.5)}
            disabled={loading}
            style={{ padding: "10px 20px" }}
          >
            Add 0.5 BTC Collateral
          </button>
          <button
            onClick={() => handleBorrow(100)}
            disabled={loading || !position}
            style={{ padding: "10px 20px" }}
          >
            Borrow 100 USDC
          </button>
          <button
            onClick={() => handleRepay(50)}
            disabled={loading || !position}
            style={{ padding: "10px 20px" }}
          >
            Repay 50 USDC
          </button>
        </div>
        {loading && <p>Processing transaction...</p>}
      </div>

      {/* Position ID Input */}
      <div style={{ marginTop: "30px" }}>
        <h3>Load Position</h3>
        <input
          type="text"
          placeholder="Enter position ID (0x...)"
          value={positionId}
          onChange={(e) => setPositionId(e.target.value)}
          style={{ width: "100%", padding: "10px" }}
        />
        <button
          onClick={fetchPosition}
          style={{ marginTop: "10px", padding: "10px 20px" }}
        >
          Load Position
        </button>
      </div>
    </div>
  );
}
```

---

## Error Handling

### Common Errors

| Error                     | Cause                                     | Solution                                  |
| ------------------------- | ----------------------------------------- | ----------------------------------------- |
| "Vault already in use"    | Vault is collateralizing another position | Use different vault                       |
| "Insufficient collateral" | Not enough collateral for borrow amount   | Add more collateral or borrow less        |
| "Health factor too low"   | Borrow would make position liquidatable   | Reduce borrow amount or add collateral    |
| "Must have zero debt"     | Trying to withdraw with outstanding debt  | Repay all debt first                      |
| "Approval required"       | Token spending not approved               | Call `approve()` on ERC20 token           |
| "Position doesn't exist"  | Invalid position ID                       | Create position first with add collateral |
| "User rejected"           | User cancelled in wallet                  | User action, retry if needed              |
| "Insufficient funds"      | Not enough ETH for gas                    | Add ETH to wallet                         |

### Error Handling Pattern

```typescript
async function safeExecuteTransaction(
  txParams: TransactionParams,
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const hash = await walletClient.sendTransaction({
      to: txParams.to,
      data: txParams.data,
      chain: sepolia,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      return { success: false, error: "Transaction reverted" };
    }

    return { success: true, hash };
  } catch (error: any) {
    console.error("Transaction failed:", error);

    // Parse viem error messages
    if (error.message?.includes("User rejected")) {
      return { success: false, error: "User cancelled transaction" };
    }

    if (error.message?.includes("insufficient funds")) {
      return { success: false, error: "Insufficient ETH for gas" };
    }

    if (error.message?.includes("execution reverted")) {
      // Extract revert reason if available
      const reason =
        error.message.match(/reason: (.+)/)?.[1] || "Contract reverted";
      return { success: false, error: reason };
    }

    return { success: false, error: error.message || "Unknown error" };
  }
}

// Usage
const result = await safeExecuteTransaction(txParams);
if (!result.success) {
  alert(`Transaction failed: ${result.error}`);
} else {
  console.log(`Success! Hash: ${result.hash}`);
}
```

---

## Testing Your Integration

### 1. Testnet Setup

- **Network**: Use Sepolia testnet
- **Testnet ETH**: Get from [Sepolia faucet](https://sepoliafaucet.com/)
- **Testnet USDC**: Get from AAVE faucet or testnet faucet
- **BTC Vaults**: Complete peg-in flow on Signet ([guide](../../quickstart/managers.md))

### 2. Test Sequence

Follow this sequence to test all operations:

```typescript
// 1. Add collateral
await addCollateral(vaultIds, VBTC_RESERVE_ID);
// ✅ Verify: Position created, vaults in "InUse" status

// 2. Check health factor
const accountData = await getUserAccountData(...);
const hf = Number(accountData.healthFactor) / 1e18;
// ✅ Verify: HF should be Infinity (no debt yet)

// 3. Borrow small amount
await borrowAgainstCollateral(positionId, USDC_RESERVE_ID, 100);
// ✅ Verify: HF decreases but stays > 1.5

// 4. Check updated health factor
// ✅ Verify: HF now shows finite value, status is "safe"

// 5. Repay partial
await repayDebt(positionId, USDC_RESERVE_ID, USDC_ADDRESS, 6, parseUnits("50", 6));
// ✅ Verify: Debt reduced, HF increased

// 6. Repay full
await repayDebt(positionId, USDC_RESERVE_ID, USDC_ADDRESS, 6);
// ✅ Verify: Debt is zero, HF back to Infinity

// 7. Withdraw collateral
await withdrawCollateral(positionId, VBTC_RESERVE_ID);
// ✅ Verify: Vaults back to "Available" status
```

### 3. Monitor Contract Events

Listen to contract events for confirmation:

```typescript
// Watch for CollateralAdded events
publicClient.watchContractEvent({
  address: AAVE_CONTROLLER,
  abi: AaveIntegrationControllerABI,
  eventName: "CollateralAdded",
  onLogs: (logs) => {
    console.log("Collateral added:", logs);
  },
});

// Watch for Borrowed events
publicClient.watchContractEvent({
  address: AAVE_CONTROLLER,
  abi: AaveIntegrationControllerABI,
  eventName: "Borrowed",
  onLogs: (logs) => {
    console.log("Borrowed:", logs);
  },
});
```

---

## Next Steps

- **[Full Integration Guide](./integration-guide.md)** - Complete implementation with indexer + SDK
- **[API Reference](../../api/integrations/aave.md)** - Complete function documentation
- **[TBV Peg-In Guide](../../quickstart/managers.md)** - Create BTC vaults
- **[README](./README.md)** - Architecture overview and concepts
