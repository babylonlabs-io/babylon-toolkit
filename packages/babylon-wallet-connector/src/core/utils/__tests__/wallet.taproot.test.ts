/**
 * Taproot address derivation must work with no host-side setup.
 *
 * The connector used to depend on the consuming application having registered
 * bitcoinjs-lib's curve implementation at start-up. A host that loads its
 * Bitcoin dependencies lazily therefore broke every taproot wallet connection:
 * `validateAddressWithPK` rebuilds the wallet's address during connect, that
 * threw, and the connect handler reported "Connection Failed" and dropped the
 * wallet. Nothing in the suite loaded the connector cold, so it went unnoticed.
 *
 * These tests import the helpers into a fresh module registry and never call
 * `initEccLib`, so they fail if the package stops setting up its own curve.
 */

// @vitest-environment node
// The asmjs ECC library fails bitcoinjs's verifyEcc fixtures under jsdom but
// passes under node. These tests touch no DOM, so pin the file to node.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Network } from "@/core/types";

/** BIP-86 first-address vector: x-only key and its published P2TR addresses. */
const XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const MAINNET_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";

/**
 * A different but genuinely valid x-only key (the secp256k1 generator's
 * x-coordinate), so the mismatch below is rejected because the derived address
 * differs — not because the key failed to parse.
 */
const OTHER_XONLY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

/**
 * Re-import the module under test with no prior curve registration in this
 * module registry, mirroring a cold page load.
 */
async function loadWalletUtils() {
  vi.resetModules();
  return import("@/core/utils/wallet");
}

describe("taproot derivation without host-side curve setup", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("derives the published BIP-86 mainnet address", async () => {
    const { getTaprootAddress } = await loadWalletUtils();

    expect(getTaprootAddress(XONLY, Network.MAINNET)).toBe(MAINNET_ADDRESS);
  });

  it("derives a taproot address on testnet and signet", async () => {
    const { getTaprootAddress } = await loadWalletUtils();

    expect(getTaprootAddress(XONLY, Network.TESTNET)).toMatch(/^tb1p/);
    expect(getTaprootAddress(XONLY, Network.SIGNET)).toMatch(/^tb1p/);
  });

  it("accepts an address that matches its public key", async () => {
    const { validateAddressWithPK } = await loadWalletUtils();

    expect(validateAddressWithPK(MAINNET_ADDRESS, XONLY, Network.MAINNET)).toBe(true);
  });

  it("rejects an address that belongs to a different public key", async () => {
    const { validateAddressWithPK } = await loadWalletUtils();

    expect(validateAddressWithPK(MAINNET_ADDRESS, OTHER_XONLY, Network.MAINNET)).toBe(false);
  });

  it("derives a taproot address from an extended public key", async () => {
    const { generateP2TRAddressFromXpub, toNetwork } = await loadWalletUtils();

    // BIP-86 test-vector account xpub, first receive address.
    const xpub =
      "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ";
    const { address, publicKeyHex, scriptPubKeyHex } = generateP2TRAddressFromXpub(
      xpub,
      "m/0/0",
      toNetwork(Network.MAINNET),
    );

    expect(address).toMatch(/^bc1p/);
    expect(publicKeyHex).toMatch(/^[0-9a-f]{66}$/);
    expect(scriptPubKeyHex).toMatch(/^5120[0-9a-f]{64}$/);
  });
});
