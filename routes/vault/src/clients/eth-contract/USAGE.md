# ETH Contract Client Usage Guide

This guide shows how to use the ETH contract client with the Babylon wallet connector.

## Setup

The contract client uses Wagmi + Viem:
- **Wagmi**: For wallet connection (via AppKit/wallet-connector)
- **Viem**: For contract interactions (clean API)

## Prerequisites

Make sure your app has the wallet connector set up and wagmi config initialized:

```tsx
import { WalletProvider, useAppKitBridge, useChainConnector, getSharedWagmiConfig } from '@babylonlabs-io/wallet-connector';
import { setWagmiConfig } from '@/clients/eth-contract';

function App() {
  // Bridge AppKit with babylon-wallet-connector
  useAppKitBridge();

  // Initialize wagmi config for contract client
  // This should be called once during app initialization
  React.useEffect(() => {
    const config = getSharedWagmiConfig();
    setWagmiConfig(config);
  }, []);

  return <YourApp />;
}
```

## Usage in Components

### Query Functions (Read-only)

Query functions don't need a connected wallet:

```tsx
import { ethQueryClient } from '@/clients/eth-contract';

function MyComponent() {
  const contractAddress = '0x...'; // BTCVaultController address
  const userAddress = '0x...'; // User's ETH address

  // Get all vaults for a user
  const vaults = await ethQueryClient.getUserVaults(contractAddress, userAddress);

  // Get vault details
  const metadata = await ethQueryClient.getVaultMetadata(contractAddress, pegInTxHash);

  // Get pegin requests
  const peginRequests = await ethQueryClient.getDepositorPeginRequests(contractAddress, userAddress);

  // Check pegin status
  const isVerified = await ethQueryClient.isPeginVerified(contractAddress, pegInTxHash);
}
```

### Transaction Functions (Write)

Transaction functions automatically use the connected wallet from AppKit:

```tsx
import { submitPeginRequest, mintAndBorrow, repayAndPegout } from '@/clients/eth-contract';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';

function VaultActions() {
  const ethConnector = useChainConnector('ETH');
  const contractAddress = '0x...'; // BTCVaultController address

  // Check if wallet is connected
  if (!ethConnector?.connectedWallet) {
    return <div>Please connect your ETH wallet</div>;
  }

  const handleSubmitPegin = async () => {
    try {
      const result = await submitPeginRequest(
        contractAddress,
        unsignedPegInTx,
        vaultProviderAddress
      );

      console.log('Pegin submitted:', result.transactionHash);
      console.log('Pegin TX Hash:', result.pegInTxHash); // TODO: Extract from event
    } catch (error) {
      console.error('Failed to submit pegin:', error);
    }
  };

  const handleCreateVault = async () => {
    try {
      const result = await mintAndBorrow(
        contractAddress,
        pegInTxHash,
        depositorBtcPubkey,
        marketParams,
        borrowAmount
      );

      console.log('Vault created:', result.transactionHash);
    } catch (error) {
      console.error('Failed to create vault:', error);
    }
  };

  const handleRepay = async () => {
    try {
      // User must approve token spending first!
      // await approveToken(loanTokenAddress, debtAmount);

      const result = await repayAndPegout(
        contractAddress,
        pegInTxHash
      );

      console.log('Vault repaid:', result.transactionHash);
    } catch (error) {
      console.error('Failed to repay vault:', error);
    }
  };

  return (
    <div>
      <button onClick={handleSubmitPegin}>Submit Pegin</button>
      <button onClick={handleCreateVault}>Create Vault</button>
      <button onClick={handleRepay}>Repay Vault</button>
    </div>
  );
}
```

## How It Works

1. **User connects wallet via AppKit** (MetaMask, WalletConnect, etc.)
2. **AppKit syncs with babylon-wallet-connector** via `useAppKitBridge()`
3. **Transaction functions call `getSharedWagmiConfig()`** to get the wagmi config
4. **`getWalletClient(wagmiConfig)`** returns a viem-compatible wallet client
5. **Contract calls are made using viem's clean API**

## Key Points

- ✅ No need to pass `walletProvider` - it's handled automatically
- ✅ Works with any wallet supported by AppKit (600+ wallets)
- ✅ Viem's clean API for contract interactions
- ✅ Wagmi handles wallet connection state
- ✅ TypeScript types for all functions

## Error Handling

Always wrap contract calls in try-catch:

```tsx
try {
  await mintAndBorrow(...);
} catch (error) {
  if (error.message.includes('Wallet not connected')) {
    // Show connect wallet prompt
  } else if (error.message.includes('User rejected')) {
    // User cancelled transaction
  } else {
    // Other errors
  }
}
```

## Network Configuration

The client uses network config from `routes/vault/src/config/network/eth.ts`:

- `localhost` (default) - Local Anvil node
- `sepolia` - Sepolia testnet
- `mainnet` - Ethereum mainnet

Set via environment variable:
```bash
NEXT_PUBLIC_ETH_NETWORK=localhost  # or sepolia, mainnet
NEXT_PUBLIC_ETH_RPC_URL=http://localhost:8545  # optional override
```
