# Complete Aave Integration Guide

**Building a Full-Stack Aave + Babylon TBV Application**

This guide shows you how to build a complete Aave integration using both the Babylon TypeScript SDK and the Babylon GraphQL indexer - exactly how the Babylon team's own vault service does it.

## Overview

To build a production-ready Aave integration, you need **two data sources**:

1. **@babylonlabs-io/ts-sdk** - Transaction builders, RPC queries, utilities
2. **Babylon GraphQL Indexer** - Contract addresses, positions, vault data, historical events

This guide combines both to show complete implementation patterns.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation & Setup](#installation--setup)
3. [Babylon Indexer Integration](#babylon-indexer-integration)
4. [Complete Operation Flows](#complete-operation-flows)
5. [Architecture Patterns](#architecture-patterns)
6. [Reference Implementation](#reference-implementation)

---

## Prerequisites

### Required Access

**Babylon GraphQL Indexer**:
- Endpoint URL (contact Babylon team)
- May require API key for production
- GraphQL schema documentation

**Smart Contract Knowledge**:
- Understanding of Aave v4 lending protocol
- Health factor and liquidation concepts
- BTC vault system (peg-in/peg-out flow)

### Technical Requirements

```bash
# Core dependencies
npm install @babylonlabs-io/ts-sdk viem graphql-request

# For React applications (recommended)
npm install @tanstack/react-query wagmi
```

---

## Installation & Setup

### 1. Initialize Clients

```typescript
import { GraphQLClient } from "graphql-request";
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";

// GraphQL client for Babylon indexer
const graphqlClient = new GraphQLClient(
  "https://indexer.babylonlabs.io/graphql",
  {
    headers: {
      // Add authentication if required
      // "Authorization": "Bearer YOUR_API_KEY"
    },
  }
);

// Ethereum RPC clients (for SDK functions)
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(),
  account: "0x...", // User's account
});
```

### 2. Environment Configuration

```typescript
// .env
GRAPHQL_ENDPOINT=https://indexer.babylonlabs.io/graphql
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
CHAIN_ID=11155111  # Sepolia
```

---

## Babylon Indexer Integration

### Essential GraphQL Queries

The Babylon indexer provides all configuration and position data. Here are the core queries you need:

#### Query 1: Fetch Aave Configuration

**What it returns**: Contract addresses, reserve IDs, and system configuration.

```typescript
import { gql } from "graphql-request";

const GET_AAVE_CONFIG = gql`
  query GetAaveConfig {
    aaveConfig(id: 1) {
      # Contract addresses
      controllerAddress
      vaultBtcAddress
      btcVaultManagerAddress
      btcVaultCoreSpokeAddress
      btcVaultCoreSpokeProxyImplementation

      # Reserve IDs
      btcVaultCoreVbtcReserveId
    }
  }
`;

// Usage
const { aaveConfig } = await graphqlClient.request(GET_AAVE_CONFIG);

const AAVE_CONTROLLER = aaveConfig.controllerAddress;
const AAVE_SPOKE = aaveConfig.btcVaultCoreSpokeAddress;
const VBTC_RESERVE_ID = BigInt(aaveConfig.btcVaultCoreVbtcReserveId);
```

#### Query 2: Fetch Aave Reserves

**What it returns**: All borrowable assets with metadata and risk parameters.

```typescript
const GET_AAVE_RESERVES = gql`
  query GetAaveReserves {
    aaveReserves(where: { borrowable: true, paused: false, frozen: false }) {
      items {
        id
        underlying
        decimals
        borrowable
        paused
        frozen
        collateralFactor  # Liquidation threshold in BPS
        underlyingToken {
          address
          symbol
          name
          decimals
        }
      }
    }
  }
`;

// Usage
const { aaveReserves } = await graphqlClient.request(GET_AAVE_RESERVES);

// Find specific reserve
const usdcReserve = aaveReserves.items.find(
  r => r.underlyingToken.symbol === "USDC"
);
const USDC_RESERVE_ID = BigInt(usdcReserve.id);
```

#### Query 3: Fetch User Positions

**What it returns**: User's lending positions with collateral details.

```typescript
const GET_USER_POSITIONS = gql`
  query GetUserPositions($depositor: String!) {
    aavePositions(where: { depositor: $depositor, totalCollateral_gt: "0" }) {
      items {
        id
        depositor
        depositorBtcPubKey
        reserveId
        proxyContract
        totalCollateral
        createdAt
        updatedAt
        collaterals {
          items {
            vaultId
            amount
            addedAt
            removedAt
            vault {
              id
              amount
              status
            }
          }
        }
      }
    }
  }
`;

// Usage
const positions = await graphqlClient.request(GET_USER_POSITIONS, {
  depositor: userAddress.toLowerCase(),
});

const position = positions.aavePositions.items[0];
console.log("Position ID:", position.id);
console.log("Proxy Contract:", position.proxyContract);
console.log("Vaults in use:", position.collaterals.items.length);
```

#### Query 4: Fetch Available Vaults

**What it returns**: User's vaults that can be used as collateral.

```typescript
const GET_AVAILABLE_VAULTS = gql`
  query GetAvailableVaults($depositor: String!) {
    btcVaults(where: { depositor: $depositor, status: "Available" }) {
      items {
        id
        amount
        status
        pegInTxHash
        createdAt
      }
    }
  }
`;

// Usage
const vaultsData = await graphqlClient.request(GET_AVAILABLE_VAULTS, {
  depositor: userAddress.toLowerCase(),
});

// Convert to SDK format (satoshis → BTC)
const availableVaults = vaultsData.btcVaults.items.map(v => ({
  id: v.id,
  amount: Number(v.amount) / 1e8,  // Convert satoshis to BTC
}));
```

#### Query 5: Check Vault Status

**What it returns**: Whether a vault is available for use.

```typescript
const GET_VAULT_STATUS = gql`
  query GetVaultStatus($vaultId: String!) {
    aaveVaultStatus(vaultId: $vaultId) {
      vaultId
      status  # "available" | "in_use" | "redeemed"
      updatedAt
    }
  }
`;

// Usage
const vaultStatus = await graphqlClient.request(GET_VAULT_STATUS, {
  vaultId: "0x...",
});

const isAvailable = vaultStatus?.aaveVaultStatus?.status === "available";
```

### Service Layer Pattern

**Recommended**: Wrap GraphQL queries in service functions (like Babylon's vault service does):

```typescript
// services/aaveConfig.ts
export async function fetchAaveConfig() {
  const { aaveConfig, aaveReserves } = await graphqlClient.request(gql`
    query {
      aaveConfig(id: 1) {
        controllerAddress
        btcVaultCoreSpokeAddress
        btcVaultCoreVbtcReserveId
      }
      aaveReserves(where: { borrowable: true }) {
        items {
          id
          underlyingToken {
            symbol
            decimals
          }
        }
      }
    }
  `);

  return {
    controllerAddress: aaveConfig.controllerAddress,
    spokeAddress: aaveConfig.btcVaultCoreSpokeAddress,
    vbtcReserveId: BigInt(aaveConfig.btcVaultCoreVbtcReserveId),
    borrowableReserves: aaveReserves.items,
  };
}
```

---

## Complete Operation Flows

Each operation combines indexer data with SDK functions. Here's how to implement each flow:

### Operation 1: Add Collateral (Full Stack)

**Complete flow**: Fetch vaults → Select vaults → Build transaction → Execute

```typescript
import {
  selectVaultsForAmount,
  buildAddCollateralTx
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

async function addCollateralFlow(targetBtc: number) {
  // Step 1: Fetch config from indexer
  const config = await fetchAaveConfig();

  // Step 2: Fetch available vaults from indexer
  const vaultsData = await graphqlClient.request(GET_AVAILABLE_VAULTS, {
    depositor: userAddress.toLowerCase(),
  });

  const availableVaults = vaultsData.btcVaults.items.map(v => ({
    id: v.id,
    amount: Number(v.amount) / 1e8,
  }));

  // Step 3: Select vaults using SDK
  const { vaultIds, actualAmount } = selectVaultsForAmount(
    availableVaults,
    targetBtc
  );

  console.log(`Selected ${vaultIds.length} vaults for ${actualAmount} BTC`);

  // Step 4: Build transaction using SDK
  const txParams = buildAddCollateralTx(
    config.controllerAddress,
    vaultIds,
    config.vbtcReserveId
  );

  // Step 5: Execute transaction
  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  console.log("✅ Collateral added:", hash);

  return hash;
}
```

### Operation 2: Borrow (Full Stack)

**Complete flow**: Fetch position → Check health → Calculate safe amount → Borrow

```typescript
import {
  buildBorrowTx,
  getUserAccountData,
  getHealthFactorStatus,
  aaveValueToUsd,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

async function borrowFlow(amountUsd: number, assetSymbol: string) {
  // Step 1: Fetch config and position from indexer
  const config = await fetchAaveConfig();
  const positions = await graphqlClient.request(GET_USER_POSITIONS, {
    depositor: userAddress.toLowerCase(),
  });

  const position = positions.aavePositions.items[0];
  if (!position) throw new Error("No position found");

  // Step 2: Get live health factor from RPC (SDK query)
  const accountData = await getUserAccountData(
    publicClient,
    config.spokeAddress,
    position.proxyContract
  );

  const healthFactor = Number(accountData.healthFactor) / 1e18;
  const status = getHealthFactorStatus(
    healthFactor,
    accountData.borrowedCount > 0n
  );

  console.log(`Current Health Factor: ${healthFactor.toFixed(2)} (${status})`);

  // Step 3: Verify safe to borrow
  if (status !== "safe") {
    throw new Error(`Unsafe to borrow: health factor is ${status}`);
  }

  // Step 4: Find reserve ID for asset
  const { aaveReserves } = await graphqlClient.request(GET_AAVE_RESERVES);
  const reserve = aaveReserves.items.find(
    r => r.underlyingToken.symbol === assetSymbol
  );

  if (!reserve) throw new Error(`Reserve not found: ${assetSymbol}`);

  const reserveId = BigInt(reserve.id);
  const amount = BigInt(amountUsd * 10 ** reserve.underlyingToken.decimals);

  // Step 5: Build and execute borrow transaction (SDK)
  const txParams = buildBorrowTx(
    config.controllerAddress,
    position.id,
    reserveId,
    amount,
    userAddress
  );

  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  console.log(`✅ Borrowed ${amountUsd} ${assetSymbol}:`, hash);

  return hash;
}
```

### Operation 3: Repay (Full Stack)

**Complete flow**: Get exact debt → Approve token → Repay

```typescript
import {
  buildRepayTx,
  getUserTotalDebt,
  FULL_REPAY_BUFFER_BPS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

async function repayFlow(assetSymbol: string, partialAmountUsd?: number) {
  // Step 1: Fetch config and position
  const config = await fetchAaveConfig();
  const positions = await graphqlClient.request(GET_USER_POSITIONS, {
    depositor: userAddress.toLowerCase(),
  });

  const position = positions.aavePositions.items[0];
  if (!position) {
    throw new Error("No Aave position found for this user");
  }

  // Step 2: Get reserve info
  const { aaveReserves } = await graphqlClient.request(GET_AAVE_RESERVES);
  const reserve = aaveReserves.items.find(
    r => r.underlyingToken.symbol === assetSymbol
  );
  if (!reserve) {
    throw new Error(`No Aave reserve found for asset symbol: ${assetSymbol}`);
  }

  const reserveId = BigInt(reserve.id);
  const decimals = reserve.underlyingToken.decimals;

  // Step 3: Get exact current debt from RPC (SDK query)
  const totalDebt = await getUserTotalDebt(
    publicClient,
    config.spokeAddress,
    reserveId,
    position.proxyContract
  );

  console.log(`Total debt: ${Number(totalDebt) / 10 ** decimals} ${assetSymbol}`);

  // Step 4: Determine repay amount
  const amount = partialAmountUsd
    ? BigInt(partialAmountUsd * 10 ** decimals)
    : totalDebt + totalDebt / FULL_REPAY_BUFFER_BPS;  // Add buffer for interest

  // Step 5: Approve token spending
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
    address: reserve.underlyingToken.address,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [config.controllerAddress, amount],
  });

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("✅ Token approval complete");

  // Step 6: Build and execute repay transaction (SDK)
  const txParams = buildRepayTx(
    config.controllerAddress,
    position.id,
    reserveId,
    amount
  );

  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  console.log(`✅ Repaid ${assetSymbol}:`, hash);

  return hash;
}
```

### Operation 4: Withdraw Collateral (Full Stack)

**Complete flow**: Verify no debt → Withdraw → Update vault status

```typescript
import {
  buildWithdrawAllCollateralTx,
  hasDebt,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

async function withdrawCollateralFlow() {
  // Step 1: Fetch config and position
  const config = await fetchAaveConfig();
  const positions = await graphqlClient.request(GET_USER_POSITIONS, {
    depositor: userAddress.toLowerCase(),
  });

  const position = positions.aavePositions.items[0];
  if (!position) {
    throw new Error("No Aave position found for this user");
  }

  // Step 2: Verify no debt across all borrowable reserves
  const { aaveReserves } = await graphqlClient.request(GET_AAVE_RESERVES);

  for (const reserve of aaveReserves.items) {
    const reserveId = BigInt(reserve.id);
    const userHasDebt = await hasDebt(
      publicClient,
      config.spokeAddress,
      reserveId,
      position.proxyContract
    );

    if (userHasDebt) {
      throw new Error(
        `Cannot withdraw: outstanding debt in ${reserve.underlyingToken.symbol}`
      );
    }
  }

  console.log("✅ No outstanding debt - safe to withdraw");

  // Step 3: Build and execute withdraw transaction (SDK)
  const txParams = buildWithdrawAllCollateralTx(
    config.controllerAddress,
    config.vbtcReserveId
  );

  const hash = await walletClient.sendTransaction({
    to: txParams.to,
    data: txParams.data,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  console.log("✅ Collateral withdrawn:", hash);
  console.log("Vaults are now back to Available status");

  return hash;
}
```

---

## Architecture Patterns

### Recommended Application Structure

Based on the Babylon vault service implementation:

```
your-app/
├── src/
│   ├── clients/
│   │   ├── graphql/
│   │   │   └── client.ts              # GraphQL client setup
│   │   └── ethereum/
│   │       └── client.ts              # Viem clients setup
│   ├── services/
│   │   ├── aave/
│   │   │   ├── fetchConfig.ts         # GraphQL: config
│   │   │   ├── fetchReserves.ts       # GraphQL: reserves
│   │   │   ├── fetchPositions.ts      # GraphQL: positions
│   │   │   ├── fetchVaults.ts         # GraphQL: vaults
│   │   │   └── positionService.ts     # Combine indexer + SDK
│   │   └── transactions/
│   │       ├── addCollateral.ts       # SDK: buildAddCollateralTx
│   │       ├── borrow.ts              # SDK: buildBorrowTx
│   │       └── repay.ts               # SDK: buildRepayTx
│   ├── hooks/
│   │   ├── useAaveConfig.ts           # React Query: config
│   │   ├── useAavePosition.ts         # React Query: position + live data
│   │   └── useAddCollateral.ts        # Transaction execution
│   └── components/
│       └── aave/
│           ├── PositionOverview.tsx
│           ├── BorrowModal.tsx
│           └── CollateralSelector.tsx
```

### Service Layer Pattern (TypeScript)

**Combine indexer data with SDK functions**:

```typescript
// services/aave/positionService.ts
import {
  getUserAccountData,
  getHealthFactorStatus,
  aaveValueToUsd,
  wadToNumber,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export async function getUserPositionWithLiveData(
  userAddress: string,
  publicClient: PublicClient,
  spokeAddress: Address
) {
  // Fetch position from indexer
  const { aavePositions } = await graphqlClient.request(GET_USER_POSITIONS, {
    depositor: userAddress.toLowerCase(),
  });

  const position = aavePositions.items[0];
  if (!position) return null;

  // Fetch live data from RPC (SDK query)
  const accountData = await getUserAccountData(
    publicClient,
    spokeAddress,
    position.proxyContract
  );

  // Combine indexer + RPC data
  return {
    // From indexer
    positionId: position.id,
    proxyContract: position.proxyContract,
    vaults: position.collaterals.items,
    totalCollateralSats: BigInt(position.totalCollateral),

    // From RPC (live, authoritative)
    healthFactor: wadToNumber(accountData.healthFactor),
    healthFactorStatus: getHealthFactorStatus(
      wadToNumber(accountData.healthFactor),
      accountData.borrowedCount > 0n
    ),
    collateralValueUsd: aaveValueToUsd(accountData.totalCollateralValue),
    debtValueUsd: aaveValueToUsd(accountData.totalDebtValue),
    borrowedAssetCount: Number(accountData.borrowedCount),
  };
}
```

### React Integration Pattern

**Using React Query + Wagmi** (recommended):

```typescript
// hooks/useAavePosition.ts
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

export function useAavePosition(userAddress: string | undefined) {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["aavePosition", userAddress],
    queryFn: async () => {
      if (!userAddress || !publicClient) return null;

      const config = await fetchAaveConfig();
      return getUserPositionWithLiveData(
        userAddress,
        publicClient,
        config.spokeAddress
      );
    },
    enabled: Boolean(userAddress && publicClient),
    refetchInterval: 10000,  // Refresh every 10s for live health factor
  });
}

// Usage in component
function PositionOverview() {
  const { address } = useAccount();
  const { data: position, isLoading } = useAavePosition(address);

  if (!position) return <div>No position found</div>;

  return (
    <div>
      <h2>Your Position</h2>
      <p>Health Factor: {position.healthFactor.toFixed(2)}</p>
      <p>Status: {position.healthFactorStatus}</p>
      <p>Collateral: ${position.collateralValueUsd.toFixed(2)}</p>
      <p>Debt: ${position.debtValueUsd.toFixed(2)}</p>
    </div>
  );
}
```

---

## Reference Implementation

### Babylon Vault Service Structure

The Babylon team's own production vault service uses this exact architecture:

**Directory Structure** (73 Aave files):

```
services/vault/src/applications/aave/
├── clients/
│   ├── transaction.ts          # Wraps SDK transaction builders
│   ├── spoke.ts               # SDK RPC queries
│   ├── query.ts               # Combined queries
│   └── index.ts
├── services/
│   ├── fetchConfig.ts         # GraphQL: contract addresses
│   ├── fetchReserves.ts       # GraphQL: borrowable reserves
│   ├── fetchPositions.ts      # GraphQL: user positions
│   ├── fetchVaultStatus.ts    # GraphQL: vault availability
│   ├── positionService.ts     # Combines indexer + RPC data
│   ├── positionTransactions.ts # Transaction execution
│   └── reserveService.ts      # Reserve data management
├── hooks/
│   ├── useAaveUserPosition.ts      # Position + live data
│   ├── useAaveVaults.ts            # Available vaults
│   ├── useAaveBorrowedAssets.ts    # Borrowed assets
│   ├── useAddCollateralTransaction.ts
│   ├── useBorrowTransaction.ts
│   ├── useRepayTransaction.ts
│   └── useWithdrawCollateralTransaction.ts
├── components/
│   ├── Overview/               # Position overview page
│   ├── Detail/                 # Reserve detail page
│   ├── CollateralModal/        # Add/withdraw collateral
│   ├── LoanCard/              # Borrow/repay UI
│   │   ├── Borrow/
│   │   └── Repay/
│   └── [more components...]
├── context/
│   ├── AaveConfigContext.tsx   # App-wide config
│   └── PendingVaultsContext.tsx # Optimistic updates
├── routes.tsx
└── index.ts
```

**Key Patterns**:

1. **GraphQL Service Layer**: All indexer queries wrapped in service functions
2. **SDK Transaction Wrappers**: Thin wrappers around SDK builders
3. **Combined Queries**: Merge indexer data with RPC queries for complete view
4. **React Query Integration**: Automatic caching and refetching
5. **Optimistic Updates**: Pending vault tracking for better UX

**Reference Files** (you can study these):

- `services/fetchConfig.ts` - How to fetch and cache configuration
- `services/positionService.ts` - Combining indexer + SDK data
- `hooks/useAaveUserPosition.ts` - Complete position hook with live data
- `components/LoanCard/Borrow/hooks/useBorrowMetrics.ts` - Safe borrow calculations

---

## Best Practices

### 1. Separate Concerns

**✅ DO**:
```typescript
// Service layer: GraphQL queries
async function fetchPosition(address: string) {
  return await graphqlClient.request(GET_USER_POSITIONS, { depositor: address });
}

// SDK layer: RPC queries
async function getLiveHealthFactor(proxyAddress: Address) {
  const data = await getUserAccountData(publicClient, spoke, proxyAddress);
  return Number(data.healthFactor) / 1e18;
}

// Combine in higher layer
async function getCompletePosition(address: string) {
  const position = await fetchPosition(address);
  const healthFactor = await getLiveHealthFactor(position.proxyContract);
  return { ...position, healthFactor };
}
```

**❌ DON'T**:
```typescript
// Mixing concerns in one function
async function getPosition() {
  // GraphQL + SDK + business logic all mixed together
}
```

### 2. Cache Configuration

```typescript
// Fetch config once, cache in context
const AaveConfigContext = createContext<AaveConfig | null>(null);

export function AaveConfigProvider({ children }) {
  const { data: config } = useQuery({
    queryKey: ["aaveConfig"],
    queryFn: fetchAaveConfig,
    staleTime: Infinity,  // Config rarely changes
  });

  return (
    <AaveConfigContext.Provider value={config}>
      {children}
    </AaveConfigContext.Provider>
  );
}
```

### 3. Handle Live Data Carefully

```typescript
// Health factor is live - refetch often
useQuery({
  queryKey: ["healthFactor", proxyAddress],
  queryFn: () => getUserAccountData(...),
  refetchInterval: 10000,  // Every 10 seconds
});

// Position structure is historical - refetch less
useQuery({
  queryKey: ["position", address],
  queryFn: () => fetchPosition(...),
  refetchInterval: 60000,  // Every minute
});
```

### 4. Error Handling

```typescript
async function safeExecuteTransaction(txFn: () => Promise<string>) {
  try {
    return await txFn();
  } catch (error: any) {
    // Map viem errors to user-friendly messages
    if (error.message?.includes("User rejected")) {
      throw new Error("Transaction cancelled");
    }
    if (error.message?.includes("insufficient funds")) {
      throw new Error("Insufficient ETH for gas");
    }
    if (error.message?.includes("execution reverted")) {
      const reason = error.message.match(/reason: (.+)/)?.[1] || "Transaction failed";
      throw new Error(reason);
    }
    throw error;
  }
}
```

---

## Next Steps

1. **Set up indexer access** - Contact Babylon team for endpoint and authentication
2. **Study reference implementation** - Review Babylon's vault service code
3. **Start with config** - Fetch configuration and display reserves
4. **Implement one flow** - Start with "Add Collateral" end-to-end
5. **Add React integration** - Use React Query for state management
6. **Test on testnet** - Use Sepolia before going to mainnet

## Additional Resources

- **SDK Documentation**: [README.md](./README.md) - SDK function reference
- **SDK Quickstart**: [quickstart.md](./quickstart.md) - Individual function examples
- **Babylon Vault Service**: `babylon-toolkit/services/vault/src/applications/aave/` - Reference implementation
- **Aave v4 Docs**: Official Aave protocol documentation
- **GraphQL Schema**: Contact Babylon team for complete schema documentation

---

**Questions?** Contact the Babylon team for indexer access and additional support.
