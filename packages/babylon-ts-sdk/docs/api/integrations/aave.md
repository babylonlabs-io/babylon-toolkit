[@babylonlabs-io/ts-sdk](../README.md) / integrations/aave

# integrations/aave

AAVE v4 Integration for Babylon Trustless BTC Vault

**Pure, reusable SDK for AAVE protocol integration** - Use your BTC as collateral to borrow stablecoins.

This module provides transaction builders, query functions, and utilities for:
- **Transaction Builders** - Build unsigned txs for borrow, repay, and withdraw
- **Query Functions** - Fetch live position data, health factor, debt amounts from AAVE spoke
- **Utility Functions** - Calculate health factor, select vaults, check safety

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

### AssetDrawnRateRequest

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

Identifies one Hub asset to read the drawn rate for.

#### Properties

##### hub

```ts
hub: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

Hub contract address (from the reserve's `hub` field).

##### assetId

```ts
assetId: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

Asset identifier on that Hub (from the reserve's `assetId` field).

***

### AssetDrawnRateResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

#### Properties

##### hub

```ts
hub: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

##### assetId

```ts
assetId: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

##### rateRay

```ts
rateRay: bigint | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

Annual borrow (drawn) rate in RAY (1e27 = 100%), or null on revert.

##### error

```ts
error: Error | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

***

### ReservePriceResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

#### Properties

##### reserveId

```ts
reserveId: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

##### priceRaw

```ts
priceRaw: bigint | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

Raw 1e8 base units, or null on revert.

##### error

```ts
error: Error | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

***

### AaveMarketPosition

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Aave position structure from the contract.
The adapter resolves the user's proxy and vaults from their address.

#### Properties

##### proxyContract

```ts
proxyContract: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

##### vaultIds

```ts
vaultIds: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

##### totalCollateralBTC

```ts
totalCollateralBTC: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Sum (in satoshis) of all vault amounts collateralised in this position.
Mirrors `MarketPosition.totalCollateralBTC` returned by
`AaveIntegrationAdapter.getPosition`.

***

### AaveSpokeUserAccountData

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

User account data from the Spoke
Contains aggregated position health data calculated by Aave using on-chain oracle prices.

#### Properties

##### riskPremium

```ts
riskPremium: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Risk premium

##### avgCollateralFactor

```ts
avgCollateralFactor: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Weighted average collateral factor in WAD (1e18 = 100%)

##### healthFactor

```ts
healthFactor: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Health factor in WAD (1e18 = 1.00)

##### totalCollateralValue

```ts
totalCollateralValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Total collateral value in base currency (1e26 = $1 USD)

##### totalDebtValueRay

```ts
totalDebtValueRay: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Total debt value in base currency, scaled by RAY (1e35 = $1 USD)

##### activeCollateralCount

```ts
activeCollateralCount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Number of active collateral reserves

##### borrowCount

```ts
borrowCount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Number of borrowed reserves

***

### AaveSpokeUserPosition

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

User position data from the Spoke

#### Properties

##### drawnShares

```ts
drawnShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Drawn debt shares

##### premiumShares

```ts
premiumShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Premium shares (interest)

##### premiumOffsetRay

```ts
premiumOffsetRay: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Premium offset, expressed in asset units scaled by RAY (signed)

##### suppliedShares

```ts
suppliedShares: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Supplied collateral shares

##### dynamicConfigKey

```ts
dynamicConfigKey: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Dynamic config key

***

### TransactionParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Transaction parameters for unsigned transactions
Compatible with viem's transaction format

#### Properties

##### to

```ts
to: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Contract address to call

##### data

```ts
data: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Encoded function data

##### value?

```ts
optional value: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Value to send (optional, defaults to 0)

***

### PositionSizeParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Position size parameters from the AaveIntegrationAdapter contract.
Controls maximum BTC position size and vault count per user.

#### Properties

##### maxPositionBTC

```ts
maxPositionBTC: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Maximum BTC position size allowed (in satoshis)

##### maxVaultsPerPosition

```ts
maxVaultsPerPosition: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/types.ts)

Maximum number of vaults per position

***

### CascadeVault

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

Minimal vault shape for cascade simulation.
UI layers extend this with display fields (e.g. `name`).

#### Properties

##### id

```ts
id: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

##### btc

```ts
btc: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

***

### OptimalSplitParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Parameters for computing the optimal vault split.

#### Properties

##### totalBtc

```ts
totalBtc: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Total deposit amount in satoshis

##### CF

```ts
CF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Collateral factor (e.g. 0.75 for 75%)

##### LB

```ts
LB: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Liquidation bonus (e.g. 1.05 for 5% bonus)

##### THF

```ts
THF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Target health factor (e.g. 1.10)

##### expectedHF

```ts
expectedHF: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Expected health factor at liquidation (e.g. 0.95)

##### safetyMargin

```ts
safetyMargin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Safety margin multiplier for the sacrificial vault (e.g. 1.05 for 5% buffer)

***

### OptimalSplitResult

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Result of the optimal vault split computation.

#### Properties

##### sacrificialVault

```ts
sacrificialVault: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Sacrificial vault amount in satoshis (index 0, seized first)

##### protectedVault

```ts
protectedVault: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Protected vault amount in satoshis (index 1, survives liquidation)

##### seizedFraction

```ts
seizedFraction: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Fraction of collateral that would be seized (0–1)

##### targetSeizureBtc

```ts
targetSeizureBtc: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Raw target seizure amount in satoshis (before safety margin)

***

### MinDepositForSplitParams

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Parameters for computing the minimum deposit required for a split.

#### Properties

##### minPegin

```ts
minPegin: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Minimum peg-in amount in satoshis

##### seizedFraction

```ts
seizedFraction: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Seized fraction (0–1), from computeOptimalSplit or computeSeizedFraction

##### safetyMargin

```ts
safetyMargin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

Safety margin multiplier (e.g. 1.05)

## Type Aliases

### HealthFactorStatus

```ts
type HealthFactorStatus = "safe" | "warning" | "risky" | "danger" | "no_debt";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts)

## Functions

### getAssetDrawnRatesSafe()

```ts
function getAssetDrawnRatesSafe(publicClient, requests): Promise<AssetDrawnRateResult[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/hub.ts)

Per-asset isolated read of `getAssetDrawnRate` for display lists (one bad
asset ≠ whole list blank). One multicall round-trip instead of one
`eth_call` per asset, with `allowFailure: true` so a single reverting asset
isolates to its own error entry. A network-level multicall failure marks
every asset failed rather than throwing — callers (display hooks) rely on
always getting a per-asset result array.

The returned rate is the linear annual rate in RAY (the Hub accrues
interest as `rate * dt / SECONDS_PER_YEAR`), i.e. an APR, not an APY.

#### Parameters

##### publicClient

##### requests

[`AssetDrawnRateRequest`](#assetdrawnraterequest)[]

#### Returns

`Promise`\<[`AssetDrawnRateResult`](#assetdrawnrateresult)[]\>

***

### getOracleAddress()

```ts
function getOracleAddress(publicClient, spokeAddress): Promise<`0x${string}`>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

`Spoke.ORACLE` is `immutable`; the result is safe to cache forever.

#### Parameters

##### publicClient

##### spokeAddress

`` `0x${string}` ``

#### Returns

`Promise`\<`` `0x${string}` ``\>

***

### getReservesPrices()

```ts
function getReservesPrices(
   publicClient, 
   oracleAddress, 
reserveIds): Promise<bigint[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

Batch read; reverts the WHOLE batch on the first bad reserve.

#### Parameters

##### publicClient

##### oracleAddress

`` `0x${string}` ``

##### reserveIds

`bigint`[]

#### Returns

`Promise`\<`bigint`[]\>

***

### getReservesPricesSafe()

```ts
function getReservesPricesSafe(
   publicClient, 
   oracleAddress, 
reserveIds): Promise<ReservePriceResult[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/oracle.ts)

Per-reserve isolated read for display lists (one bad source ≠ whole list
blank). One multicall round-trip instead of one `eth_call` per reserve:
each entry is `getReservesPrices([reserveId])` with `allowFailure: true`, so
a single reverting reserve isolates to its own error entry. A network-level
multicall failure marks every reserve failed rather than throwing — callers
(display hooks) rely on always getting a per-reserve result array.

#### Parameters

##### publicClient

##### oracleAddress

`` `0x${string}` ``

##### reserveIds

`bigint`[]

#### Returns

`Promise`\<[`ReservePriceResult`](#reservepriceresult)[]\>

***

### getPositionReserveTotalDebt()

```ts
function getPositionReserveTotalDebt(
   publicClient, 
   proxyContract, 
reserveId): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/positionProxy.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/positionProxy.ts)

Fee-inclusive total debt of the position held by `proxyContract` for
`reserveId`: Spoke debt plus the adapter's uncollected interest fee
(rounded up), computed lazily at the current block.

#### Parameters

##### publicClient

##### proxyContract

`` `0x${string}` ``

##### reserveId

`bigint`

#### Returns

`Promise`\<`bigint`\>

***

### getPosition()

```ts
function getPosition(
   publicClient, 
   contractAddress, 
user): Promise<AaveMarketPosition | null>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts)

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

### getPositionSizeParams()

```ts
function getPositionSizeParams(publicClient, contractAddress): Promise<PositionSizeParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/query.ts)

Get position size parameters from the adapter contract.

Returns the maximum BTC position size and maximum vaults per position
as configured on-chain.

#### Parameters

##### publicClient

Viem public client for reading contracts

##### contractAddress

`` `0x${string}` ``

AaveIntegrationAdapter contract address

#### Returns

`Promise`\<[`PositionSizeParams`](#positionsizeparams)\>

Position size parameters (maxPositionBTC, maxVaultsPerPosition)

***

### getUserAccountData()

```ts
function getUserAccountData(
   publicClient, 
   spokeAddress, 
userAddress): Promise<AaveSpokeUserAccountData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

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
- `totalDebtValueRay` - USD value in RAY-scaled base currency (1e53 = $1)
- `avgCollateralFactor` - Weighted average collateral factor in WAD (1e18 = 100%)
- `riskPremium` - Additional risk premium

**Use cases:**
- Check liquidation risk before borrowing
- Calculate safe borrow amount
- Monitor position health
- Display UI health indicators

***

### getUserPositionAndAccountData()

```ts
function getUserPositionAndAccountData(
   publicClient, 
   spokeAddress, 
   reserveId, 
   userAddress): Promise<{
  position: AaveSpokeUserPosition;
  accountData: AaveSpokeUserAccountData;
}>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

Read a user's position for one reserve and their aggregate account data in a
single hard-fail multicall. Both reads are required for the live position
view, so a revert on either rejects the whole call (matching the prior
`Promise.all`); the gain is one round-trip instead of two `eth_call`s.

#### Parameters

##### publicClient

##### spokeAddress

`` `0x${string}` ``

##### reserveId

`bigint`

##### userAddress

`` `0x${string}` ``

#### Returns

`Promise`\<\{
  `position`: [`AaveSpokeUserPosition`](#aavespokeuserposition);
  `accountData`: [`AaveSpokeUserAccountData`](#aavespokeuseraccountdata);
\}\>

***

### getUserPosition()

```ts
function getUserPosition(
   publicClient, 
   spokeAddress, 
   reserveId, 
userAddress): Promise<AaveSpokeUserPosition>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

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

### getUserTotalDebt()

```ts
function getUserTotalDebt(
   publicClient, 
   spokeAddress, 
   reserveId, 
userAddress): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

Get user's exact total debt in a reserve (token units, not shares).

Returns the Spoke-side amount owed including accrued interest — but NOT the
adapter's uncollected interest fee. Display/routing only; for full repayment
see the remarks below. Debt accrues interest every block, so fetch it live.

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
import { getUserTotalDebt } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { formatUnits } from "viem";

const totalDebt = await getUserTotalDebt(
  publicClient,
  AAVE_SPOKE_ADDRESS,
  2n, // USDC reserve
  proxyAddress
);

console.log("Debt:", formatUnits(totalDebt, 6), "USDC");
```

#### Remarks

**Important for full repayment:** do NOT repay a plain amount derived from
this quote — it excludes the adapter's interest fee, and rounding can leave
residual debt shares (dust). Send the repay-all sentinel
(`type(uint256).max`) with an approval sized from the position proxy's
fee-inclusive `getPositionReserveTotalDebt` plus
`FULL_REPAY_BUFFER_DIVISOR` headroom; the adapter pulls only what's owed.
For partial repayment, use any amount less than total debt.

***

### getUserPositions()

```ts
function getUserPositions(
   publicClient, 
   spokeAddress, 
   reserveIds, 
userAddress): Promise<(AaveSpokeUserPosition | null)[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

Probe `getUserPosition` for many reserves in a single multicall.

Returns one entry per `reserveId` in input order. Per-reserve reverts are
isolated (`allowFailure: true`): that entry is `null` while the rest of the
batch still resolves. Use for debt-reserve discovery, where a failed read
means "treat as no debt", not a fatal error.

#### Parameters

##### publicClient

##### spokeAddress

`` `0x${string}` ``

##### reserveIds

`bigint`[]

##### userAddress

`` `0x${string}` ``

#### Returns

`Promise`\<([`AaveSpokeUserPosition`](#aavespokeuserposition) \| `null`)[]\>

***

### getUserTotalDebts()

```ts
function getUserTotalDebts(
   publicClient, 
   spokeAddress, 
   reserveIds, 
userAddress): Promise<bigint[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

Read `getUserTotalDebt` for many reserves in a single multicall.

Hard-fails (`allowFailure: false`): any reserve's revert rejects the whole
call. Use only for reserves already known to carry debt — there a failed
read is a genuine error, not a "no debt" signal.

#### Parameters

##### publicClient

##### spokeAddress

`` `0x${string}` ``

##### reserveIds

`bigint`[]

##### userAddress

`` `0x${string}` ``

#### Returns

`Promise`\<`bigint`[]\>

***

### getReserve()

```ts
function getReserve(
   publicClient, 
   spokeAddress, 
reserveId): Promise<ReserveResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/spoke.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/clients/transaction.ts)

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

Amount to repay in token units for a partial repay. For a
  FULL repay, pass `type(uint256).max` (the repay-all sentinel): the adapter
  resolves it to the position's fee-inclusive debt in the same transaction
  and pulls exactly that. Size the prior approval from
  `getPositionReserveTotalDebt()` plus ceiling-divided
  `FULL_REPAY_BUFFER_DIVISOR` headroom.

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts)

Convert Aave base currency value to USD

Aave uses 1e26 = $1 USD for collateral values.

#### Parameters

##### value

`bigint`

Value in Aave base currency (1e26 = $1)

#### Returns

`number`

Value in USD

***

### aaveRayValueToUsd()

```ts
function aaveRayValueToUsd(value): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts)

Convert Aave RAY-scaled base currency value to USD

Debt values use higher precision: 1e53 = $1 USD.

#### Parameters

##### value

`bigint`

Value in RAY-scaled base currency (1e53 = $1)

#### Returns

`number`

Value in USD

***

### wadToNumber()

```ts
function wadToNumber(value): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/aaveConversions.ts)

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

### getGroup1FromOrder()

```ts
function getGroup1FromOrder<T>(
   order, 
   seizedFraction, 
   seizureTol): T[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/debtUtils.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/debtUtils.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts)

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

### getHealthFactorStatusFromValue()

```ts
function getHealthFactorStatusFromValue(value): HealthFactorStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/healthFactor.ts)

Calculate health factor for an AAVE position.

**Formula:** `HF = (Collateral × Liquidation Threshold) / Total Debt`

Health factor determines liquidation risk:
- `> 2.0` - Safe (green)
- `1.1 - 2.0` - Warning (amber)
- `1.0 - 1.1` - Risky (red)
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
// Result: 1.6 (warning: at or below the warning threshold)

if (hf < 1.0) {
  console.error("Position can be liquidated!");
} else if (hf <= HEALTH_FACTOR_WARNING_THRESHOLD) {
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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/optimalOrder.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/optimalOrder.ts)

Main optimizer: bitmask DP over seized subsets.

State: T = bitmask of vaults that have already been seized.
Transition: for each valid "last group" G ⊆ T, dp[T] = dp[T\G] + btcAfter
  where btcAfter = totalBtc − btcOf(T)   (BTC remaining after T is seized).
Validation: btcOf(G) must cover target seizure at the moment G fires, i.e.
  btcOf(G) ≥ (totalBtc − btcOf(T\G)) × seizedFraction × (1 − seizureTol).

Complexity: O(3^n) — the subset-of-subset enumeration visits exactly
Σ C(n,k) × 2^k = 3^n state-transition pairs. Single pass, no refinement loop.

Objective: maximize sumBtcAfterEvents assuming all events fire. Debt is not
part of the DP state — it is used only when computing final metrics via
simulateCascade() on the reconstructed order.

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

### computeSeizedFractionDetailed()

```ts
function computeSeizedFractionDetailed(
   CF, 
   LB, 
   THF, 
   expectedHF): object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts)

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

## Variables

### AAVE\_FUNCTION\_NAMES

```ts
const AAVE_FUNCTION_NAMES: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

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

### BPS\_SCALE

```ts
const BPS_SCALE: 10000 = 10000;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Full basis points scale (10000 BPS = 100%)

Use this when converting BPS directly to decimal:
Example: 8000 BPS / 10000 = 0.80

***

### AAVE\_BASE\_CURRENCY\_DECIMALS

```ts
const AAVE_BASE_CURRENCY_DECIMALS: 26 = 26;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Aave base currency decimals
Account data values (collateral, debt) use 1e26 = $1 USD

Reference: ISpoke.sol UserAccountData

***

### AAVE\_BASE\_CURRENCY\_RAY\_DECIMALS

```ts
const AAVE_BASE_CURRENCY_RAY_DECIMALS: 53 = 53;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Aave RAY-scaled base currency decimals
Debt values (totalDebtValueRay) use 1e53 = $1 USD
(base currency 1e26 scaled by RAY 1e27).

Reference: IAaveSpoke.sol UserAccountData.totalDebtValueRay

***

### HEALTH\_FACTOR\_RISKY\_THRESHOLD

```ts
const HEALTH_FACTOR_RISKY_THRESHOLD: 1.1 = 1.1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Health factor risky threshold.
A position from 1.0 up to and including this value is "risky".

***

### HEALTH\_FACTOR\_WARNING\_THRESHOLD

```ts
const HEALTH_FACTOR_WARNING_THRESHOLD: 2 = 2.0;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Health factor warning threshold.
A position above HEALTH_FACTOR_RISKY_THRESHOLD and up to and including this
value is "warning". A position above this value is "safe".

***

### MIN\_HEALTH\_FACTOR\_FOR\_BORROW

```ts
const MIN_HEALTH_FACTOR_FOR_BORROW: 1.05 = 1.05;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Minimum health factor allowed for borrowing. Collateral factor doubles as the
liquidation threshold here, so this floor is the only borrow→liquidation cushion.

***

### FULL\_REPAY\_BUFFER\_DIVISOR

```ts
const FULL_REPAY_BUFFER_DIVISOR: 200n = 200n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/constants.ts)

Approval headroom for repay-all, sized against interest accrual between
quoting the debt and transaction execution.

0.5% buffer (50 basis points). Sized to absorb hours of execution delay
(e.g. Safe-multisig quorum collection). The repay itself sends the
repay-all sentinel and the adapter pulls only what's actually owed; the
buffer only pads the approval cap, and the cap is additionally bounded by
the user's balance, so a larger buffer never blocks a legitimate repay.

***

### SEIZURE\_TOL

```ts
const SEIZURE_TOL: 0.01 = 0.01;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

1% tolerance for prefix walk coverage — avoids cliff flip at boundary

***

### MAX\_GROUPS

```ts
const MAX_GROUPS: 20 = 20;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

Circuit breaker for group cascade loop

***

### MIN\_DEBT\_THRESHOLD

```ts
const MIN_DEBT_THRESHOLD: 0.01 = 0.01;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/cascadeSimulation.ts)

Minimum debt threshold to continue cascade (avoids infinite loop on dust)

***

### MAX\_DP\_N

```ts
const MAX_DP_N: 17 = 17;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/optimalOrder.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/optimalOrder.ts)

Hard cap on vault count for the bitmask DP optimizer. 2^n memory + 3^n work
blow up past this. For n > MAX_DP_N the optimizer falls back to a
largest-first heuristic. Benchmark: n=18 ≈ 720ms, n=20 ≈ 5.8s — anything past
n=17 is too slow for interactive UI, so we cap here.
