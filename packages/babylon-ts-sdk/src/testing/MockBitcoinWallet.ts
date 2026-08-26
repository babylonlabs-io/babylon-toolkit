import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

import {
  BitcoinNetworks,
  type BitcoinNetwork,
} from "../shared/wallets/interfaces";
import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../shared/wallets/interfaces/BitcoinWallet";
import {
  canonicalizeBtcPubkey,
  uint8ArrayToHex,
} from "../tbv/core/primitives/utils/bitcoin";
import { signBip322P2wpkhWitness } from "./signBip322P2wpkhWitness";

/**
 * Configuration for MockBitcoinWallet.
 */
export interface MockBitcoinWalletConfig {
  publicKeyHex?: string;
  address?: string;
  network?: BitcoinNetwork;
  shouldFailSigning?: boolean;
  /**
   * 32-byte hex key `signMessage` signs BIP-322 proofs with. Defaults to
   * the privkey-1 test key, whose x-only pubkey is the default
   * `publicKeyHex` (the secp256k1 generator's x coordinate). PoP flows
   * verify the witness against `publicKeyHex`: overriding only this key
   * derives the matching `publicKeyHex`, and a divergent pair throws at
   * sign time. Test material only — never a real key.
   */
  privateKeyHex?: string;
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

/** Privkey 1 — the test key `signMessage` signs with by default. */
const DEFAULT_PRIVATE_KEY_HEX = `${"00".repeat(31)}01`;

/** Lowercase x-only pubkey of a 32-byte private key. */
function xOnlyPubkeyHexOf(privateKeyHex: string): string {
  return uint8ArrayToHex(
    ecc.xOnlyPointFromScalar(
      Uint8Array.from(Buffer.from(privateKeyHex, "hex")),
    ),
  );
}

const DEFAULT_CONFIG: Required<MockBitcoinWalletConfig> = {
  // x-only pubkey of DEFAULT_PRIVATE_KEY_HEX (the secp256k1 generator's x
  // coordinate), so the default wallet's PoP witnesses verify against it.
  publicKeyHex:
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  address: "tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx6jks",
  network: BitcoinNetworks.SIGNET,
  shouldFailSigning: false,
  privateKeyHex: DEFAULT_PRIVATE_KEY_HEX,
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
      ...(config.privateKeyHex ? { privateKeyHex: config.privateKeyHex } : {}),
      ...(config.deriveContextHash
        ? { deriveContextHash: config.deriveContextHash }
        : {}),
    };
    // A private-key override without a public key would otherwise sign
    // against the DEFAULT pubkey — derive the matching one instead.
    if (config.privateKeyHex && !config.publicKeyHex) {
      this.config.publicKeyHex = xOnlyPubkeyHexOf(config.privateKeyHex);
    }
  }

  async getPublicKeyHex(): Promise<string> {
    return this.config.publicKeyHex;
  }

  async getAddress(): Promise<string> {
    return this.config.address;
  }

  async signPsbt(psbtHex: string, _options?: SignPsbtOptions): Promise<string> {
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
    // Only BIP-322 witnesses are implemented; returning one for "ecdsa"
    // would hand a future ECDSA-flow test the wrong artifact silently.
    if (type !== "bip322-simple") {
      throw new Error(
        "MockBitcoinWallet.signMessage: only bip322-simple is implemented",
      );
    }
    if (this.config.shouldFailSigning) {
      throw new Error("Mock signing failed");
    }

    if (!message || message.length === 0) {
      throw new Error("Invalid message: empty string");
    }

    // PoP flows verify the witness against `publicKeyHex`, so a divergent
    // key pair must fail loudly here, not as a confusing verify mismatch.
    const signingXOnlyHex = xOnlyPubkeyHexOf(this.config.privateKeyHex);
    let configuredXOnlyHex: string | undefined;
    try {
      configuredXOnlyHex = canonicalizeBtcPubkey(this.config.publicKeyHex);
    } catch {
      configuredXOnlyHex = undefined; // an unparseable key cannot match
    }
    if (configuredXOnlyHex !== signingXOnlyHex) {
      throw new Error(
        `MockBitcoinWallet.signMessage: privateKeyHex signs as x-only pubkey ` +
          `${signingXOnlyHex}, but publicKeyHex is ${this.config.publicKeyHex}. ` +
          `Pass a matching publicKeyHex/privateKeyHex pair.`,
      );
    }

    // The SDK cryptographically verifies what a wallet returns
    // (`verifyPopWitness`), so the mock signs a REAL BIP-322 P2WPKH witness
    // with its private key.
    const witness = signBip322P2wpkhWitness(
      new TextEncoder().encode(message),
      Uint8Array.from(Buffer.from(this.config.privateKeyHex, "hex")),
    );
    return `0x${uint8ArrayToHex(witness)}`;
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
    // Mirror the constructor: a private-key-only update re-derives the
    // matching pubkey; an explicit publicKeyHex still wins.
    if (updates.privateKeyHex && !updates.publicKeyHex) {
      this.config.publicKeyHex = xOnlyPubkeyHexOf(updates.privateKeyHex);
    }
  }

  /** Resets to default configuration. */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }
}
