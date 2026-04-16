[@babylonlabs-io/ts-sdk](../README.md) / integrations/aave

# integrations/aave

AAVE v4 Integration for Babylon Trustless BTC Vault

**Pure, reusable SDK for AAVE protocol integration** - Use your BTC as collateral to borrow stablecoins.

This module provides transaction builders, query functions, and utilities for:
- **Transaction Builders** - Build unsigned txs for borrow, repay, and withdraw
- **Query Functions** - Fetch live position data, health factor, debt amounts from AAVE spoke
- **Utility Functions** - Calculate health factor, select vaults, format values, check safety

## Key Features

- **Pure Functions** - No wallet dependencies, works anywhere (Node.js, browser, serverless)
- **Type-Safe** - Full TypeScript support with viem integration

## Architecture

**Transaction Flow:**
1. SDK builds unsigned transaction → 2. Your app executes with wallet → 3. Contract updates state

**Separation of Concerns:**
- SDK provides pure functions and transaction builders
- Your app handles wallet integration and transaction execution

## Example

```typescript
import {
  buildBorrowTx,
  getUserAccountData,
  calculateHealthFactor,
  HEALTH_FACTOR_WARNING_THRESHOLD
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Check position health
const accountData = await getUserAccountData(publicClient, spokeAddress, proxyAddress);
const hf = Number(accountData.healthFactor) / 1e18;
console.log("Health Factor:", hf);

// Borrow stablecoins (adapter resolves proxy from msg.sender)
const borrowTx = buildBorrowTx(adapterAddress, reserveId, amount, receiver);
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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:21](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L21)

Aave position structure from the contract.
The adapter resolves the user's proxy and vaults from their address.

#### Properties

##### proxyContract

```ts
proxyContract: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:22](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L22)

##### vaultIds

```ts
vaultIds: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:23](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L23)

***

### AaveSpokeUserAccountData

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:30](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L30)

User account data from the Spoke
Contains aggregated position health data calculated by Aave using on-chain oracle prices.

#### Properties

##### riskPremium

```ts
riskPremium: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:32](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L32)

Risk premium

##### avgCollateralFactor

```ts
avgCollateralFactor: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:34](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L34)

Weighted average collateral factor in WAD (1e18 = 100%)

##### healthFactor

```ts
healthFactor: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:36](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L36)

Health factor in WAD (1e18 = 1.00)

##### totalCollateralValue

```ts
totalCollateralValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:38](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L38)

Total collateral value in base currency (1e26 = $1 USD)

##### totalDebtValueRay

```ts
totalDebtValueRay: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:40](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L40)

Total debt value in base currency, scaled by RAY (1e35 = $1 USD)

##### activeCollateralCount

```ts
activeCollateralCount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:42](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L42)

Number of active collateral reserves

##### borrowCount

```ts
borrowCount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:44](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L44)

Number of borrowed reserves

***

### AaveSpokeUserPosition

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:50](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L50)

User position data from the Spoke

#### Properties

##### drawnShares

```ts
drawnShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:52](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L52)

Drawn debt shares

##### premiumShares

```ts
premiumShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:54](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L54)

Premium shares (interest)

##### premiumOffsetRay

```ts
premiumOffsetRay: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:56](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L56)

Premium offset, expressed in asset units scaled by RAY (signed)

##### suppliedShares

```ts
suppliedShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:60](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L60)

Supplied collateral shares

##### dynamicConfigKey

```ts
dynamicConfigKey: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:62](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L62)

Dynamic config key

***

### TransactionParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:69](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L69)

Transaction parameters for unsigned transactions
Compatible with viem's transaction format

#### Properties

##### to

```ts
to: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:71](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L71)

Contract address to call

##### data

```ts
data: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:73](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L73)

Encoded function data

##### value?

```ts
optional value: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts:75](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts#L75)

Value to send (optional, defaults to 0)

***

### CascadeVault

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:17](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L17)

Minimal vault shape for cascade simulation.
UI layers extend this with display fields (e.g. `name`).

#### Properties

##### id

```ts
id: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:18](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L18)

##### btc

```ts
btc: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:19](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L19)

***

### OrderedVault

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:17](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L17)

A vault with its on-chain ID and BTC amount, in liquidation-priority order.

#### Properties

##### id

```ts
id: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:19](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L19)

On-chain vault ID (bytes32 hex string)

##### amountSats

```ts
amountSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:21](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L21)

Vault amount in satoshis

***

### PrefixSeizureParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:27](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L27)

Parameters for simulating prefix seizure.

#### Properties

##### orderedVaults

```ts
orderedVaults: OrderedVault[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:29](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L29)

Vaults in their current on-chain order (index 0 is seized first)

##### targetSeizureSats

```ts
targetSeizureSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:31](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L31)

Target seizure amount in satoshis

***

### PrefixSeizureResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:37](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L37)

Result of a prefix seizure simulation.

#### Properties

##### seizedVaults

```ts
seizedVaults: OrderedVault[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:39](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L39)

Vaults that would be seized (the prefix)

##### protectedVaults

```ts
protectedVaults: OrderedVault[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:41](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L41)

Vaults that survive liquidation

##### overSeizureSats

```ts
overSeizureSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:43](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L43)

Over-seizure amount in satoshis (total seized - target)

##### cutoffIndex

```ts
cutoffIndex: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:45](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L45)

Index where seizure stops (exclusive: vaults[0..cutoffIndex] are seized)

##### totalSeizedSats

```ts
totalSeizedSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:47](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L47)

Total amount seized in satoshis

***

### TargetSeizureParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:53](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L53)

Parameters for computing target seizure in satoshis.

#### Properties

##### totalCollateralSats

```ts
totalCollateralSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:55](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L55)

Total collateral in satoshis

##### CF

```ts
CF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:57](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L57)

Collateral factor (e.g. 0.75)

##### LB

```ts
LB: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:59](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L59)

Liquidation bonus (e.g. 1.05)

##### THF

```ts
THF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:61](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L61)

Target health factor (e.g. 1.10)

##### expectedHF

```ts
expectedHF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:63](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L63)

Expected health factor at liquidation (e.g. 0.95)

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

***

### OptimalSplitParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:34](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L34)

Parameters for computing the optimal vault split.

#### Properties

##### totalBtc

```ts
totalBtc: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:36](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L36)

Total deposit amount in satoshis

##### CF

```ts
CF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:38](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L38)

Collateral factor (e.g. 0.75 for 75%)

##### LB

```ts
LB: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:40](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L40)

Liquidation bonus (e.g. 1.05 for 5% bonus)

##### THF

```ts
THF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:42](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L42)

Target health factor (e.g. 1.10)

##### expectedHF

```ts
expectedHF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:44](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L44)

Expected health factor at liquidation (e.g. 0.95)

##### safetyMargin

```ts
safetyMargin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:46](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L46)

Safety margin multiplier for the sacrificial vault (e.g. 1.05 for 5% buffer)

***

### OptimalSplitResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:52](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L52)

Result of the optimal vault split computation.

#### Properties

##### sacrificialVault

```ts
sacrificialVault: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:54](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L54)

Sacrificial vault amount in satoshis (index 0, seized first)

##### protectedVault

```ts
protectedVault: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:56](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L56)

Protected vault amount in satoshis (index 1, survives liquidation)

##### seizedFraction

```ts
seizedFraction: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:58](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L58)

Fraction of collateral that would be seized (0–1)

##### targetSeizureBtc

```ts
targetSeizureBtc: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:60](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L60)

Raw target seizure amount in satoshis (before safety margin)

***

### MinDepositForSplitParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:66](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L66)

Parameters for computing the minimum deposit required for a split.

#### Properties

##### minPegin

```ts
minPegin: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:68](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L68)

Minimum peg-in amount in satoshis

##### seizedFraction

```ts
seizedFraction: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:70](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L70)

Seized fraction (0–1), from computeOptimalSplit or computeSeizedFraction

##### safetyMargin

```ts
safetyMargin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:72](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L72)

Safety margin multiplier (e.g. 1.05)

***

### RebalanceCheckParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:78](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L78)

Parameters for checking if a vault rebalance is needed.

#### Properties

##### vaultAmounts

```ts
vaultAmounts: bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:80](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L80)

Ordered vault amounts in satoshis (index 0 is sacrificial)

##### CF

```ts
CF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:82](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L82)

Collateral factor (e.g. 0.75)

##### LB

```ts
LB: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:84](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L84)

Liquidation bonus (e.g. 1.05)

##### THF

```ts
THF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:86](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L86)

Target health factor (e.g. 1.10)

##### expectedHF

```ts
expectedHF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:88](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L88)

Expected health factor at liquidation (e.g. 0.95)

##### safetyMargin

```ts
safetyMargin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:90](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L90)

Safety margin multiplier (e.g. 1.05)

***

### RebalanceCheckResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:96](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L96)

Result of a vault rebalance check.

#### Properties

##### needsRebalance

```ts
needsRebalance: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:98](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L98)

Whether the sacrificial vault needs to be increased

##### deficit

```ts
deficit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:100](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L100)

How much more the sacrificial vault needs in satoshis (0n if no rebalance needed)

##### currentCoverage

```ts
currentCoverage: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:102](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L102)

Current sacrificial vault coverage in satoshis

##### targetCoverage

```ts
targetCoverage: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:104](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L104)

Required sacrificial vault coverage in satoshis

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
user): Promise<AaveMarketPosition | null>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts:27](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts#L27)

Get a position by user address.

The adapter resolves the user's proxy contract and collateralized vault IDs.

NOTE: Prefer using the indexer (fetchAavePositionWithCollaterals) for position data.
This function is only needed when you need data not available in the indexer,
or when you need to verify on-chain state.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

##### user

`` `0x${string}` ``

User's Ethereum address

#### Returns

`Promise`\<[`AaveMarketPosition`](#aavemarketposition) \| `null`\>

Market position data or null if position doesn't exist

***

### getPositionCollateral()

```ts
function getPositionCollateral(
   publicClient, 
   contractAddress, 
user): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts:65](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts#L65)

Get total collateral for a user's position.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

##### user

`` `0x${string}` ``

User's Ethereum address

#### Returns

`Promise`\<`bigint`\>

Total collateral amount in satoshis

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
console.log("Debt (USD):", accountData.totalDebtValueRay);
```

#### Remarks

**Return values:**
- `healthFactor` - WAD format (1e18 = 1.0). Below 1.0 = liquidatable
- `totalCollateralValue` - USD value in base currency (1e26 = $1)
- `totalDebtValueRay` - USD value in RAY-scaled base currency (1e35 = $1)
- `avgCollateralFactor` - Weighted average collateral factor in WAD (1e18 = 100%)
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

### getReserve()

```ts
function getReserve(
   publicClient, 
   spokeAddress, 
reserveId): Promise<ReserveResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:296](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L296)

Get reserve data from the Core Spoke contract via the `getReserve` selector.

Returns static reserve properties including the `dynamicConfigKey` needed
for `getDynamicReserveConfig` calls. Use this as a fallback when reserve
data is not available from the GraphQL indexer.

Do NOT confuse with the contract's separate `getReserveConfig` function,
which returns `{collateralRisk, paused, frozen, borrowable, receiveSharesEnabled}`.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

Core Spoke contract address

##### reserveId

`bigint`

Reserve ID

#### Returns

`Promise`\<`ReserveResult`\>

Reserve data including `dynamicConfigKey`

***

### getTargetHealthFactor()

```ts
function getTargetHealthFactor(publicClient, spokeAddress): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:334](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L334)

Get the target health factor (THF) from the Core Spoke contract.

Per-spoke governance parameter. After a liquidation, the protocol targets
restoring the position to this health factor.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

Core Spoke contract address

#### Returns

`Promise`\<`bigint`\>

Target health factor in WAD (1e18 = 1.0). Example: 1.10 = 1_100_000_000_000_000_000n

***

### getDynamicReserveConfig()

```ts
function getDynamicReserveConfig(
   publicClient, 
   spokeAddress, 
   reserveId, 
dynamicConfigKey): Promise<DynamicReserveConfigResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts:359](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts#L359)

Get the dynamic reserve config from the Core Spoke contract.

Returns collateral factor, max liquidation bonus, and liquidation fee
for a specific reserve and dynamic config key.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### spokeAddress

`` `0x${string}` ``

Core Spoke contract address

##### reserveId

`bigint`

Reserve ID (e.g., vBTC reserve ID from indexer config)

##### dynamicConfigKey

`number`

Dynamic config key (from reserve data)

#### Returns

`Promise`\<`DynamicReserveConfigResult`\>

Dynamic reserve config with collateralFactor (BPS), maxLiquidationBonus (BPS), liquidationFee (BPS)

***

### buildReorderVaultsTx()

```ts
function buildReorderVaultsTx(contractAddress, permutedVaultIds): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:28](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L28)

Build transaction to reorder vaults for liquidation priority.

The permuted array must contain exactly the same vault IDs as the
current position, in the desired new order. Vaults are seized in
prefix order (index 0 first) during liquidation.

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

##### permutedVaultIds

`` `0x${string}` ``[]

Vault IDs in desired new order (must be a permutation of current vaults)

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters

***

### buildWithdrawCollateralsTx()

```ts
function buildWithdrawCollateralsTx(contractAddress, vaultIds): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:54](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L54)

Build transaction to withdraw selected vaults from AAVE position.

Withdraws specific vaults (partial withdrawal) and redeems them back to the depositor.
**Requires zero debt** - position must have no outstanding borrows.

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

##### vaultIds

`` `0x${string}` ``[]

Array of vault IDs (bytes32) to withdraw

#### Returns

[`TransactionParams`](#transactionparams)

Unsigned transaction parameters for execution with viem wallet

***

### buildBorrowTx()

```ts
function buildBorrowTx(
   contractAddress, 
   debtReserveId, 
   amount, 
   receiver): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:120](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L120)

Build transaction to borrow assets against vBTC collateral.

Borrows stablecoins (e.g., USDC) against your BTC collateral position.
Health factor must remain above 1.0 after borrowing, otherwise transaction will revert.

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

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
  "0x123...", // Adapter address
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
   borrower, 
   debtReserveId, 
   amount): TransactionParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts:182](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts#L182)

Build transaction to repay debt on AAVE position.

**Requires token approval** - user must approve adapter to spend debt token first.
Repays borrowed assets (partial or full repayment supported).

#### Parameters

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

##### borrower

`` `0x${string}` ``

Borrower's address (for self-repay, use connected wallet address)

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
import { buildRepayTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Build repay transaction (self-repay)
const txParams = buildRepayTx(
  AAVE_ADAPTER,
  borrowerAddress, // Connected wallet address for self-repay
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
1. Transfers tokens from user to adapter (requires approval)
2. Burns debt tokens from user's proxy
3. Updates position debt
4. Emits `Repaid` event

**Possible errors:**
- Insufficient token approval
- User doesn't have enough tokens
- Repay amount exceeds debt
- Position doesn't exist

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

### getGroup1FromOrder()

```ts
function getGroup1FromOrder<T>(
   order, 
   seizedFraction, 
   seizureTol): T[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:35](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L35)

Prefix walk: consume vaults front-to-back until target seizure is covered.
Returns the vaults in the first liquidation group.

#### Type Parameters

##### T

`T` *extends* [`CascadeVault`](#cascadevault)

#### Parameters

##### order

`T`[]

##### seizedFraction

`number`

##### seizureTol

`number`

#### Returns

`T`[]

***

### simulateCascade()

```ts
function simulateCascade<T>(
   order, 
   totalDebt, 
   seizedFraction, 
   seizureTol, 
   CF, 
   THF, 
   maxLB, 
   expectedHF): object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:93](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L93)

Simulate full liquidation cascade with debt model.

PRIMARY score:  sumBtcAfterEvents — sum of BTC remaining after every event.
                Captures how much collateral survives at each stage.
TIEBREAKER:     btcAfterG1 — BTC remaining after the first (most likely) event.

#### Type Parameters

##### T

`T` *extends* [`CascadeVault`](#cascadevault)

#### Parameters

##### order

`T`[]

##### totalDebt

`number`

##### seizedFraction

`number`

##### seizureTol

`number`

##### CF

`number`

##### THF

`number`

##### maxLB

`number`

##### expectedHF

`number`

#### Returns

`object`

##### sumBtcAfterEvents

```ts
sumBtcAfterEvents: number;
```

##### btcAfterG1

```ts
btcAfterG1: number;
```

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

Health factor value (e.g., `1.5`), or `Infinity` if no debt

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

### computeOptimalOrder()

```ts
function computeOptimalOrder<T>(
   vaults, 
   totalDebt, 
   seizedFraction, 
   seizureTol, 
   CF, 
   THF, 
   maxLB, 
   expectedHF): object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/optimalOrder.ts:162](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/optimalOrder.ts#L162)

Main optimizer: iterative refinement until stable.
Re-running with the improved order lets the next pass find better
G1 subsets. Converges in ≤3 iterations in practice.

#### Type Parameters

##### T

`T` *extends* [`CascadeVault`](#cascadevault)

#### Parameters

##### vaults

`T`[]

##### totalDebt

`number`

##### seizedFraction

`number`

##### seizureTol

`number`

##### CF

`number`

##### THF

`number`

##### maxLB

`number`

##### expectedHF

`number`

#### Returns

`object`

##### order

```ts
order: T[];
```

##### sumBtcAfterEvents

```ts
sumBtcAfterEvents: number;
```

##### btcAfterG1

```ts
btcAfterG1: number;
```

***

### computeTargetSeizureSats()

```ts
function computeTargetSeizureSats(params): bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:87](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L87)

Compute the target seizure amount in satoshis.

Uses `computeSeizedFraction` to determine what fraction of total collateral
would be seized, then converts to an absolute satoshi amount.

#### Parameters

##### params

[`TargetSeizureParams`](#targetseizureparams)

Total collateral and risk parameters

#### Returns

`bigint`

Target seizure amount in satoshis (rounded up)

#### Example

```typescript
const targetSats = computeTargetSeizureSats({
  totalCollateralSats: 1_000_000_000n, // 10 BTC
  CF: 0.75,
  LB: 1.05,
  THF: 1.10,
  expectedHF: 0.95,
});
// targetSats ≈ 398_000_000n (3.98 BTC)
```

***

### simulatePrefixSeizure()

```ts
function simulatePrefixSeizure(params): PrefixSeizureResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts:130](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/seizureSimulation.ts#L130)

Simulate prefix seizure for a given set of ordered vaults.

Walks the ordered vault list, accumulating amounts until the target
seizure is covered. Returns which vaults are seized vs protected,
the over-seizure amount, and the cutoff index.

#### Parameters

##### params

[`PrefixSeizureParams`](#prefixseizureparams)

Ordered vaults and target seizure amount

#### Returns

[`PrefixSeizureResult`](#prefixseizureresult)

Seizure simulation result

#### Throws

Error if orderedVaults is empty

#### Throws

Error if targetSeizureSats is <= 0

#### Example

```typescript
const result = simulatePrefixSeizure({
  orderedVaults: [
    { id: "0xabc...", amountSats: 200_000_000n },
    { id: "0xdef...", amountSats: 300_000_000n },
    { id: "0x123...", amountSats: 500_000_000n },
  ],
  targetSeizureSats: 400_000_000n,
});
// result.seizedVaults = first 2 vaults (200M + 300M = 500M >= 400M)
// result.overSeizureSats = 100_000_000n
// result.cutoffIndex = 2
```

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

***

### computeSeizedFractionDetailed()

```ts
function computeSeizedFractionDetailed(
   CF, 
   LB, 
   THF, 
   expectedHF): object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:126](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L126)

Compute the fraction of collateral that would be seized during liquidation,
returning both the raw (unclamped) and clamped values.

The raw value is useful for detecting unusual protocol parameter combinations
(values outside [0, 1] indicate something unexpected).

Formula:
```
liq_penalty = LB × CF
seized_fraction = CF × (THF - expectedHF) / (THF - liq_penalty) × LB / expectedHF
```

#### Parameters

##### CF

`number`

Collateral factor (e.g. 0.75)

##### LB

`number`

Liquidation bonus (e.g. 1.05)

##### THF

`number`

Target health factor (e.g. 1.10)

##### expectedHF

`number`

Expected health factor at liquidation (e.g. 0.95)

#### Returns

`object`

Both the raw seized fraction and the clamped [0, 1] value

##### seizedFraction

```ts
seizedFraction: number;
```

##### seizedFractionRaw

```ts
seizedFractionRaw: number;
```

***

### computeSeizedFraction()

```ts
function computeSeizedFraction(
   CF, 
   LB, 
   THF, 
   expectedHF): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:164](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L164)

Compute the fraction of collateral that would be seized during liquidation.

#### Parameters

##### CF

`number`

Collateral factor (e.g. 0.75)

##### LB

`number`

Liquidation bonus (e.g. 1.05)

##### THF

`number`

Target health factor (e.g. 1.10)

##### expectedHF

`number`

Expected health factor at liquidation (e.g. 0.95)

#### Returns

`number`

Seized fraction clamped to [0, 1]

***

### computeOptimalSplit()

```ts
function computeOptimalSplit(params): OptimalSplitResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:198](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L198)

Compute the optimal split between a sacrificial vault and a protected vault.

The sacrificial vault (index 0) is sized to cover the target seizure amount
plus a safety margin. The protected vault (index 1) holds the remainder.

#### Parameters

##### params

[`OptimalSplitParams`](#optimalsplitparams)

Split parameters including total BTC, risk params, and safety margin

#### Returns

[`OptimalSplitResult`](#optimalsplitresult)

Split result with vault sizes, seized fraction, and target seizure

#### Example

```typescript
import { computeOptimalSplit } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const result = computeOptimalSplit({
  totalBtc: 1_000_000_000n, // 10 BTC in sats
  CF: 0.75,
  LB: 1.05,
  THF: 1.10,
  expectedHF: 0.95,
  safetyMargin: 1.05,
});
// result.sacrificialVault ≈ 418_000_000n (4.18 BTC)
// result.protectedVault ≈ 582_000_000n (5.82 BTC)
```

***

### computeMinDepositForSplit()

```ts
function computeMinDepositForSplit(params): bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:257](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L257)

Compute the minimum total deposit required for a 2-vault split.

Both vaults must be at least `minPegin` satoshis. This function returns
the minimum total deposit where both the sacrificial and protected vaults
would meet the minimum peg-in requirement.

#### Parameters

##### params

[`MinDepositForSplitParams`](#mindepositforsplitparams)

Parameters including minimum peg-in, seized fraction, and safety margin

#### Returns

`bigint`

Minimum total deposit in satoshis. Returns 0n in two cases:
  - `seizedFraction * safetyMargin >= 1`: split impossible (sacrificial vault would consume entire deposit)
  - `seizedFraction <= 0`: split not useful (no seizure expected at this health factor)

#### Example

```typescript
import { computeMinDepositForSplit } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const minDeposit = computeMinDepositForSplit({
  minPegin: 50_000n, // 0.0005 BTC
  seizedFraction: 0.398,
  safetyMargin: 1.05,
});
```

***

### checkRebalanceNeeded()

```ts
function checkRebalanceNeeded(params): RebalanceCheckResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts:319](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts#L319)

Check if the sacrificial vault (index 0) needs to be increased to cover
the current target seizure amount.

**Scope:** This function only checks whether the sacrificial vault's sizing
is adequate. It does NOT detect whether a split exists — a single vault that
exceeds the target coverage returns `needsRebalance: false`. Callers should
check `vaultAmounts.length < 2` separately to detect unsplit positions.

Used on position page load to detect when parameter changes (THF, CF, LB)
have made the current split insufficient.

#### Parameters

##### params

[`RebalanceCheckParams`](#rebalancecheckparams)

Current vault amounts and risk parameters

#### Returns

[`RebalanceCheckResult`](#rebalancecheckresult)

Whether rebalance is needed, with deficit details

#### Example

```typescript
import { checkRebalanceNeeded } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

const result = checkRebalanceNeeded({
  vaultAmounts: [300_000_000n, 700_000_000n], // 3 BTC sacrificial, 7 BTC protected
  CF: 0.75,
  LB: 1.05,
  THF: 1.10,
  expectedHF: 0.95,
  safetyMargin: 1.05,
});

if (result.needsRebalance) {
  console.log(`Sacrificial vault needs ${result.deficit} more sats`);
}
```

## Variables

### AAVE\_FUNCTION\_NAMES

```ts
const AAVE_FUNCTION_NAMES: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:12](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L12)

Aave contract function names
Centralized constants for contract interactions

#### Type Declaration

##### WITHDRAW\_COLLATERALS

```ts
readonly WITHDRAW_COLLATERALS: "withdrawCollaterals" = "withdrawCollaterals";
```

Withdraw selected vaults from position (partial withdrawal)

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

##### REORDER\_VAULTS

```ts
readonly REORDER_VAULTS: "reorderVaults" = "reorderVaults";
```

Reorder vault prefix ordering for liquidation priority

***

### BTC\_DECIMALS

```ts
const BTC_DECIMALS: 8 = 8;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:27](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L27)

BTC token decimals (satoshis)
1 BTC = 100,000,000 satoshis

***

### USDC\_DECIMALS

```ts
const USDC_DECIMALS: 6 = 6;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:33](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L33)

USDC token decimals
Used for debt calculations

***

### BPS\_TO\_PERCENT\_DIVISOR

```ts
const BPS_TO_PERCENT_DIVISOR: 100 = 100;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:46](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L46)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:54](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L54)

Full basis points scale (10000 BPS = 100%)

Use this when converting BPS directly to decimal:
Example: 8000 BPS / 10000 = 0.80

***

### AAVE\_BASE\_CURRENCY\_DECIMALS

```ts
const AAVE_BASE_CURRENCY_DECIMALS: 26 = 26;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:62](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L62)

Aave base currency decimals
Account data values (collateral, debt) use 1e26 = $1 USD

Reference: ISpoke.sol UserAccountData

***

### WAD\_DECIMALS

```ts
const WAD_DECIMALS: 18 = 18;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:70](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L70)

WAD decimals (1e18 = 1.0)
Used for health factor and collateral factor values

Reference: ISpoke.sol - "healthFactor expressed in WAD. 1e18 represents a health factor of 1.00"

***

### HEALTH\_FACTOR\_WARNING\_THRESHOLD

```ts
const HEALTH_FACTOR_WARNING_THRESHOLD: 1.5 = 1.5;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:76](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L76)

Health factor warning threshold
Positions below this are considered at risk of liquidation

***

### MIN\_HEALTH\_FACTOR\_FOR\_BORROW

```ts
const MIN_HEALTH_FACTOR_FOR_BORROW: 1.2 = 1.2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:82](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L82)

Minimum health factor allowed for borrowing
Prevents users from borrowing if resulting health factor would be below this.

***

### FULL\_REPAY\_BUFFER\_DIVISOR

```ts
const FULL_REPAY_BUFFER_DIVISOR: 10000n = 10000n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts:89](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts#L89)

Buffer for full repayment to account for interest accrual
between fetching debt and transaction execution.
0.01% buffer (1 basis point) - the contract only takes what's owed.

***

### SEIZURE\_TOL

```ts
const SEIZURE_TOL: 0.01 = 0.01;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:23](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L23)

1% tolerance for prefix walk coverage — avoids cliff flip at boundary

***

### MAX\_GROUPS

```ts
const MAX_GROUPS: 20 = 20;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:26](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L26)

Circuit breaker for group cascade loop

***

### MIN\_DEBT\_THRESHOLD

```ts
const MIN_DEBT_THRESHOLD: 0.01 = 0.01;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts:29](../../packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts#L29)

Minimum debt threshold to continue cascade (avoids infinite loop on dust)

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
