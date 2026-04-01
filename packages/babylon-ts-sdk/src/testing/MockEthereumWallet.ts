import { Buffer } from "buffer";
import type { Address, Hex } from "viem";

/**
 * Configuration for MockEthereumWallet.
 */
export interface MockEthereumWalletConfig {
  address?: Address;
  chainId?: number;
  shouldFailOperations?: boolean;
  transactionDelay?: number;
}

/**
 * Mock Ethereum wallet for testing.
 *
 * Provides the subset of viem's WalletClient methods used by the SDK.
 * Can be passed to functions expecting a WalletClient for testing purposes.
 */
export class MockEthereumWallet {
  // Public properties matching viem's WalletClient structure
  account: { address: Address };
  chain: { id: number };

  private shouldFailOperations: boolean;
  private transactionDelay: number;
  private nonce: number = 0;

  constructor(config: MockEthereumWalletConfig = {}) {
    // Use lowercase addresses to avoid EIP-55 checksum validation issues
    this.account = {
      address:
        config.address ||
        ("0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address),
    };

    this.chain = {
      id: config.chainId ?? 11155111, // Sepolia by default
    };

    this.shouldFailOperations = config.shouldFailOperations ?? false;
    this.transactionDelay = config.transactionDelay ?? 0;

    // Bind methods to preserve 'this' context when called
    this.signMessage = this.signMessage.bind(this);
    this.sendTransaction = this.sendTransaction.bind(this);
  }

  async signMessage(args: { message: string; account?: Address }): Promise<Hex> {
    const message = args.message;
    const account = args.account || this.account.address;

    if (this.shouldFailOperations) {
      throw new Error("Mock signing failed");
    }

    if (!message || message.length === 0) {
      throw new Error("Invalid message: empty string");
    }

    // Generate a deterministic mock signature
    const signatureData = `personal_sign:${message}-${account}-${this.chain.id}`;
    const signature = `0x${Buffer.from(signatureData)
      .toString("hex")
      .slice(0, 130)
      .padEnd(130, "0")}` as Hex;
    return signature;
  }

  async sendTransaction(tx: {
    to: Address;
    data?: Hex;
    value?: bigint;
    gas?: bigint;
    account?: { address: Address };
    chain?: { id: number };
  }): Promise<Hex> {
    if (this.shouldFailOperations) {
      throw new Error("Mock transaction failed");
    }

    if (!tx.to) {
      throw new Error("Invalid transaction: missing 'to' address");
    }

    // Simulate network delay if configured
    if (this.transactionDelay > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.transactionDelay),
      );
    }

    // Generate a deterministic mock transaction hash
    this.nonce++;
    const txData = JSON.stringify({
      from: this.account.address,
      to: tx.to,
      value: tx.value?.toString() || "0",
      nonce: this.nonce,
      chainId: this.chain.id,
    });

    const hash = `0x${Buffer.from(txData)
      .toString("hex")
      .slice(0, 64)
      .padEnd(64, "0")}` as Hex;
    return hash;
  }

  /** Updates configuration for testing different scenarios. */
  updateConfig(updates: Partial<MockEthereumWalletConfig>): void {
    if (updates.address !== undefined) {
      this.account.address = updates.address;
    }
    if (updates.chainId !== undefined) {
      this.chain.id = updates.chainId;
    }
    if (updates.shouldFailOperations !== undefined) {
      this.shouldFailOperations = updates.shouldFailOperations;
    }
    if (updates.transactionDelay !== undefined) {
      this.transactionDelay = updates.transactionDelay;
    }
  }

  /** Resets to default configuration and nonce. */
  reset(): void {
    this.account.address =
      "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;
    this.chain.id = 11155111;
    this.shouldFailOperations = false;
    this.transactionDelay = 0;
    this.nonce = 0;
  }

  /** Returns current nonce for testing. */
  getCurrentNonce(): number {
    return this.nonce;
  }
}
