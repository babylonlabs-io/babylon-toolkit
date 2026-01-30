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

### Ethereum Wallets

For Ethereum, the SDK uses viem's `WalletClient` interface directly. This ensures compatibility with the broader Ethereum ecosystem without maintaining a separate abstraction.

```typescript
import type { WalletClient } from "viem";

// The SDK expects a viem WalletClient
const ethWallet: WalletClient = await getWalletClient(wagmiConfig);
```

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

  it("should work with Ethereum wallet", async () => {
    const wallet = new MockEthereumWallet({
      chainId: 1, // Mainnet
    });

    const txHash = await wallet.sendTransaction({
      to: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
      value: 1000000000000000000n, // 1 ETH
    });

    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });
});
```

## Design Principles

1. **Framework Agnostic**: No dependencies on React, Vue, or any specific framework
2. **Simple & Focused**: Minimal interface with only essential wallet operations
3. **Type Safe**: Full TypeScript support with comprehensive JSDoc documentation
4. **Testable**: Mock implementations provided for easy testing
5. **Extensible**: Easy to create adapters for any wallet implementation
6. **Viem Compatible**: Ethereum wallets use viem's WalletClient for ecosystem compatibility

## Supported Wallets

The interfaces are designed to work with popular wallets including:

**Bitcoin:**

- Unisat
- OKX Wallet
- OneKey
- Keystone
- Any wallet supporting PSBT signing and `signMessage`

**Ethereum:**

- MetaMask (via wagmi/viem)
- WalletConnect (via wagmi/viem)
- Any wallet supporting EIP-1193 (via viem adapter)

## Testing

Run the test suite:

```bash
pnpm test
```

All interfaces have comprehensive test coverage using the mock implementations.
