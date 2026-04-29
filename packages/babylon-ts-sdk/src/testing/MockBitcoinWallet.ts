import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

import { BitcoinNetworks, type BitcoinNetwork } from "../shared/wallets/interfaces";
import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../shared/wallets/interfaces/BitcoinWallet";
import { uint8ArrayToHex } from "../tbv/core/primitives/utils/bitcoin";

/**
 * Configuration for MockBitcoinWallet.
 */
export interface MockBitcoinWalletConfig {
  publicKeyHex?: string;
  address?: string;
  network?: BitcoinNetwork;
  shouldFailSigning?: boolean;
  /**
   * Optional override for `deriveContextHash`. When omitted the mock
   * returns a deterministic 64-char lowercase hex string derived from
   * `(appName, context)` so tests can assert pass-through wiring
   * without pinning a specific value. Override to inject spec test
   * vectors or to simulate failure modes.
   */
  deriveContextHash?: (appName: string, context: string) => Promise<string>;
}

/**
 * Default `deriveContextHash` implementation: deterministic and
 * collision-resistant via SHA-256, so tests that assert pass-through
 * wiring (different `(appName, context)` → different output) hold
 * without flakes. Domain-separates the two inputs by length-prefixing
 * each as `len(name) || name || len(ctx) || ctx`, preventing
 * `("ab", "cd")` from colliding with `("abc", "d")`.
 */
const defaultDeriveContextHash = async (
  appName: string,
  context: string,
): Promise<string> => {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(appName);
  const ctxBytes = enc.encode(context);
  const buf = new Uint8Array(4 + nameBytes.length + 4 + ctxBytes.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, nameBytes.length);
  buf.set(nameBytes, 4);
  view.setUint32(4 + nameBytes.length, ctxBytes.length);
  buf.set(ctxBytes, 4 + nameBytes.length + 4);
  return uint8ArrayToHex(sha256(buf));
};

const DEFAULT_CONFIG: Required<MockBitcoinWalletConfig> = {
  publicKeyHex:
    "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  address: "tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx6jks",
  network: BitcoinNetworks.SIGNET,
  shouldFailSigning: false,
  deriveContextHash: defaultDeriveContextHash,
};

/** Mock Bitcoin wallet for testing. */
export class MockBitcoinWallet implements BitcoinWallet {
  private config: Required<MockBitcoinWalletConfig>;

  constructor(config: MockBitcoinWalletConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config.publicKeyHex ? { publicKeyHex: config.publicKeyHex } : {}),
      ...(config.address ? { address: config.address } : {}),
      ...(config.network !== undefined ? { network: config.network } : {}),
      ...(config.shouldFailSigning !== undefined
        ? { shouldFailSigning: config.shouldFailSigning }
        : {}),
      ...(config.deriveContextHash
        ? { deriveContextHash: config.deriveContextHash }
        : {}),
    };
  }

  async getPublicKeyHex(): Promise<string> {
    return this.config.publicKeyHex;
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

  async signPsbts(
    psbtsHexes: string[],
    _options?: SignPsbtOptions[],
  ): Promise<string[]> {
    const signedPsbts: string[] = [];
    for (const psbtHex of psbtsHexes) {
      const signedPsbt = await this.signPsbt(psbtHex);
      signedPsbts.push(signedPsbt);
    }
    return signedPsbts;
  }

  async signMessage(
    message: string,
    type: "bip322-simple" | "ecdsa",
  ): Promise<string> {
    if (this.config.shouldFailSigning) {
      throw new Error("Mock signing failed");
    }

    if (!message || message.length === 0) {
      throw new Error("Invalid message: empty string");
    }

    // In a real implementation, this would create a proper signature
    // For the mock, we return a base64-like mock signature
    const mockSignature = Buffer.from(
      `mock-signature-${type}-${message}-${this.config.publicKeyHex}`,
    ).toString("base64");
    return mockSignature;
  }

  async getNetwork(): Promise<BitcoinNetwork> {
    return this.config.network;
  }

  async deriveContextHash(appName: string, context: string): Promise<string> {
    return this.config.deriveContextHash(appName, context);
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
    this.config = { ...DEFAULT_CONFIG };
  }
}
