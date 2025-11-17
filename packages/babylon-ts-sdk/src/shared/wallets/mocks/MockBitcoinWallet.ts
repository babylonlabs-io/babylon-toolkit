import type { BitcoinNetwork, BitcoinWallet } from "../interfaces/BitcoinWallet";

/**
 * Configuration for MockBitcoinWallet.
 */
export interface MockBitcoinWalletConfig {
  publicKey?: string;
  address?: string;
  network?: BitcoinNetwork;
  shouldFailSigning?: boolean;
}

/**
 * Mock Bitcoin wallet for testing.
 */
export class MockBitcoinWallet implements BitcoinWallet {
  private config: Required<MockBitcoinWalletConfig>;

  constructor(config: MockBitcoinWalletConfig = {}) {
    this.config = {
      publicKey:
        config.publicKey ||
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      address:
        config.address ||
        "tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx6jks",
      network: config.network || "signet",
      shouldFailSigning: config.shouldFailSigning ?? false,
    };
  }

  async getPublicKey(): Promise<string> {
    return this.config.publicKey;
  }

  async getAddress(): Promise<string> {
    return this.config.address;
  }

  async signPsbt(psbtHex: string): Promise<string> {
    if (this.config.shouldFailSigning) {
      throw new Error("Mock signing failed");
    }

    if (!psbtHex || psbtHex.length === 0) {
      throw new Error("Invalid PSBT: empty hex string");
    }

    // In a real implementation, this would actually sign the PSBT
    // For the mock, we just return the input with a mock signature appended
    return psbtHex + "deadbeef";
  }

  async signMessage(message: string): Promise<string> {
    if (this.config.shouldFailSigning) {
      throw new Error("Mock signing failed");
    }

    if (!message || message.length === 0) {
      throw new Error("Invalid message: empty string");
    }

    // In a real implementation, this would create a proper signature
    // For the mock, we return a base64-like mock signature
    const mockSignature = Buffer.from(
      `mock-signature-${message}-${this.config.publicKey}`,
    ).toString("base64");
    return mockSignature;
  }

  async getNetwork(): Promise<BitcoinNetwork> {
    return this.config.network;
  }

  /** Updates configuration for testing different scenarios. */
  updateConfig(updates: Partial<MockBitcoinWalletConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  /** Resets to default configuration. */
  reset(): void {
    this.config = {
      publicKey:
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      address:
        "tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx6jks",
      network: "signet",
      shouldFailSigning: false,
    };
  }
}
