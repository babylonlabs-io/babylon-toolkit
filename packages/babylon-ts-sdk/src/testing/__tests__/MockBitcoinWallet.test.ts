import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { verifyPopWitness } from "../../tbv/core/managers/pegin/verifyPopWitness";
import { MockBitcoinWallet } from "../MockBitcoinWallet";

// Test scalar 2; its pubkey is 2·G, whose x-coordinate is below.
const PRIVKEY_TWO_HEX = `${"00".repeat(31)}02`;
const PUBKEY_TWO_XONLY_HEX =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
// Default pair: privkey 1 and the secp256k1 generator's x coordinate.
const DEFAULT_XONLY_HEX =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

describe("MockBitcoinWallet key consistency", () => {
  it("derives publicKeyHex from privateKeyHex when only the private key is configured", async () => {
    const wallet = new MockBitcoinWallet({ privateKeyHex: PRIVKEY_TWO_HEX });

    expect(await wallet.getPublicKeyHex()).toBe(PUBKEY_TWO_XONLY_HEX);
  });

  it("signs a witness that verifies against the derived publicKeyHex", async () => {
    const wallet = new MockBitcoinWallet({ privateKeyHex: PRIVKEY_TWO_HEX });
    const message = "pop message";

    const witness = await wallet.signMessage(message, "bip322-simple");

    expect(
      verifyPopWitness(
        new TextEncoder().encode(message),
        PUBKEY_TWO_XONLY_HEX,
        witness as Hex,
      ),
    ).toEqual({ kind: "p2wpkh-verified" });
  });

  it("throws at sign time when publicKeyHex and privateKeyHex diverge, naming both keys", async () => {
    const wallet = new MockBitcoinWallet({
      privateKeyHex: PRIVKEY_TWO_HEX,
      publicKeyHex: DEFAULT_XONLY_HEX,
    });

    const error: Error = await wallet
      .signMessage("pop message", "bip322-simple")
      .then(
        () => {
          throw new Error("expected signMessage to reject");
        },
        (e: Error) => e,
      );
    expect(error.message).toContain(PUBKEY_TWO_XONLY_HEX);
    expect(error.message).toContain(DEFAULT_XONLY_HEX);
    expect(error.message).toMatch(/matching/i);
  });

  it("accepts a publicKeyHex-only override at construction (suites that never sign)", async () => {
    const overrideKey = "deadbeef".repeat(8);
    const wallet = new MockBitcoinWallet({ publicKeyHex: overrideKey });

    expect(await wallet.getPublicKeyHex()).toBe(overrideKey);
  });

  it("still signs when publicKeyHex is the compressed form of the signing key", async () => {
    const wallet = new MockBitcoinWallet({
      publicKeyHex: `02${DEFAULT_XONLY_HEX}`,
    });

    await expect(
      wallet.signMessage("pop message", "bip322-simple"),
    ).resolves.toMatch(/^0x[0-9a-f]+$/);
  });

  it("throws for the ecdsa message type — only bip322-simple is implemented", async () => {
    // The mock only produces BIP-322 P2WPKH witnesses; silently returning one
    // for "ecdsa" would hand a future ECDSA-flow test the wrong artifact.
    const wallet = new MockBitcoinWallet();

    await expect(wallet.signMessage("pop message", "ecdsa")).rejects.toThrow(
      /only bip322-simple/,
    );
  });

  it("re-derives publicKeyHex when updateConfig sets only privateKeyHex", async () => {
    const wallet = new MockBitcoinWallet();

    wallet.updateConfig({ privateKeyHex: PRIVKEY_TWO_HEX });

    expect(await wallet.getPublicKeyHex()).toBe(PUBKEY_TWO_XONLY_HEX);
    await expect(
      wallet.signMessage("pop message", "bip322-simple"),
    ).resolves.toMatch(/^0x[0-9a-f]+$/);
  });

  it("keeps the default pair working unchanged", async () => {
    const wallet = new MockBitcoinWallet();

    expect(await wallet.getPublicKeyHex()).toBe(DEFAULT_XONLY_HEX);
    await expect(
      wallet.signMessage("pop message", "bip322-simple"),
    ).resolves.toMatch(/^0x[0-9a-f]+$/);
  });
});
