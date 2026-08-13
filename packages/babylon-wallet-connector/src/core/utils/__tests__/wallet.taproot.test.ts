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
 * These tests clear bitcoinjs-lib's curve registration before each case and
 * never register a working one themselves, so they fail if the package stops
 * setting up its own curve.
 */

// @vitest-environment node
// The asmjs ECC library fails bitcoinjs's verifyEcc fixtures under jsdom but
// passes under node. These tests touch no DOM, so pin the file to node.

import { initEccLib } from "bitcoinjs-lib";
import { beforeEach, describe, expect, it } from "vitest";

import { Network } from "@/core/types";

/** BIP-86 first-address vector: x-only key and its published P2TR addresses. */
const XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const MAINNET_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";

/** The same vector's scriptPubKey: OP_1 and the BIP-341 tweak of XONLY, not XONLY itself. */
const MAINNET_SCRIPT_PUBKEY = "5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c";

/**
 * A different but genuinely valid x-only key (the secp256k1 generator's
 * x-coordinate), so the mismatch below is rejected because the derived address
 * differs — not because the key failed to parse.
 */
const OTHER_XONLY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

/**
 * Import the module under test. `beforeEach` has already cleared bitcoinjs-lib's
 * curve registration, so this mirrors a cold page load.
 */
async function loadWalletUtils() {
  return import("@/core/utils/wallet");
}

describe("taproot derivation without host-side curve setup", () => {
  beforeEach(() => {
    // bitcoinjs-lib is external to vitest's module registry, so its curve cache
    // is the state that has to be cleared — `vi.resetModules()` would not touch
    // it, and would additionally reset any module-level "already initialised"
    // memo, hiding the case where the package registers the curve only once.
    initEccLib(undefined);
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

    expect(address).toBe(MAINNET_ADDRESS);
    expect(publicKeyHex).toBe(`03${XONLY}`);
    expect(scriptPubKeyHex).toBe(MAINNET_SCRIPT_PUBKEY);
  });
});
