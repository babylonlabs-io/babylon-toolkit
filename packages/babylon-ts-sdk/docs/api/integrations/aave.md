[@babylonlabs-io/ts-sdk](../README.md) / integrations/aave

# integrations/aave

AAVE v4 Integration for Babylon Trustless BTC Vault

**Pure, reusable SDK for AAVE protocol integration** - Use your BTC as collateral to borrow stablecoins.

This module provides transaction builders, query functions, and utilities for:
- **Transaction Builders** - Build unsigned txs for add collateral, borrow, repay, withdraw, redeem
- **Query Functions** - Fetch live position data, health factor, debt amounts from AAVE spoke
- **Utility Functions** - Calculate health factor, select vaults, format values, check safety

## Key Features

- ✅ **Pure Functions** - No wallet dependencies, works anywhere (Node.js, browser, serverless)
- ✅ **Type-Safe** - Full TypeScript support with viem integration

## Architecture

**Transaction Flow:**
1. SDK builds unsigned transaction → 2. Your app executes with wallet → 3. Contract updates state

**Separation of Concerns:**
- SDK provides pure functions and transaction builders
- Your app handles wallet integration and transaction execution

## Example

```typescript
import {
  buildAddCollateralTx,
  buildBorrowTx,
  getUserAccountData,
  calculateHealthFactor,
  HEALTH_FACTOR_WARNING_THRESHOLD
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Add BTC vaults as collateral
const addTx = buildAddCollateralTx(controllerAddress, vaultIds, reserveId);
await walletClient.sendTransaction({ to: addTx.to, data: addTx.data });

// Check position health
const accountData = await getUserAccountData(publicClient, spokeAddress, proxyAddress);
const hf = Number(accountData.healthFactor) / 1e18;
console.log("Health Factor:", hf);

// Borrow stablecoins
const borrowTx = buildBorrowTx(controllerAddress, positionId, reserveId, amount, receiver);
await walletClient.sendTransaction({ to: borrowTx.to, data: borrowTx.data });
```

## Interfaces

### DepositorStruct

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:12](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L12)

Depositor structure from contract

#### Properties

##### ethAddress

```ts
ethAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:13](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L13)

##### btcPubKey

```ts
btcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:14](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L14)

***

### AaveMarketPosition

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:20](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L20)

Aave position structure from the contract

#### Properties

##### depositor

```ts
depositor: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:21](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L21)

###### ethAddress

```ts
ethAddress: `0x${string}`;
```

###### btcPubKey

```ts
btcPubKey: `0x${string}`;
```

##### reserveId

```ts
reserveId: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:25](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L25)

##### proxyContract

```ts
proxyContract: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:26](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L26)

##### vaultIds

```ts
vaultIds: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:27](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L27)

***

### AaveSpokeUserAccountData

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:34](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L34)

User account data from the Spoke
Contains aggregated position health data calculated by Aave using on-chain oracle prices.

#### Properties

##### riskPremium

```ts
riskPremium: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:36](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L36)

Risk premium in BPS

##### avgCollateralFactor

```ts
avgCollateralFactor: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:38](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L38)

Weighted average collateral factor in WAD (1e18 = 100%)

##### healthFactor

```ts
healthFactor: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:40](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L40)

Health factor in WAD (1e18 = 1.00)

##### totalCollateralValue

```ts
totalCollateralValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:42](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L42)

Total collateral value in base currency (1e26 = $1 USD)

##### totalDebtValue

```ts
totalDebtValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:44](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L44)

Total debt value in base currency (1e26 = $1 USD)

##### activeCollateralCount

```ts
activeCollateralCount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:46](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L46)

Number of active collateral reserves

##### borrowedCount

```ts
borrowedCount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:48](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L48)

Number of borrowed reserves

***

### AaveSpokeUserPosition

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:54](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L54)

User position data from the Spoke

#### Properties

##### drawnShares

```ts
drawnShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:56](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L56)

Drawn debt shares

##### premiumShares

```ts
premiumShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:58](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L58)

Premium shares (interest)

##### realizedPremiumRay

```ts
realizedPremiumRay: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:60](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L60)

Realized premium (ray)

##### premiumOffsetRay

```ts
premiumOffsetRay: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:62](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L62)

Premium offset (ray)

##### suppliedShares

```ts
suppliedShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:64](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L64)

Supplied collateral shares

##### dynamicConfigKey

```ts
dynamicConfigKey: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:66](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L66)

Dynamic config key

***

### TransactionParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:73](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L73)

Transaction parameters for unsigned transactions
Compatible with viem's transaction format

#### Properties

##### to

```ts
to: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:75](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L75)

Contract address to call

##### data

```ts
data: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:77](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L77)

Encoded function data

##### value?

```ts
optional value: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:79](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L79)

Value to send (optional, defaults to 0)

***

### SelectableVault

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:8](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L8)

Vault Selection Utilities for Aave

Provides functions for selecting vaults to match a target collateral amount.
Uses a greedy algorithm that prioritizes larger vaults first.

#### Properties

##### id

```ts
id: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:9](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L9)

##### amount

```ts
amount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:10](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L10)

***

### VaultSelectionResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:13](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L13)

#### Properties

##### vaultIds

```ts
vaultIds: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:15](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L15)

IDs of selected vaults

##### actualAmount

```ts
actualAmount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:17](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L17)

Actual total amount from selected vaults

## Type Aliases

### HealthFactorColor

```ts
type HealthFactorColor = typeof HEALTH_FACTOR_COLORS[keyof typeof HEALTH_FACTOR_COLORS];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:29](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L29)

***

### HealthFactorStatus

```ts
type HealthFactorStatus = "safe" | "warning" | "danger" | "no_debt";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:35](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L35)

Health factor status based on our liquidation threshold

## Functions

### getPosition()

```ts
function getPosition(
   publicClient, 
   contractAddress, 
positionId): Promise<AaveMarketPosition | null>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts:27](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts#L27)

Get a position by its ID

NOTE: Prefer using the indexer (fetchAavePositionWithCollaterals) for position data.
This function is only needed when you need data not available in the indexer,
or when you need to verify on-chain state.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### positionId

`` `0x${string}` ``

Position ID (bytes32)

#### Returns

`Promise`\<[`AaveMarketPosition`](#aavemarketposition) \| `null`\>

Market position data or null if position doesn't exist

***

### getPositionCollateral()

```ts
function getPositionCollateral(
   publicClient, 
   contractAddress, 
positionId): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts:75](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts#L75)

Get total collateral for a position

#### Parameters

##### publicClient

Viem public client for reading contracts

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### positionId

`` `0x${string}` ``

Position ID (bytes32)

#### Returns

`Promise`\<`bigint`\>

Total collateral amount

***

### getUserAccountData()

```ts
function getUserAccountData(
   publicClient, 
   spokeAddress, 
userAddress): Promise<AaveSpokeUserAccountData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:103](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L103)

Get aggregated user account health data from AAVE spoke.

**Live data** - Fetches real-time account health including health factor, total collateral,
and total debt across all reserves. Values are calculated on-chain using AAVE oracles
and are the authoritative source for liquidation decisions.

#### Parameters

##### publicClient

Viem public client for reading contracts (from `createPublicClient()`)

##### spokeAddress

`` `0x${string}` ``

AAVE Spoke contract address (BTC Vault Core Spoke for vBTC collateral)

##### userAddress

`` `0x${string}` ``

User's proxy contract address (NOT user's wallet address)

#### Returns

`Promise`\<[`AaveSpokeUserAccountData`](#aavespokeuseraccountdata)\>

User account data with health metrics, collateral, and debt values

#### Example

```typescript
import { getUserAccountData } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http()
});

const accountData = await getUserAccountData(
  publicClient,
  "0x123...", // AAVE Spoke address
  "0x456..."  // User's AAVE proxy address (from getPosition)
);

console.log("Health Factor:", accountData.healthFactor);
console.log("Collateral (USD):", accountData.totalCollateralValue);
console.log("Debt (USD):", accountData.totalDebtValue);
```

#### Remarks

**Return values:**
- `healthFactor` - WAD format (1e18 = 1.0). Below 1.0 = liquidatable
- `totalCollateralValue` - USD value in base currency (1e26 = $1)
- `totalDebtValue` - USD value in base currency (1e26 = $1)
- `avgCollateralFactor` - Weighted average LTV in BPS (8000 = 80%)
- `riskPremium` - Additional risk premium

**Use cases:**
- Check liquidation risk before borrowing
- Calculate safe borrow amount
- Monitor position health
- Display UI health indicators

***

### getUserPosition()

```ts
function getUserPosition(
   publicClient, 
   spokeAddress, 
   reserveId, 
userAddress): Promise<AaveSpokeUserPosition>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:139](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L139)

Get user position from the Spoke

This fetches live data from the contract because debt accrues interest
and needs to be current for accurate health factor calculations.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

Aave Spoke contract address

##### reserveId

`bigint`

Reserve ID

##### userAddress

`` `0x${string}` ``

User's proxy contract address

#### Returns

`Promise`\<[`AaveSpokeUserPosition`](#aavespokeuserposition)\>

User position data

***

### hasDebt()

```ts
function hasDebt(
   publicClient, 
   spokeAddress, 
   reserveId, 
userAddress): Promise<boolean>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:164](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L164)

Check if a user has any debt in a reserve

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

Aave Spoke contract address

##### reserveId

`bigint`

Reserve ID

##### userAddress

`` `0x${string}` ``

User's proxy contract address

#### Returns

`Promise`\<`boolean`\>

true if user has debt

***

### hasCollateral()

```ts
function hasCollateral(
   publicClient, 
   spokeAddress, 
   reserveId, 
userAddress): Promise<boolean>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:188](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L188)

Check if a user has supplied collateral in a reserve

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

Aave Spoke contract address

##### reserveId

`bigint`

Reserve ID

##### userAddress

`` `0x${string}` ``

User's proxy contract address

#### Returns

`Promise`\<`boolean`\>

true if user has supplied collateral

***

### getUserTotalDebt()

```ts
function getUserTotalDebt(
   publicClient, 
   spokeAddress, 
   reserveId, 
userAddress): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:239](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L239)

Get user's exact total debt in a reserve (token units, not shares).

Returns the precise amount owed including accrued interest. Essential for full repayment.
Debt accrues interest every block, so this must be fetched live from the contract.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

AAVE Spoke contract address

##### reserveId

`bigint`

Reserve ID for the debt asset (e.g., `2n` for USDC)

##### userAddress

`` `0x${string}` ``

User's proxy contract address

#### Returns

`Promise`\<`bigint`\>

Total debt amount in token units (e.g., for USDC: `100000000n` = 100 USDC)

#### Example

```typescript
import { getUserTotalDebt, FULL_REPAY_BUFFER_DIVISOR } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { formatUnits } from "viem";

const totalDebt = await getUserTotalDebt(
  publicClient,
  AAVE_SPOKE_ADDRESS,
  2n, // USDC reserve
  proxyAddress
);

// For full repayment, add buffer to account for interest accrual
const repayAmount = totalDebt + (totalDebt / FULL_REPAY_BUFFER_DIVISOR);

console.log("Debt:", formatUnits(totalDebt, 6), "USDC");
```

#### Remarks

**Important for full repayment:**
- Add `FULL_REPAY_BUFFER_DIVISOR` buffer to account for interest between fetch and tx execution
- Contract only takes what's owed; excess stays in wallet
- For partial repayment, use any amount less than total debt

***

### buildAddCollateralTx()

```ts
function buildAddCollateralTx(
   contractAddress, 
   vaultIds, 
   reserveId): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:59](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L59)

Build transaction to add BTC vaults as collateral to AAVE position.

Creates a new position on first call, or adds to existing position for the given reserve.
User's proxy contract is deployed automatically on first position creation.

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### vaultIds

`` `0x${string}` ``[]

Array of vault IDs (peg-in transaction hashes) to use as collateral. Format: `0x${string}` (bytes32 hex values). Vaults must be in "Available" status.

##### reserveId

`bigint`

AAVE reserve ID for the collateral (e.g., `1n` for vBTC reserve). Get from AAVE config or indexer.

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters (`TransactionParams`) for execution with viem wallet

#### Example

```typescript
import { buildAddCollateralTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const txParams = buildAddCollateralTx(
  "0x123...", // Controller address
  ["0xabc...", "0xdef..."], // Vault IDs
  1n // vBTC reserve ID
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

#### Remarks

**What happens on-chain:**
1. If first time: Deploys user's proxy contract via AAVE
2. Transfers vault ownership from user to AAVE controller
3. Vault status changes: `Available (0)` → `InUse (1)`
4. Creates or updates position with new collateral
5. Emits `CollateralAdded` event

**Possible errors:**
- Vault already in use by another position
- Vault doesn't exist or already redeemed
- User doesn't own the vault
- Reserve ID invalid

***

### buildWithdrawAllCollateralTx()

```ts
function buildWithdrawAllCollateralTx(contractAddress, reserveId): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:117](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L117)

Build transaction to withdraw all vBTC collateral from AAVE position.

**Requires zero debt** - position must have no outstanding borrows across all reserves.
Withdraws all vBTC collateral and releases vaults back to Available status.

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### reserveId

`bigint`

AAVE reserve ID for the collateral. Must match the reserve used when adding collateral.

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters for execution with viem wallet

#### Example

```typescript
import { buildWithdrawAllCollateralTx, hasDebt } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Check for debt first
const userHasDebt = await hasDebt(publicClient, spokeAddress, USDC_RESERVE_ID, proxyAddress);
if (userHasDebt) {
  throw new Error("Cannot withdraw with outstanding debt");
}

const txParams = buildWithdrawAllCollateralTx("0x123...", 1n);
const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

#### Remarks

**What happens on-chain:**
1. Verifies user has zero debt across all reserves
2. Withdraws all vBTC collateral from AAVE spoke
3. Transfers vault ownership back to user
4. Vault status changes: `InUse (1)` → `Available (0)`
5. Emits `CollateralWithdrawn` event

**Possible errors:**
- User has outstanding debt
- Position doesn't exist
- No collateral to withdraw

***

### buildBorrowTx()

```ts
function buildBorrowTx(
   contractAddress, 
   positionId, 
   debtReserveId, 
   amount, 
   receiver): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:185](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L185)

Build transaction to borrow assets against vBTC collateral.

Borrows stablecoins (e.g., USDC) against your BTC collateral position.
Health factor must remain above 1.0 after borrowing, otherwise transaction will revert.

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### positionId

`` `0x${string}` ``

Position ID to borrow against (bytes32, from `getPosition()` or indexer)

##### debtReserveId

`bigint`

AAVE reserve ID for the debt asset (e.g., `2n` for USDC reserve)

##### amount

`bigint`

Amount to borrow in token units with decimals (e.g., for USDC with 6 decimals: `100000000n` = 100 USDC). Use `parseUnits()` from viem.

##### receiver

`` `0x${string}` ``

Address to receive borrowed tokens (usually user's address)

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters for execution with viem wallet

#### Example

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
  "0x456..." // Receiver address
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

#### Remarks

**What happens on-chain:**
1. Checks health factor won't drop below liquidation threshold (1.0)
2. Mints debt tokens to user's proxy contract
3. Transfers borrowed asset to receiver address
4. Updates position debt
5. Emits `Borrowed` event

**Possible errors:**
- Borrow would make health factor < 1.0
- Insufficient collateral
- Reserve doesn't exist
- Position doesn't exist

**Important:** Calculate safe borrow amount using `calculateHealthFactor()` to avoid liquidation.

***

### buildRepayTx()

```ts
function buildRepayTx(
   contractAddress, 
   positionId, 
   debtReserveId, 
   amount): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:268](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L268)

Build transaction to repay debt on AAVE position.

**Requires token approval** - user must approve controller to spend debt token first.
Repays borrowed assets (partial or full repayment supported).

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### positionId

`` `0x${string}` ``

Position ID with debt (bytes32)

##### debtReserveId

`bigint`

AAVE reserve ID for the debt asset

##### amount

`bigint`

Amount to repay in token units. Can repay partial or full debt. For full repay, use `getUserTotalDebt()` to get exact amount.

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters for execution with viem wallet

#### Example

```typescript
import { buildRepayTx, getUserTotalDebt, FULL_REPAY_BUFFER_DIVISOR } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Get exact current debt
const totalDebt = await getUserTotalDebt(
  publicClient,
  AAVE_SPOKE,
  USDC_RESERVE_ID,
  proxyAddress
);

// Add buffer for full repayment (accounts for interest accrual)
const repayAmount = totalDebt + (totalDebt / FULL_REPAY_BUFFER_DIVISOR);

// IMPORTANT: Approve token spending first
const USDC_ADDRESS = "0x...";
await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: "approve",
  args: [AAVE_CONTROLLER, repayAmount]
});

// Build repay transaction
const txParams = buildRepayTx(
  AAVE_CONTROLLER,
  positionId,
  USDC_RESERVE_ID,
  repayAmount
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

#### Remarks

**What happens on-chain:**
1. Transfers tokens from user to controller (requires approval)
2. Burns debt tokens from user's proxy
3. Updates position debt
4. Emits `Repaid` event

**Possible errors:**
- Insufficient token approval
- User doesn't have enough tokens
- Repay amount exceeds debt
- Position doesn't exist

***

### buildDepositorRedeemTx()

```ts
function buildDepositorRedeemTx(contractAddress, vaultId): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:331](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L331)

Build transaction to redeem BTC vault back to Bitcoin network.

**Depositor-only operation** - Only callable by the original depositor who created the vault.
Vault must be in "Available" status (not in use by AAVE or already redeemed).

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationController contract address

##### vaultId

`` `0x${string}` ``

Vault ID to redeem (bytes32, peg-in transaction hash)

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters for execution with viem wallet

#### Example

```typescript
import { buildDepositorRedeemTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const vaultId = "0xabc..."; // From your pegin transaction

const txParams = buildDepositorRedeemTx(
  "0x123...", // Controller address
  vaultId
);

const hash = await walletClient.sendTransaction({
  to: txParams.to,
  data: txParams.data,
  chain: sepolia,
});
```

#### Remarks

**What happens on-chain:**
1. Verifies caller is the original depositor
2. Verifies vault is in "Available" status
3. Burns the vault NFT
4. Vault status changes: `Available (0)` → `Redeemed (2)`
5. Initiates Bitcoin withdrawal to depositor's BTC address
6. Emits `VaultRedeemed` event

**Possible errors:**
- Vault in use by AAVE position
- Vault already redeemed
- Caller is not the depositor
- Vault doesn't exist

**After redemption:** Depositor must sign payout authorization to complete BTC withdrawal.

***

### aaveValueToUsd()

```ts
function aaveValueToUsd(value): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts:17](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts#L17)

Convert Aave base currency value to USD

Aave uses 1e26 = $1 USD for collateral and debt values.

#### Parameters

##### value

`bigint`

Value in Aave base currency (1e26 = $1)

#### Returns

`number`

Value in USD

***

### wadToNumber()

```ts
function wadToNumber(value): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts:29](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts#L29)

Convert Aave WAD value to number

WAD is used for health factor and collateral factor (1e18 = 1.0).

#### Parameters

##### value

`bigint`

Value in WAD (1e18 = 1.0)

#### Returns

`number`

Decimal number

***

### calculateBorrowRatio()

```ts
function calculateBorrowRatio(debtUsd, collateralValueUsd): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/borrowRatio.ts:15](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/borrowRatio.ts#L15)

Calculate borrow ratio (debt / collateral) as percentage string

#### Parameters

##### debtUsd

`number`

Total debt in USD

##### collateralValueUsd

`number`

Total collateral value in USD

#### Returns

`string`

Formatted percentage string (e.g., "15.7%")

***

### hasDebtFromPosition()

```ts
function hasDebtFromPosition(position): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/debtUtils.ts:20](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/debtUtils.ts#L20)

Check if a position has any debt based on Spoke position data.

A position is considered to have debt if any of:
- drawnShares > 0 (borrowed principal)
- premiumShares > 0 (accrued interest shares)
- realizedPremiumRay > 0 (realized interest)

#### Parameters

##### position

[`AaveSpokeUserPosition`](#aavespokeuserposition)

User position data from Spoke

#### Returns

`boolean`

true if the position has any debt

***

### getHealthFactorStatus()

```ts
function getHealthFactorStatus(healthFactor, hasDebt): HealthFactorStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:44](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L44)

Determine health factor status for UI display

#### Parameters

##### healthFactor

The health factor as a number (null if no debt)

`number` | `null`

##### hasDebt

`boolean`

Whether the position has active debt

#### Returns

[`HealthFactorStatus`](#healthfactorstatus)

The status classification

***

### getHealthFactorColor()

```ts
function getHealthFactorColor(status): HealthFactorColor;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:61](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L61)

Gets the appropriate color for a health factor status.

#### Parameters

##### status

[`HealthFactorStatus`](#healthfactorstatus)

The health factor status

#### Returns

[`HealthFactorColor`](#healthfactorcolor)

The color code for the status

***

### formatHealthFactor()

```ts
function formatHealthFactor(healthFactor): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:82](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L82)

Format health factor number for display

#### Parameters

##### healthFactor

Health factor number (null if no debt)

`number` | `null`

#### Returns

`string`

Formatted string for display

***

### isHealthFactorHealthy()

```ts
function isHealthFactorHealthy(healthFactor): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:95](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L95)

Checks if a health factor value represents a healthy position.

#### Parameters

##### healthFactor

The health factor as a number

`number` | `null`

#### Returns

`boolean`

true if the health factor is >= 1.0 (healthy), false otherwise

***

### getHealthFactorStatusFromValue()

```ts
function getHealthFactorStatusFromValue(value): HealthFactorStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:109](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L109)

Get health factor status from a numeric value.
Used for UI components that work with Infinity for no-debt scenarios.

#### Parameters

##### value

`number`

Health factor value (Infinity when no debt)

#### Returns

[`HealthFactorStatus`](#healthfactorstatus)

The status classification

***

### calculateHealthFactor()

```ts
function calculateHealthFactor(
   collateralValueUsd, 
   totalDebtUsd, 
   liquidationThresholdBps): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:157](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L157)

Calculate health factor for an AAVE position.

**Formula:** `HF = (Collateral × Liquidation Threshold) / Total Debt`

Health factor determines liquidation risk:
- `>= 1.5` - Safe (green)
- `1.0 - 1.5` - Warning (amber)
- `< 1.0` - Danger, position can be liquidated (red)

#### Parameters

##### collateralValueUsd

`number`

Total collateral value in USD (as number, not bigint)

##### totalDebtUsd

`number`

Total debt value in USD (as number, not bigint)

##### liquidationThresholdBps

`number`

Liquidation threshold in basis points (e.g., `8000` = 80%)

#### Returns

`number`

Health factor value (e.g., `1.5`), or `0` if no debt

#### Example

```typescript
import { calculateHealthFactor, HEALTH_FACTOR_WARNING_THRESHOLD } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// User has $10,000 BTC collateral, $5,000 debt, 80% LT
const hf = calculateHealthFactor(10000, 5000, 8000);
// Result: 1.6 (safe to borrow more)

if (hf < 1.0) {
  console.error("Position can be liquidated!");
} else if (hf < HEALTH_FACTOR_WARNING_THRESHOLD) {
  console.warn("Position at risk, consider repaying");
} else {
  console.log("Position is safe");
}
```

#### Remarks

**Before borrowing:**
Use this to calculate resulting health factor and ensure it stays above safe threshold.

**Unit conversions:**
- Convert AAVE base currency (1e26) to USD by dividing by 1e26
- Use `aaveValueToUsd()` helper for automatic conversion

***

### selectVaultsForAmount()

```ts
function selectVaultsForAmount(vaults, targetAmount): VaultSelectionResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:28](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L28)

Select vaults to match the target amount using a greedy algorithm.
Sorts vaults by amount descending and picks until target is met.

#### Parameters

##### vaults

[`SelectableVault`](#selectablevault)[]

Available vaults to select from

##### targetAmount

`number`

Target amount to reach

#### Returns

[`VaultSelectionResult`](#vaultselectionresult)

Selected vault IDs and actual amount

***

### calculateTotalVaultAmount()

```ts
function calculateTotalVaultAmount(vaults): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts:56](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSelection.ts#L56)

Calculate total amount from a list of vaults

#### Parameters

##### vaults

[`SelectableVault`](#selectablevault)[]

Vaults to sum

#### Returns

`number`

Total amount in BTC

## Variables

### AAVE\_FUNCTION\_NAMES

```ts
const AAVE_FUNCTION_NAMES: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:12](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L12)

Aave contract function names
Centralized constants for contract interactions

#### Type Declaration

##### REDEEM

```ts
readonly REDEEM: "depositorRedeem" = "depositorRedeem";
```

Redeem vault back to vault provider (depositorRedeem)

##### ADD\_COLLATERAL

```ts
readonly ADD_COLLATERAL: "addCollateralToCorePosition" = "addCollateralToCorePosition";
```

Add collateral to Core Spoke position

##### WITHDRAW\_ALL\_COLLATERAL

```ts
readonly WITHDRAW_ALL_COLLATERAL: "withdrawAllCollateralFromCorePosition" = "withdrawAllCollateralFromCorePosition";
```

Withdraw all collateral from Core Spoke position

##### BORROW

```ts
readonly BORROW: "borrowFromCorePosition" = "borrowFromCorePosition";
```

Borrow from Core Spoke position

##### REPAY

```ts
readonly REPAY: "repayToCorePosition" = "repayToCorePosition";
```

Repay debt to Core Spoke position

***

### BTC\_DECIMALS

```ts
const BTC_DECIMALS: 8 = 8;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:29](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L29)

BTC token decimals (satoshis)
1 BTC = 100,000,000 satoshis

***

### USDC\_DECIMALS

```ts
const USDC_DECIMALS: 6 = 6;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:35](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L35)

USDC token decimals
Used for debt calculations

***

### BPS\_TO\_PERCENT\_DIVISOR

```ts
const BPS_TO_PERCENT_DIVISOR: 100 = 100;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:48](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L48)

Divisor to convert basis points (BPS) to percentage

In Aave v4, risk parameters like collateralRisk are stored in BPS
where 10000 BPS = 100%.

Example: 8000 BPS / 100 = 80%

Reference: ISpoke.sol - "collateralRisk The risk associated with a
collateral asset, expressed in BPS"

***

### BPS\_SCALE

```ts
const BPS_SCALE: 10000 = 10000;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:56](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L56)

Full basis points scale (10000 BPS = 100%)

Use this when converting BPS directly to decimal:
Example: 8000 BPS / 10000 = 0.80

***

### AAVE\_BASE\_CURRENCY\_DECIMALS

```ts
const AAVE_BASE_CURRENCY_DECIMALS: 26 = 26;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:64](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L64)

Aave base currency decimals
Account data values (collateral, debt) use 1e26 = $1 USD

Reference: ISpoke.sol UserAccountData

***

### WAD\_DECIMALS

```ts
const WAD_DECIMALS: 18 = 18;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:72](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L72)

WAD decimals (1e18 = 1.0)
Used for health factor and collateral factor values

Reference: ISpoke.sol - "healthFactor expressed in WAD. 1e18 represents a health factor of 1.00"

***

### HEALTH\_FACTOR\_WARNING\_THRESHOLD

```ts
const HEALTH_FACTOR_WARNING_THRESHOLD: 1.5 = 1.5;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:78](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L78)

Health factor warning threshold
Positions below this are considered at risk of liquidation

***

### MIN\_HEALTH\_FACTOR\_FOR\_BORROW

```ts
const MIN_HEALTH_FACTOR_FOR_BORROW: 1.2 = 1.2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:84](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L84)

Minimum health factor allowed for borrowing
Prevents users from borrowing if resulting health factor would be below this.

***

### FULL\_REPAY\_BUFFER\_BPS

```ts
const FULL_REPAY_BUFFER_DIVISOR: 10000n = 10000n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:91](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L91)

Buffer for full repayment to account for interest accrual
between fetching debt and transaction execution.
0.01% buffer (1 basis point) - the contract only takes what's owed.

***

### HEALTH\_FACTOR\_COLORS

```ts
const HEALTH_FACTOR_COLORS: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts:22](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts#L22)

#### Type Declaration

##### GREEN

```ts
readonly GREEN: "#00E676" = "#00E676";
```

##### AMBER

```ts
readonly AMBER: "#FFC400" = "#FFC400";
```

##### RED

```ts
readonly RED: "#FF1744" = "#FF1744";
```

##### GRAY

```ts
readonly GRAY: "#5A5A5A" = "#5A5A5A";
```
