/**
 * Conformance vectors for the wallet-side `deriveContextHash` API that
 * `deriveVaultRoot` consumes.
 *
 * No adapter in this repository runs the derivation; it runs inside the
 * wallet (the Ledger vault app, the Keystone firmware, OneKey, UniSat).
 * This file therefore carries a reference implementation and pins its
 * outputs. Every conforming wallet MUST reproduce them. Any change here
 * is a hard fork (CLAUDE.md, "Critical paths", section 4).
 *
 * ```
 * ikm    = BIP-32 private key at path m/73681862'
 * salt   = "derive-context-hash"                      (UTF-8)
 * info   = SHA-256(UTF8(appName))                     (32 bytes)
 *       || SHA-256(UTF8(canonicalNetworkName))        (32 bytes)
 *       || connectedPubkey                            (33 bytes, compressed SEC1)
 *       || context                                    (raw bytes, decoded from hex)
 * output = HKDF-SHA-256(ikm, salt, info, 32)          (64 lowercase hex chars)
 * ```
 *
 * `canonicalNetworkName` is one of `bitcoin-mainnet`, `bitcoin-testnet`
 * (testnet3 and testnet4 share it), `bitcoin-signet`, `bitcoin-regtest`.
 * `appName` matches `[a-z0-9-]{1,64}`; `context` is non-empty lowercase hex
 * of even length, no `0x` prefix, at most 1024 bytes.
 *
 * The purpose index 73681862 is `trunc31_be(SHA-256("derive-context-hash"))`.
 * `ikm` is the raw 32-byte big-endian private-key scalar at that path (no
 * chain code, no serialization prefix); an invalid BIP-32 child is an error,
 * not a skip to the next index, and the path is never used for signing or
 * any other derivation. `connectedPubkey` is the compressed SEC1 form of the
 * key the wallet returned to the dApp as the active connected key for this
 * request (the BIP-44 leaf below is only the fixture for this vector).
 * Imported (non-HD) keys use the raw private key as `ikm`; MPC and other
 * non-HD wallets may use their own deterministic derivation, as long as the
 * output is 32 bytes, depends on the key material and on all four inputs,
 * and stays stable across share refreshes that keep the same public key.
 * Neither is portable to an HD wallet restored from the same phrase.
 */

import { describe, expect, it } from "vitest";

import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";

const SALT = utf8ToBytes("derive-context-hash");
const OUTPUT_LENGTH = 32;

/**
 * BIP-32 private key at `m/73681862'` for the BIP-39 mnemonic
 * "abandon abandon abandon abandon abandon abandon abandon abandon abandon
 * abandon abandon about" with an empty passphrase (seed
 * `5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4`).
 */
const IKM = hexToBytes(
  "391cdb922097ec9c96fc13cadb01d5745ccf31f5dbec3a38103440714779ec85",
);

/** Compressed SEC1 public key of the BIP-44 receive leaf `m/44'/0'/0'/0/0`. */
const CONNECTED_PUBKEY = hexToBytes(
  "03aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e",
);

const SHA256_TEST_APP =
  "b58b0cb4ecdea3c65311b4ca8833fe47b6ae0a7500f87a8eb31e8379d3fe48f1";
const SHA256_BITCOIN_MAINNET =
  "6ccb47297786bba7fff572abf0cc32bb50881925bf01d67a50a981d9774b82dd";

const buildInfo = (
  appName: string,
  canonicalNetworkName: string,
  connectedPubkey: Uint8Array,
  contextHex: string,
): Uint8Array =>
  concatBytes(
    sha256(utf8ToBytes(appName)),
    sha256(utf8ToBytes(canonicalNetworkName)),
    connectedPubkey,
    hexToBytes(contextHex),
  );

const deriveContextHash = (
  ikm: Uint8Array,
  appName: string,
  canonicalNetworkName: string,
  connectedPubkey: Uint8Array,
  contextHex: string,
): string =>
  bytesToHex(
    hkdf(
      sha256,
      ikm,
      SALT,
      buildInfo(appName, canonicalNetworkName, connectedPubkey, contextHex),
      OUTPUT_LENGTH,
    ),
  );

describe("deriveContextHash conformance vectors", () => {
  describe("HKDF function-level vectors (info given as opaque bytes)", () => {
    it.each([
      [
        "Vector 1",
        `${SHA256_TEST_APP}deadbeef`,
        "3b0e2d90a01122eed8a520648073892f6b2d8f4419216023d63cdbd49500fca3",
      ],
      [
        "Vector 2",
        `${SHA256_TEST_APP}00`,
        "50775126782c1a5e4d60daa4666b2c7590f0b5a445a4115b0abd411467c92597",
      ],
      [
        "Vector 3",
        `${SHA256_TEST_APP}${"00".repeat(64)}`,
        "d81e4a91f32eabd34df0e55ca36f26f211af65dfe575b7201c95baaa6608cdd9",
      ],
    ])("%s", (_name, infoHex, expected) => {
      const output = hkdf(
        sha256,
        IKM,
        SALT,
        hexToBytes(infoHex),
        OUTPUT_LENGTH,
      );
      expect(bytesToHex(output)).toBe(expected);
    });

    it("pins SHA-256(UTF8('test-app')) as the fixed info prefix", () => {
      expect(bytesToHex(sha256(utf8ToBytes("test-app")))).toBe(SHA256_TEST_APP);
    });
  });

  describe("wallet integration vector (full info construction)", () => {
    it("derives the pinned output for test-app / bitcoin-mainnet / deadbeef", () => {
      expect(
        deriveContextHash(
          IKM,
          "test-app",
          "bitcoin-mainnet",
          CONNECTED_PUBKEY,
          "deadbeef",
        ),
      ).toBe(
        "f82ced3be0e29591a7863ece03d65f79fb494fe0de7203549855f462455df008",
      );
    });

    it("pins the intermediates and the 101-byte info layout", () => {
      expect(bytesToHex(sha256(utf8ToBytes("bitcoin-mainnet")))).toBe(
        SHA256_BITCOIN_MAINNET,
      );
      const info = buildInfo(
        "test-app",
        "bitcoin-mainnet",
        CONNECTED_PUBKEY,
        "deadbeef",
      );
      expect(info.length).toBe(32 + 32 + 33 + 4);
      expect(bytesToHex(info)).toBe(
        `${SHA256_TEST_APP}${SHA256_BITCOIN_MAINNET}${bytesToHex(CONNECTED_PUBKEY)}deadbeef`,
      );
    });

    it("separates outputs by network name and by app name", () => {
      const mainnet = deriveContextHash(
        IKM,
        "test-app",
        "bitcoin-mainnet",
        CONNECTED_PUBKEY,
        "deadbeef",
      );
      const signet = deriveContextHash(
        IKM,
        "test-app",
        "bitcoin-signet",
        CONNECTED_PUBKEY,
        "deadbeef",
      );
      const otherApp = deriveContextHash(
        IKM,
        "other-app",
        "bitcoin-mainnet",
        CONNECTED_PUBKEY,
        "deadbeef",
      );
      expect(signet).not.toBe(mainnet);
      expect(otherApp).not.toBe(mainnet);
    });
  });
});
