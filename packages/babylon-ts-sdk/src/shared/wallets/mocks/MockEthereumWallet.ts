import { Buffer } from "buffer";

import type {
  Address,
  EthereumWallet,
  Hash,
  TransactionRequest,
  TypedData,
} from "../interfaces/EthereumWallet";

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
 */
export class MockEthereumWallet implements EthereumWallet {
  private config: Required<MockEthereumWalletConfig>;
  private nonce: number = 0;

  constructor(config: MockEthereumWalletConfig = {}) {
    this.config = {
      address:
        (config.address as Address) ||
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      chainId: config.chainId ?? 11155111, // Sepolia by default
      shouldFailOperations: config.shouldFailOperations ?? false,
      transactionDelay: config.transactionDelay ?? 0,
    };
  }

  async getAddress(): Promise<Address> {
    return this.config.address;
  }

  async getChainId(): Promise<number> {
    return this.config.chainId;
  }

  async signMessage(message: string): Promise<Hash> {
    if (this.config.shouldFailOperations) {
      throw new Error("Mock signing failed");
    }

    if (!message || message.length === 0) {
      throw new Error("Invalid message: empty string");
    }

    // In a real implementation, this would create a proper ECDSA signature
    // For the mock, we generate a deterministic signature hash
    const signatureData = `personal_sign:${message}-${this.config.address}-${this.config.chainId}`;
    const signature = `0x${Buffer.from(signatureData)
      .toString("hex")
      .slice(0, 130)
      .padEnd(130, "0")}` as Hash;
    return signature;
  }

  async signTypedData(typedData: TypedData): Promise<Hash> {
    if (this.config.shouldFailOperations) {
      throw new Error("Mock typed data signing failed");
    }

    if (!typedData || !typedData.primaryType || !typedData.message) {
      throw new Error("Invalid typed data: missing required fields");
    }

    // In a real implementation, this would create a proper EIP-712 signature
    // For the mock, we generate a deterministic signature hash based on the typed data
    const typedDataString = JSON.stringify({
      address: this.config.address,
      chainId: this.config.chainId,
      domain: typedData.domain,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    // Create a hash that includes all the data to ensure uniqueness
    const fullHex = Buffer.from(typedDataString).toString("hex");
    // Take hash from different parts to ensure address differences are captured
    const signature = `0x${fullHex.slice(0, 40)}${fullHex.slice(-90)}`.padEnd(
      132,
      "0",
    ) as Hash;
    return signature;
  }

  async sendTransaction(tx: TransactionRequest): Promise<Hash> {
    if (this.config.shouldFailOperations) {
      throw new Error("Mock transaction failed");
    }

    if (!tx.to) {
      throw new Error("Invalid transaction: missing 'to' address");
    }

    // Simulate network delay if configured
    if (this.config.transactionDelay > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.transactionDelay),
      );
    }

    // In a real implementation, this would sign and send the transaction
    // For the mock, we generate a deterministic transaction hash
    this.nonce++;
    const txData = JSON.stringify({
      from: this.config.address,
      to: tx.to,
      value: tx.value || "0",
      nonce: this.nonce,
      chainId: this.config.chainId,
    });

    // Create a mock transaction hash
    const hash = `0x${Buffer.from(txData)
      .toString("hex")
      .slice(0, 64)
      .padEnd(64, "0")}` as Hash;
    return hash;
  }

  /** Updates configuration for testing different scenarios. */
  updateConfig(updates: Partial<MockEthereumWalletConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  /** Resets to default configuration and nonce. */
  reset(): void {
    this.config = {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      chainId: 11155111,
      shouldFailOperations: false,
      transactionDelay: 0,
    };
    this.nonce = 0;
  }

  /** Returns current nonce for testing. */
  getCurrentNonce(): number {
    return this.nonce;
  }
}
