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
        (config.address as Address) ||
        ("0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address),
    };

    this.chain = {
      id: config.chainId ?? 11155111, // Sepolia by default
    };

    this.shouldFailOperations = config.shouldFailOperations ?? false;
    this.transactionDelay = config.transactionDelay ?? 0;

    // Bind methods to preserve 'this' context when called by viem
    this.signMessage = this.signMessage.bind(this);
    this.sendTransaction = this.sendTransaction.bind(this);
    this.signTypedData = this.signTypedData.bind(this);
  }

  async signMessage(args: {
    message: string;
    account?: Address;
  }): Promise<Hash> {
    const message = args.message;
    const account = args.account || this.account.address;

    if (this.shouldFailOperations) {
      throw new Error("Mock signing failed");
    }

    if (!message || message.length === 0) {
      throw new Error("Invalid message: empty string");
    }

    // In a real implementation, this would create a proper ECDSA signature
    // For the mock, we generate a deterministic signature hash
    const signatureData = `personal_sign:${message}-${account}-${this.chain.id}`;
    const signature = `0x${Buffer.from(signatureData)
      .toString("hex")
      .slice(0, 130)
      .padEnd(130, "0")}` as Hash;
    return signature;
  }

  async signTypedData(typedData: TypedData): Promise<Hash> {
    if (this.shouldFailOperations) {
      throw new Error("Mock typed data signing failed");
    }

    if (!typedData || !typedData.primaryType || !typedData.message) {
      throw new Error("Invalid typed data: missing required fields");
    }

    // In a real implementation, this would create a proper EIP-712 signature
    // For the mock, we generate a deterministic signature hash based on the typed data
    const typedDataString = JSON.stringify({
      address: this.account.address,
      chainId: this.chain.id,
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

    // In a real implementation, this would sign and send the transaction
    // For the mock, we generate a deterministic transaction hash
    this.nonce++;
    const txData = JSON.stringify({
      from: this.account.address,
      to: tx.to,
      value: tx.value || "0",
      nonce: this.nonce,
      chainId: this.chain.id,
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
