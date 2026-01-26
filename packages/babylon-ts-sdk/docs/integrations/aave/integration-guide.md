# Complete Aave Integration Guide

**Using the SDK with the Babylon GraphQL Indexer**

This guide shows you how to integrate the Aave SDK with the Babylon GraphQL indexer. All examples use pure TypeScript with viem (framework-agnostic).

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

---

## Prerequisites

### Required Access

**Babylon GraphQL Indexer**:
- See [babylon-vault-indexer](https://github.com/babylonlabs-io/babylon-vault-indexer) for setup, endpoints, and schema documentation

**Smart Contract Knowledge**:
- Understanding of Aave v4 lending protocol
- Health factor and liquidation concepts
- BTC vault system (peg-in/peg-out flow)

### Technical Requirements

```bash
# Core dependencies
npm install @babylonlabs-io/ts-sdk viem graphql-request
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
  "https://indexer.babylonlabs.io/graphql"
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
  const { aaveConfig } = await graphqlClient.request(GET_AAVE_CONFIG);
  const AAVE_CONTROLLER = aaveConfig.controllerAddress;
  const VBTC_RESERVE_ID = BigInt(aaveConfig.btcVaultCoreVbtcReserveId);

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
    AAVE_CONTROLLER,
    vaultIds,
    VBTC_RESERVE_ID
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
  const { aaveConfig } = await graphqlClient.request(GET_AAVE_CONFIG);
  const AAVE_CONTROLLER = aaveConfig.controllerAddress;
  const AAVE_SPOKE = aaveConfig.btcVaultCoreSpokeAddress;

  const positions = await graphqlClient.request(GET_USER_POSITIONS, {
    depositor: userAddress.toLowerCase(),
  });

  const position = positions.aavePositions.items[0];
  if (!position) throw new Error("No position found");

  // Step 2: Get live health factor from RPC (SDK query)
  const accountData = await getUserAccountData(
    publicClient,
    AAVE_SPOKE,
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
    AAVE_CONTROLLER,
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
  const { aaveConfig } = await graphqlClient.request(GET_AAVE_CONFIG);
  const AAVE_CONTROLLER = aaveConfig.controllerAddress;
  const AAVE_SPOKE = aaveConfig.btcVaultCoreSpokeAddress;

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
    AAVE_SPOKE,
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
    args: [AAVE_CONTROLLER, amount],
  });

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("✅ Token approval complete");

  // Step 6: Build and execute repay transaction (SDK)
  const txParams = buildRepayTx(
    AAVE_CONTROLLER,
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
  const { aaveConfig } = await graphqlClient.request(GET_AAVE_CONFIG);
  const AAVE_CONTROLLER = aaveConfig.controllerAddress;
  const AAVE_SPOKE = aaveConfig.btcVaultCoreSpokeAddress;
  const VBTC_RESERVE_ID = BigInt(aaveConfig.btcVaultCoreVbtcReserveId);

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
      AAVE_SPOKE,
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
    AAVE_CONTROLLER,
    VBTC_RESERVE_ID
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

## Next Steps

1. **Set up indexer access** - See [babylon-vault-indexer](https://github.com/babylonlabs-io/babylon-vault-indexer) for setup instructions
2. **Start with config** - Fetch configuration using the GraphQL queries above
3. **Implement one flow** - Start with "Add Collateral" end-to-end
4. **Test on testnet** - Use Sepolia testnet before going to mainnet
5. **Build your UI** - Use the operation flows as the foundation for your frontend (React, Vue, Angular, etc.)

## Additional Resources

- **SDK Documentation**: [README.md](./README.md) - SDK function reference
- **SDK Quickstart**: [quickstart.md](./quickstart.md) - Individual function examples with step-by-step SDK usage
- **Indexer Repository**: [babylon-vault-indexer](https://github.com/babylonlabs-io/babylon-vault-indexer) - GraphQL schema and API documentation
- **Aave v4 Docs**: Official Aave protocol documentation

---
