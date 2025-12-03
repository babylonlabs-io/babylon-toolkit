# Wallet Interfaces

Framework-agnostic wallet abstraction interfaces for Bitcoin and Ethereum wallets.

## Overview

This module provides TypeScript interfaces that enable the SDK to work with any wallet implementation, decoupling it from specific wallet libraries or frameworks.

## Interfaces

### BitcoinWallet

Interface for Bitcoin wallet operations (Taproot, SegWit, etc.).

```typescript
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

interface BitcoinWallet {
  getPublicKey(): Promise<string>;
  getAddress(): Promise<string>;
  signPsbt(psbtHex: string): Promise<string>;
  signMessage(message: string): Promise<string>;
  getNetwork(): Promise<"mainnet" | "testnet" | "signet" | "regtest">;
}
```

### EthereumWallet

Interface for Ethereum wallet operations (EIP-191, EIP-712, EIP-1559, etc.).

```typescript
import type { EthereumWallet } from "@babylonlabs-io/ts-sdk/shared";

interface EthereumWallet {
  getAddress(): Promise<Address>;
  getChainId(): Promise<number>;
  signMessage(message: string): Promise<Hash>; // EIP-191 personal_sign
  signTypedData(typedData: TypedData): Promise<Hash>; // EIP-712 structured data
  sendTransaction(tx: TransactionRequest): Promise<Hash>; // Sign + broadcast
}
```

**Key Methods:**

- `signMessage`: Personal message signing (EIP-191) for authentication
- `signTypedData`: Structured data signing (EIP-712) for permits, approvals, meta-transactions
- `sendTransaction`: Signs and broadcasts transactions to the network

## Usage Examples

### Using with Real Wallets

```typescript
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

// Adapter for Unisat wallet
class UnisatAdapter implements BitcoinWallet {
  constructor(private unisat: any) {}

  async getPublicKey(): Promise<string> {
    return await this.unisat.getPublicKey();
  }

  async getAddress(): Promise<string> {
    const accounts = await this.unisat.requestAccounts();
    return accounts[0];
  }

  async signPsbt(psbtHex: string): Promise<string> {
    return await this.unisat.signPsbt(psbtHex, { autoFinalized: true });
  }

  async signMessage(message: string): Promise<string> {
    return await this.unisat.signMessage(message, "bip322-simple");
  }

  async getNetwork() {
    const chain = await this.unisat.getChain();
    return chain.network === "livenet" ? "mainnet" : "signet";
  }
}
```

### Using Mock Implementations for Testing

```typescript
import {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "@babylonlabs-io/ts-sdk/shared";

describe("My SDK Feature", () => {
  it("should work with Bitcoin wallet", async () => {
    const wallet = new MockBitcoinWallet({
      address: "tb1pCustomTestAddress",
      network: "signet",
    });

    const address = await wallet.getAddress();
    expect(address).toBe("tb1pCustomTestAddress");
  });

  it("should work with Ethereum wallet - sendTransaction", async () => {
    const wallet = new MockEthereumWallet({
      chainId: 1, // Mainnet
    });

    const txHash = await wallet.sendTransaction({
      to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
      value: "1000000000000000000", // 1 ETH
    });

    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("should work with Ethereum wallet - signTypedData", async () => {
    const wallet = new MockEthereumWallet();

    const typedData = {
      domain: {
        name: "MyDApp",
        version: "1",
        chainId: 1,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
        spender: "0x1234567890123456789012345678901234567890",
        value: "1000000000000000000",
      },
    };

    const signature = await wallet.signTypedData(typedData);
    expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
  });
});
```

## Design Principles

1. **Framework Agnostic**: No dependencies on React, Vue, or any specific framework
2. **Simple & Focused**: Minimal interface with only essential wallet operations
3. **Type Safe**: Full TypeScript support with comprehensive JSDoc documentation
4. **Testable**: Mock implementations provided for easy testing
5. **Extensible**: Easy to create adapters for any wallet implementation

## Supported Wallets

The interfaces are designed to work with popular wallets including:

**Bitcoin:**

- Unisat
- OKX Wallet
- OneKey
- Keystone
- Any wallet supporting PSBT signing and `signMessage`

**Ethereum:**

- MetaMask
- WalletConnect
- Any wallet supporting EIP-1193

## Testing

Run the test suite:

```bash
pnpm test
```

All interfaces have comprehensive test coverage using the mock implementations.
