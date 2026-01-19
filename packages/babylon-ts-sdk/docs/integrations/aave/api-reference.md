# AAVE Integration API Reference

Complete reference for all functions, types, and constants in the AAVE SDK integration.

---

## Overview

The AAVE integration provides **24 functions** organized into 3 categories:

- **Transaction Builders (5)** - Build unsigned transactions for wallet execution
- **Query Functions (6)** - Read on-chain state and position data
- **Utility Functions (13)** - Pure calculations and UI helpers

Plus **9 TypeScript interfaces**, **10+ constants**, and **2 contract ABIs**.

---

## Transaction Builders

Functions that build unsigned transactions. All return `TransactionParams` for execution with viem wallet.

### buildAddCollateralTx()

Build transaction to add BTC vaults as collateral to AAVE position.

**Creates new position on first call**, or adds to existing position for the given reserve.

```typescript
function buildAddCollateralTx(
  contractAddress: Address,
  vaultIds: Hex[],
  reserveId: bigint,
): TransactionParams;
```

**Parameters:**

- `contractAddress` (`Address`) - AaveIntegrationController contract address
- `vaultIds` (`Hex[]`) - Array of vault IDs (peg-in transaction hashes) to use as collateral
  - Format: `0x${string}` (bytes32 hex values)
  - Vaults must be in "Available" status (not in use, not redeemed)
- `reserveId` (`bigint`) - AAVE reserve ID for the collateral
  - Example: `1n` for vBTC reserve
  - Get from AAVE config or indexer

**Returns:** `TransactionParams`

```typescript
{
  to: Address;      // Contract address to call
  data: Hex;        // Encoded function data
  value?: bigint;   // Always undefined for this function
}
```

**Usage:**

```typescript
import { buildAddCollateralTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const txParams = buildAddCollateralTx(
  "0x123...", // AAVE controller address
  ["0xabc...", "0xdef..."], // Vault IDs
  1n, // vBTC reserve ID
);

// Execute with wallet
const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

**What happens on-chain:**

1. If first time: Deploys user's proxy contract via AAVE
2. Transfers vault ownership from user to AAVE controller
3. Vault status changes: `Available (0)` → `InUse (1)`
4. Creates or updates position with new collateral
5. Emits `CollateralAdded` event

**Errors:**

- Vault already in use by another position
- Vault doesn't exist or already redeemed
- User doesn't own the vault
- Reserve ID invalid

---

### buildWithdrawAllCollateralTx()

Build transaction to withdraw all vBTC collateral from AAVE position.

**Requires zero debt** - position must have no outstanding borrows.

```typescript
function buildWithdrawAllCollateralTx(
  contractAddress: Address,
  reserveId: bigint,
): TransactionParams;
```

**Parameters:**

- `contractAddress` (`Address`) - AaveIntegrationController contract address
- `reserveId` (`bigint`) - AAVE reserve ID for the collateral
  - Must match the reserve used when adding collateral

**Returns:** `TransactionParams`

**Usage:**

```typescript
import {
  buildWithdrawAllCollateralTx,
  hasDebt,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Check for debt first
const userHasDebt = await hasDebt(
  publicClient,
  spokeAddress,
  USDC_RESERVE_ID,
  proxyAddress,
);
if (userHasDebt) {
  throw new Error("Cannot withdraw with outstanding debt");
}

// Build withdrawal transaction
const txParams = buildWithdrawAllCollateralTx(
  "0x123...", // Controller address
  1n, // vBTC reserve ID
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

**What happens on-chain:**

1. Verifies user has zero debt across all reserves
2. Withdraws all vBTC collateral from AAVE spoke
3. Transfers vault ownership back to user
4. Vault status changes: `InUse (1)` → `Available (0)`
5. Emits `CollateralWithdrawn` event

**Errors:**

- User has outstanding debt
- Position doesn't exist
- No collateral to withdraw

---

### buildBorrowTx()

Build transaction to borrow assets against vBTC collateral.

```typescript
function buildBorrowTx(
  contractAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
  receiver: Address,
): TransactionParams;
```

**Parameters:**

- `contractAddress` (`Address`) - AaveIntegrationController contract address
- `positionId` (`Hex`) - Position ID (bytes32)
  - Get from `getPosition()` or indexer after adding collateral
- `debtReserveId` (`bigint`) - AAVE reserve ID for the debt asset
  - Example: `2n` for USDC reserve
- `amount` (`bigint`) - Amount to borrow in token units (with decimals)
  - For USDC (6 decimals): `100000000n` = 100 USDC
  - Use `parseUnits()` from viem to convert from human-readable
- `receiver` (`Address`) - Address to receive borrowed tokens
  - Usually the user's address

**Returns:** `TransactionParams`

**Usage:**

```typescript
import { buildBorrowTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { parseUnits } from "viem";

// Borrow 100 USDC (6 decimals)
const borrowAmount = parseUnits("100", 6);

const txParams = buildBorrowTx(
  "0x123...", // Controller address
  "0xabc...", // Position ID
  2n, // USDC reserve ID
  borrowAmount,
  "0x456...", // Receiver address
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

**What happens on-chain:**

1. Checks health factor won't drop below liquidation threshold
2. Mints debt tokens to user's proxy contract
3. Transfers borrowed asset to receiver address
4. Updates position debt
5. Emits `Borrowed` event

**Errors:**

- Borrow would make health factor < 1.0
- Insufficient collateral
- Reserve doesn't exist
- Position doesn't exist

**Important:** Calculate safe borrow amount using `calculateHealthFactor()` to avoid liquidation.

---

### buildRepayTx()

Build transaction to repay debt on AAVE position.

**Requires token approval** - user must approve controller to spend debt token first.

```typescript
function buildRepayTx(
  contractAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
): TransactionParams;
```

**Parameters:**

- `contractAddress` (`Address`) - AaveIntegrationController contract address
- `positionId` (`Hex`) - Position ID with debt (bytes32)
- `debtReserveId` (`bigint`) - AAVE reserve ID for the debt asset
- `amount` (`bigint`) - Amount to repay in token units
  - Can repay partial or full debt
  - For full repay, use `getUserTotalDebt()` to get exact amount

**Returns:** `TransactionParams`

**Usage:**

```typescript
import {
  buildRepayTx,
  getUserTotalDebt,
  FULL_REPAY_BUFFER_BPS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Get exact current debt
const totalDebt = await getUserTotalDebt(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

// Add buffer for full repayment (accounts for interest accrual)
const repayAmount = totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;

// IMPORTANT: Approve token spending first
const USDC_ADDRESS = "0x...";
await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "approve",
  args: [AAVE_CONTROLLER, repayAmount],
});

// Build repay transaction
const txParams = buildRepayTx(
  AAVE_CONTROLLER,
  positionId,
  USDC_RESERVE_ID,
  repayAmount,
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

**What happens on-chain:**

1. Transfers tokens from user to controller (requires approval)
2. Burns debt tokens from user's proxy
3. Updates position debt
4. Emits `Repaid` event

**Errors:**

- Insufficient token approval
- User doesn't have enough tokens
- Repay amount exceeds debt
- Position doesn't exist

---

### buildDepositorRedeemTx()

Build transaction to redeem vault back to vault provider.

**Only callable by original depositor** who completed the peg-in.

```typescript
function buildDepositorRedeemTx(
  contractAddress: Address,
  vaultId: Hex,
): TransactionParams;
```

**Parameters:**

- `contractAddress` (`Address`) - AaveIntegrationController contract address
- `vaultId` (`Hex`) - Vault ID to redeem (peg-in tx hash)
  - Vault must be in "Available" status (not in use)

**Returns:** `TransactionParams`

**Usage:**

```typescript
import { buildDepositorRedeemTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const txParams = buildDepositorRedeemTx(
  "0x123...", // Controller address
  "0xabc...", // Vault ID
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

**What happens on-chain:**

1. Verifies caller is original depositor
2. Verifies vault is in Available status
3. Calls BTCVaultsManager to redeem vault
4. Vault status changes: `Available (0)` → `Redeemed (3)`
5. Vault provider pays out BTC on Bitcoin network

**Errors:**

- Caller is not original depositor
- Vault is in use (collateralizing position)
- Vault already redeemed

**Note:** This triggers the vault provider to execute the payout transaction on Bitcoin network using pre-signed authorizations from peg-in Step 3.

---

## Query Functions

Functions for reading on-chain state. All require a viem `PublicClient`.

### getPosition()

Get AAVE position data from controller contract.

```typescript
async function getPosition(
  publicClient: PublicClient,
  contractAddress: Address,
  positionId: Hex,
): Promise<AaveMarketPosition | null>;
```

**Parameters:**

- `publicClient` (`PublicClient`) - Viem public client for reading contracts
- `contractAddress` (`Address`) - AaveIntegrationController contract address
- `positionId` (`Hex`) - Position ID (bytes32)

**Returns:** `AaveMarketPosition | null`

Returns `null` if position doesn't exist (proxy contract is zero address).

**AaveMarketPosition interface:**

```typescript
interface AaveMarketPosition {
  depositor: {
    ethAddress: Address; // Depositor's Ethereum address
    btcPubKey: Hex; // Depositor's Bitcoin pubkey (x-only)
  };
  reserveId: bigint; // Reserve ID for this position
  proxyContract: Address; // User's AAVE proxy contract address
  vaultIds: Hex[]; // Array of vault IDs used as collateral
  totalCollateral: bigint; // Total collateral amount (in vBTC satoshis)
}
```

**Usage:**

```typescript
import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const position = await getPosition(
  publicClient,
  "0x123...", // Controller address
  "0xabc...", // Position ID
);

if (position) {
  console.log("Proxy contract:", position.proxyContract);
  console.log("Vault IDs:", position.vaultIds);
  console.log("Total collateral:", position.totalCollateral);
} else {
  console.log("Position doesn't exist");
}
```

**Note:** Prefer using indexer for position data in production. This function is for verification or when indexer data is unavailable.

---

### getUserAccountData()

Get aggregated user account health data from AAVE Spoke.

**Live on-chain data** - includes current oracle prices and accrued interest.

```typescript
async function getUserAccountData(
  publicClient: PublicClient,
  spokeAddress: Address,
  userAddress: Address,
): Promise<AaveSpokeUserAccountData>;
```

**Parameters:**

- `publicClient` (`PublicClient`) - Viem public client
- `spokeAddress` (`Address`) - AAVE Spoke contract address
- `userAddress` (`Address`) - User's proxy contract address (from position)

**Returns:** `AaveSpokeUserAccountData`

```typescript
interface AaveSpokeUserAccountData {
  riskPremium: bigint; // Risk premium in BPS
  avgCollateralFactor: bigint; // Weighted avg collateral factor (WAD, 1e18 = 100%)
  healthFactor: bigint; // Health factor (WAD, 1e18 = 1.00)
  totalCollateralValue: bigint; // Total collateral in base currency (1e26 = $1 USD)
  totalDebtValue: bigint; // Total debt in base currency (1e26 = $1 USD)
  activeCollateralCount: bigint; // Number of active collateral reserves
  borrowedCount: bigint; // Number of borrowed reserves
}
```

**Usage:**

```typescript
import {
  getUserAccountData,
  aaveValueToUsd,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const accountData = await getUserAccountData(
  publicClient,
  AAVE_SPOKE,
  proxyAddress,
);

// Convert values to USD
const collateralUsd = aaveValueToUsd(accountData.totalCollateralValue);
const debtUsd = aaveValueToUsd(accountData.totalDebtValue);

// Convert health factor to number
const healthFactor = Number(accountData.healthFactor) / 1e18;

console.log(`Collateral: $${collateralUsd}`);
console.log(`Debt: $${debtUsd}`);
console.log(`Health Factor: ${healthFactor.toFixed(2)}`);
```

**Important:** These values use AAVE's on-chain oracle prices and are authoritative for liquidation decisions.

---

### getUserPosition()

Get user position data for a specific reserve from AAVE Spoke.

**Live data** - debt accrues interest, so always fetch fresh.

```typescript
async function getUserPosition(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<AaveSpokeUserPosition>;
```

**Parameters:**

- `publicClient` (`PublicClient`) - Viem public client
- `spokeAddress` (`Address`) - AAVE Spoke contract address
- `reserveId` (`bigint`) - Reserve ID (e.g., USDC reserve)
- `userAddress` (`Address`) - User's proxy contract address

**Returns:** `AaveSpokeUserPosition`

```typescript
interface AaveSpokeUserPosition {
  drawnShares: bigint; // Debt shares drawn
  premiumShares: bigint; // Premium (interest) shares
  realizedPremiumRay: bigint; // Realized premium (ray units)
  premiumOffsetRay: bigint; // Premium offset (ray units)
  suppliedShares: bigint; // Collateral shares supplied
  dynamicConfigKey: number; // Dynamic config key
}
```

**Usage:**

```typescript
import {
  getUserPosition,
  hasDebtFromPosition,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const position = await getUserPosition(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

console.log("Debt shares:", position.drawnShares);
console.log("Collateral shares:", position.suppliedShares);

const userHasDebt = hasDebtFromPosition(position);
console.log("Has debt:", userHasDebt);
```

**Note:** These are shares, not token amounts. Use `getUserTotalDebt()` for actual token amount.

---

### getUserTotalDebt()

Get user's exact total debt in token units for a reserve.

**Includes accrued interest** - precise amount needed for full repayment.

```typescript
async function getUserTotalDebt(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<bigint>;
```

**Parameters:**

- `publicClient` (`PublicClient`) - Viem public client
- `spokeAddress` (`Address`) - AAVE Spoke contract address
- `reserveId` (`bigint`) - Reserve ID for debt asset
- `userAddress` (`Address`) - User's proxy contract address

**Returns:** `bigint` - Total debt in token units (with token decimals)

**Usage:**

```typescript
import {
  getUserTotalDebt,
  FULL_REPAY_BUFFER_BPS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { formatUnits } from "viem";

// Get exact debt amount
const totalDebt = await getUserTotalDebt(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

// For display (USDC has 6 decimals)
const debtInUsdc = formatUnits(totalDebt, 6);
console.log(`Total debt: ${debtInUsdc} USDC`);

// For full repayment, add buffer
const repayAmount = totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;
```

**Important:** For full repayment, add small buffer to account for interest accrual between fetching and transaction execution.

---

### hasDebt()

Check if user has any debt in a reserve.

Convenience function wrapping `getUserPosition()`.

```typescript
async function hasDebt(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<boolean>;
```

**Parameters:**

- `publicClient` (`PublicClient`) - Viem public client
- `spokeAddress` (`Address`) - AAVE Spoke contract address
- `reserveId` (`bigint`) - Reserve ID
- `userAddress` (`Address`) - User's proxy contract address

**Returns:** `boolean` - `true` if user has debt

**Usage:**

```typescript
import { hasDebt } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const userHasDebt = await hasDebt(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  proxyAddress,
);

if (userHasDebt) {
  console.log("Cannot withdraw collateral - debt exists");
} else {
  console.log("Safe to withdraw");
}
```

---

### hasCollateral()

Check if user has supplied collateral in a reserve.

```typescript
async function hasCollateral(
  publicClient: PublicClient,
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<boolean>;
```

**Parameters:**

- `publicClient` (`PublicClient`) - Viem public client
- `spokeAddress` (`Address`) - AAVE Spoke contract address
- `reserveId` (`bigint`) - Reserve ID
- `userAddress` (`Address`) - User's proxy contract address

**Returns:** `boolean` - `true` if user has collateral

**Usage:**

```typescript
import { hasCollateral } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const userHasCollateral = await hasCollateral(
  publicClient,
  AAVE_SPOKE,
  VBTC_RESERVE_ID,
  proxyAddress,
);

console.log("Has collateral:", userHasCollateral);
```

---

## Utility Functions

Pure functions for calculations and UI helpers.

### calculateHealthFactor()

Calculate health factor from collateral, debt, and liquidation threshold.

```typescript
function calculateHealthFactor(
  collateralValueUsd: number,
  totalDebtUsd: number,
  liquidationThresholdBps: number,
): number;
```

**Formula:**

```
Health Factor = (Collateral × Liquidation Threshold) / Total Debt
```

**Parameters:**

- `collateralValueUsd` (`number`) - Collateral value in USD
- `totalDebtUsd` (`number`) - Total debt in USD
- `liquidationThresholdBps` (`number`) - Liquidation threshold in basis points
  - Example: `8000` = 80% = 0.80
  - Get from reserve configuration

**Returns:** `number` - Health factor value

- `> 1.0` = Healthy (safe from liquidation)
- `< 1.0` = Danger (can be liquidated)
- `0` = No debt

**Usage:**

```typescript
import {
  calculateHealthFactor,
  aaveValueToUsd,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const collateralUsd = aaveValueToUsd(accountData.totalCollateralValue);
const debtUsd = aaveValueToUsd(accountData.totalDebtValue);

// Assume 80% liquidation threshold from reserve config
const healthFactor = calculateHealthFactor(collateralUsd, debtUsd, 8000);

console.log(`Health Factor: ${healthFactor.toFixed(2)}`);

if (healthFactor < 1.0) {
  console.log("WARNING: Position can be liquidated!");
} else if (healthFactor < 1.5) {
  console.log("Warning: Position at risk");
} else {
  console.log("Position is healthy");
}
```

---

### selectVaultsForAmount()

Select vaults to match target collateral amount using greedy algorithm.

**Prioritizes larger vaults first** for efficiency.

```typescript
function selectVaultsForAmount(
  vaults: SelectableVault[],
  targetAmount: number,
): VaultSelectionResult;
```

**Parameters:**

- `vaults` (`SelectableVault[]`) - Available vaults
  ```typescript
  interface SelectableVault {
    id: string; // Vault ID
    amount: number; // Vault amount in BTC
  }
  ```
- `targetAmount` (`number`) - Target amount in BTC

**Returns:** `VaultSelectionResult`

```typescript
interface VaultSelectionResult {
  vaultIds: string[]; // IDs of selected vaults
  actualAmount: number; // Actual total from selected vaults
}
```

**Usage:**

```typescript
import { selectVaultsForAmount } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const availableVaults = [
  { id: "0xabc...", amount: 0.5 },
  { id: "0xdef...", amount: 0.3 },
  { id: "0x123...", amount: 0.2 },
];

// Need 0.6 BTC
const result = selectVaultsForAmount(availableVaults, 0.6);

console.log("Selected vaults:", result.vaultIds);
// ["0xabc...", "0xdef..."] (0.5 + 0.3 = 0.8 BTC)

console.log("Actual amount:", result.actualAmount);
// 0.8 BTC (may exceed target)
```

**Algorithm:**

1. Sort vaults by amount descending (largest first)
2. Select vaults until target is met
3. Return selected IDs and actual total

**Note:** Actual amount may exceed target. Algorithm selects whole vaults, doesn't split.

---

### calculateTotalVaultAmount()

Calculate total BTC amount from list of vaults.

```typescript
function calculateTotalVaultAmount(vaults: SelectableVault[]): number;
```

**Parameters:**

- `vaults` (`SelectableVault[]`) - List of vaults

**Returns:** `number` - Total amount in BTC

**Usage:**

```typescript
import { calculateTotalVaultAmount } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const vaults = [
  { id: "0xabc...", amount: 0.5 },
  { id: "0xdef...", amount: 0.3 },
];

const total = calculateTotalVaultAmount(vaults);
console.log(`Total: ${total} BTC`); // 0.8 BTC
```

---

### formatHealthFactor()

Format health factor number for UI display.

```typescript
function formatHealthFactor(healthFactor: number | null): string;
```

**Parameters:**

- `healthFactor` (`number | null`) - Health factor value
  - `null` = no debt

**Returns:** `string` - Formatted string

- Number: `"1.50"`, `"2.34"`
- No debt: `"-"`

**Usage:**

```typescript
import { formatHealthFactor } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const hf1 = formatHealthFactor(1.5); // "1.50"
const hf2 = formatHealthFactor(null); // "-"
const hf3 = formatHealthFactor(0.95); // "0.95"
```

---

### getHealthFactorStatus()

Determine health factor status for UI classification.

```typescript
function getHealthFactorStatus(
  healthFactor: number | null,
  hasDebt: boolean,
): HealthFactorStatus;
```

**Parameters:**

- `healthFactor` (`number | null`) - Health factor value
- `hasDebt` (`boolean`) - Whether position has active debt

**Returns:** `HealthFactorStatus`

```typescript
type HealthFactorStatus = "safe" | "warning" | "danger" | "no_debt";
```

**Logic:**

- `no_debt`: No active debt
- `danger`: HF < 1.0 (can be liquidated)
- `warning`: HF < 1.5 (at risk)
- `safe`: HF >= 1.5 (healthy)

**Usage:**

```typescript
import { getHealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const status1 = getHealthFactorStatus(1.8, true); // "safe"
const status2 = getHealthFactorStatus(1.2, true); // "warning"
const status3 = getHealthFactorStatus(0.9, true); // "danger"
const status4 = getHealthFactorStatus(null, false); // "no_debt"
```

---

### getHealthFactorStatusFromValue()

Get status from raw value (handles Infinity for no-debt scenarios).

```typescript
function getHealthFactorStatusFromValue(value: number): HealthFactorStatus;
```

**Parameters:**

- `value` (`number`) - Health factor value
  - `Infinity` = no debt

**Returns:** `HealthFactorStatus`

**Usage:**

```typescript
import { getHealthFactorStatusFromValue } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const status = getHealthFactorStatusFromValue(Infinity); // "no_debt"
```

---

### getHealthFactorColor()

Get color code for health factor status.

```typescript
function getHealthFactorColor(status: HealthFactorStatus): HealthFactorColor;
```

**Parameters:**

- `status` (`HealthFactorStatus`) - Status classification

**Returns:** `HealthFactorColor` - Hex color code

```typescript
type HealthFactorColor = "#00E676" | "#FFC400" | "#FF1744" | "#5A5A5A";
```

**Color mapping:**

- `safe`: Green `#00E676`
- `warning`: Amber `#FFC400`
- `danger`: Red `#FF1744`
- `no_debt`: Gray `#5A5A5A`

**Usage:**

```typescript
import { getHealthFactorStatus, getHealthFactorColor } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const status = getHealthFactorStatus(1.2, true);
const color = getHealthFactorColor(status);

console.log(`Color: ${color}`); // "#FFC400" (amber)

// In React
<div style={{ color: getHealthFactorColor(status) }}>
  {healthFactor}
</div>
```

---

### isHealthFactorHealthy()

Check if health factor represents healthy position.

```typescript
function isHealthFactorHealthy(healthFactor: number | null): boolean;
```

**Parameters:**

- `healthFactor` (`number | null`) - Health factor value

**Returns:** `boolean`

- `true`: HF >= 1.0 or no debt
- `false`: HF < 1.0 (liquidatable)

**Usage:**

```typescript
import { isHealthFactorHealthy } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const hf = 1.2;
if (!isHealthFactorHealthy(hf)) {
  alert("WARNING: Your position can be liquidated!");
}
```

---

### aaveValueToUsd()

Convert AAVE base currency value to USD.

AAVE uses `1e26` for $1 USD in account data values.

```typescript
function aaveValueToUsd(value: bigint): number;
```

**Parameters:**

- `value` (`bigint`) - Value in AAVE base currency units

**Returns:** `number` - Value in USD

**Usage:**

```typescript
import { aaveValueToUsd } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// From getUserAccountData()
const collateralValue = 500000000000000000000000000n; // 1e26 * 500
const collateralUsd = aaveValueToUsd(collateralValue);

console.log(`$${collateralUsd} USD`); // $500 USD
```

---

### wadToNumber()

Convert WAD (1e18) value to JavaScript number.

```typescript
function wadToNumber(wad: bigint): number;
```

**Parameters:**

- `wad` (`bigint`) - Value in WAD units (1e18 = 1.0)

**Returns:** `number` - Decimal value

**Usage:**

```typescript
import { wadToNumber } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const healthFactorWad = 1500000000000000000n; // 1.5e18
const healthFactor = wadToNumber(healthFactorWad);

console.log(healthFactor); // 1.5
```

---

### calculateBorrowRatio()

Calculate borrow ratio (debt / collateral).

```typescript
function calculateBorrowRatio(
  collateralValueUsd: number,
  debtValueUsd: number,
): number;
```

**Parameters:**

- `collateralValueUsd` (`number`) - Collateral in USD
- `debtValueUsd` (`number`) - Debt in USD

**Returns:** `number` - Ratio as decimal (0-1)

**Usage:**

```typescript
import { calculateBorrowRatio } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const ratio = calculateBorrowRatio(1000, 600);
console.log(`${(ratio * 100).toFixed(1)}%`); // "60.0%"
```

---

### hasDebtFromPosition()

Check if position has debt (utility for position data).

```typescript
function hasDebtFromPosition(position: AaveSpokeUserPosition): boolean;
```

**Parameters:**

- `position` (`AaveSpokeUserPosition`) - User position data

**Returns:** `boolean` - `true` if debt exists

**Usage:**

```typescript
import { getUserPosition, hasDebtFromPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const position = await getUserPosition(...);
const hasDebt = hasDebtFromPosition(position);
```

---

## Types

### AaveMarketPosition

Position data from AaveIntegrationController.

```typescript
interface AaveMarketPosition {
  depositor: {
    ethAddress: Address; // Depositor's Ethereum address
    btcPubKey: Hex; // Depositor's Bitcoin pubkey (x-only, 64 chars)
  };
  reserveId: bigint; // AAVE reserve ID
  proxyContract: Address; // User's AAVE proxy contract
  vaultIds: Hex[]; // Vault IDs used as collateral
  totalCollateral: bigint; // Total collateral in satoshis
}
```

---

### AaveSpokeUserAccountData

Aggregated account health data from AAVE Spoke.

```typescript
interface AaveSpokeUserAccountData {
  riskPremium: bigint; // Risk premium in BPS
  avgCollateralFactor: bigint; // Avg collateral factor (WAD)
  healthFactor: bigint; // Health factor (WAD, 1e18 = 1.00)
  totalCollateralValue: bigint; // Collateral value (base currency, 1e26 = $1)
  totalDebtValue: bigint; // Debt value (base currency, 1e26 = $1)
  activeCollateralCount: bigint; // Number of collateral reserves
  borrowedCount: bigint; // Number of debt reserves
}
```

---

### AaveSpokeUserPosition

User position data for specific reserve.

```typescript
interface AaveSpokeUserPosition {
  drawnShares: bigint; // Debt shares
  premiumShares: bigint; // Premium shares
  realizedPremiumRay: bigint; // Realized premium (ray)
  premiumOffsetRay: bigint; // Premium offset (ray)
  suppliedShares: bigint; // Collateral shares
  dynamicConfigKey: number; // Dynamic config key
}
```

---

### DepositorStruct

Depositor identification.

```typescript
interface DepositorStruct {
  ethAddress: Address; // Ethereum address
  btcPubKey: Hex; // Bitcoin pubkey (x-only, 64 hex chars)
}
```

---

### TransactionParams

Unsigned transaction parameters.

```typescript
interface TransactionParams {
  to: Address; // Contract address to call
  data: Hex; // Encoded function data
  value?: bigint; // ETH value to send (optional)
}
```

**Usage with wallet:**

```typescript
const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  value: txParams.value,
  chain: sepolia,
});
```

---

### SelectableVault

Vault for selection algorithm.

```typescript
interface SelectableVault {
  id: string; // Vault ID (0x-prefixed hex)
  amount: number; // Vault amount in BTC
}
```

---

### VaultSelectionResult

Result from vault selection.

```typescript
interface VaultSelectionResult {
  vaultIds: string[]; // Selected vault IDs
  actualAmount: number; // Actual total amount
}
```

---

### HealthFactorStatus

Health factor classification.

```typescript
type HealthFactorStatus = "safe" | "warning" | "danger" | "no_debt";
```

---

### HealthFactorColor

Color code for health factor.

```typescript
type HealthFactorColor = "#00E676" | "#FFC400" | "#FF1744" | "#5A5A5A";
```

---

## Constants

### AAVE_FUNCTION_NAMES

Contract function name mappings.

```typescript
const AAVE_FUNCTION_NAMES = {
  REDEEM: "depositorRedeem",
  ADD_COLLATERAL: "addCollateralToCorePosition",
  WITHDRAW_ALL_COLLATERAL: "withdrawAllCollateralFromCorePosition",
  BORROW: "borrowFromCorePosition",
  REPAY: "repayToCorePosition",
} as const;
```

---

### Decimal Constants

```typescript
const BTC_DECIMALS = 8; // 1 BTC = 1e8 satoshis
const USDC_DECIMALS = 6; // 1 USDC = 1e6
const AAVE_BASE_CURRENCY_DECIMALS = 26; // 1e26 = $1 USD
const WAD_DECIMALS = 18; // 1e18 = 1.0
```

---

### Basis Points Constants

```typescript
const BPS_SCALE = 10000; // 10000 BPS = 100%
const BPS_TO_PERCENT_DIVISOR = 100; // BPS / 100 = percentage
```

**Example:**

```typescript
// Convert 8000 BPS to percentage
const percentage = 8000 / BPS_TO_PERCENT_DIVISOR; // 80%

// Convert BPS to decimal
const decimal = 8000 / BPS_SCALE; // 0.80
```

---

### Health Factor Thresholds

```typescript
const HEALTH_FACTOR_WARNING_THRESHOLD = 1.5; // Warning below this
const MIN_HEALTH_FACTOR_FOR_BORROW = 1.2; // Min allowed for borrow
```

---

### Repayment Buffer

```typescript
const FULL_REPAY_BUFFER_BPS = 10000n; // 0.01% buffer for full repay
```

**Usage:**

```typescript
const totalDebt = 1000000n;
const repayAmount = totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;
// Adds 0.01% buffer to account for interest accrual
```

---

### Color Constants

```typescript
const HEALTH_FACTOR_COLORS = {
  GREEN: "#00E676", // Safe
  AMBER: "#FFC400", // Warning
  RED: "#FF1744", // Danger
  GRAY: "#5A5A5A", // No debt
} as const;
```

---

## Contract ABIs

### AaveIntegrationControllerABI

Full contract ABI for AaveIntegrationController.

```typescript
import { AaveIntegrationControllerABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Use with viem
const position = await publicClient.readContract({
  address: AAVE_CONTROLLER,
  abi: AaveIntegrationControllerABI,
  functionName: "getPosition",
  args: [positionId],
});
```

---

### AaveSpokeABI

Full contract ABI for AaveSpoke.

```typescript
import { AaveSpokeABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Use with viem
const accountData = await publicClient.readContract({
  address: AAVE_SPOKE,
  abi: AaveSpokeABI,
  functionName: "getUserAccountData",
  args: [proxyAddress],
});
```

---

## Common Patterns

### Full Operation Flow

```typescript
// 1. Add Collateral
const addTx = buildAddCollateralTx(controller, vaultIds, reserveId);
await walletClient.sendTransaction(addTx);

// 2. Get Position
const position = await getPosition(publicClient, controller, positionId);

// 3. Check Health
const accountData = await getUserAccountData(
  publicClient,
  spoke,
  position.proxyContract,
);
const healthFactor = Number(accountData.healthFactor) / 1e18;

// 4. Borrow
if (healthFactor > 1.5) {
  const borrowTx = buildBorrowTx(
    controller,
    positionId,
    debtReserveId,
    amount,
    receiver,
  );
  await walletClient.sendTransaction(borrowTx);
}

// 5. Repay (with approval)
const debt = await getUserTotalDebt(
  publicClient,
  spoke,
  debtReserveId,
  position.proxyContract,
);
// Approve first
const repayTx = buildRepayTx(controller, positionId, debtReserveId, debt);
await walletClient.sendTransaction(repayTx);

// 6. Withdraw
const withdrawTx = buildWithdrawAllCollateralTx(controller, reserveId);
await walletClient.sendTransaction(withdrawTx);
```

---

## Error Handling

All functions may throw errors. Wrap in try-catch:

```typescript
try {
  const position = await getPosition(...);
} catch (error) {
  console.error("Failed to get position:", error);
  // Handle error
}
```

Common viem errors:

- User rejected transaction
- Insufficient gas
- Contract revert
- Network error

---

## Next Steps

- **Quickstart Guide** → [quickstart.md](./quickstart.md)
- **TBV Core Docs** → [../../README.md](../../README.md)
- **Source Code** → [GitHub](https://github.com/babylonlabs-io/babylon-toolkit)
