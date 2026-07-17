/**
 * Tests for buildPrePeginPsbt and buildPeginTxFromFundedPrePegin primitives
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { beforeAll, describe, expect, it } from "vitest";

import * as bitcoin from "bitcoinjs-lib";

import {
  fundPeginTransaction,
  parseUnfundedWasmTransaction,
} from "../../../utils/transaction/fundPeginTransaction";
import {
  buildPeginTxFromFundedPrePegin,
  buildPrePeginPsbt,
  type PrePeginParams,
} from "../pegin";
import { TEST_AMOUNTS, TEST_KEYS, initializeWasmForTests } from "./helpers";

// Deterministic SHA256 hash commitment (64 hex chars = 32 bytes)
const TEST_HASH_H = "ab".repeat(32);

const TEST_TIMELOCK_REFUND = 50;
const TEST_TIMELOCK_PEGIN = 100;
const TEST_COUNCIL_QUORUM = 2;
const TEST_COUNCIL_SIZE = 3;

function makePrePeginParams(
  overrides?: Partial<PrePeginParams>,
): PrePeginParams {
  return {
    vaultCoreVersion: 1,
    depositorPubkey: TEST_KEYS.DEPOSITOR,
    vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
    vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
    universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
    hashlocks: [TEST_HASH_H],
    timelockRefund: TEST_TIMELOCK_REFUND,
    pegInAmounts: [TEST_AMOUNTS.PEGIN],
    feeRate: 10n,
    minPeginFeeRate: 10n,
    numLocalChallengers: 1,
    councilQuorum: TEST_COUNCIL_QUORUM,
    councilSize: TEST_COUNCIL_SIZE,
    network: "signet" as Network,
    ...overrides,
  };
}

describe("buildPrePeginPsbt", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Basic functionality", () => {
    it("should build a valid unfunded Pre-PegIn transaction for signet", async () => {
      const result = await buildPrePeginPsbt(makePrePeginParams());

      expect(result).toHaveProperty("psbtHex");
      expect(result).toHaveProperty("htlcValues");
      expect(result).toHaveProperty("htlcScriptPubKeys");
      expect(result).toHaveProperty("htlcAddresses");
      expect(result).toHaveProperty("peginAmounts");
      expect(result).toHaveProperty("depositorClaimValue");

      expect(typeof result.psbtHex).toBe("string");
      expect(typeof result.htlcValues[0]).toBe("bigint");
      expect(typeof result.htlcScriptPubKeys[0]).toBe("string");
      expect(typeof result.htlcAddresses[0]).toBe("string");
      expect(typeof result.peginAmounts[0]).toBe("bigint");
      expect(typeof result.depositorClaimValue).toBe("bigint");

      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.htlcValues[0]).toBeGreaterThan(0n);
      expect(result.htlcScriptPubKeys[0].length).toBeGreaterThan(0);
      expect(result.htlcAddresses[0].length).toBeGreaterThan(0);
      expect(result.peginAmounts[0]).toBe(TEST_AMOUNTS.PEGIN);
      expect(result.depositorClaimValue).toBeGreaterThan(0n);
    });

    it("should set htlcValue >= pegInAmount + depositorClaimValue", async () => {
      const result = await buildPrePeginPsbt(makePrePeginParams());

      // htlcValue covers pegInAmount + depositorClaimValue + internal fees
      expect(result.htlcValues[0]).toBeGreaterThanOrEqual(
        result.peginAmounts[0] + result.depositorClaimValue,
      );
    });

    it("sizes the PegIn fee with minPeginFeeRate, independently of feeRate", async () => {
      // feeRate governs depositorClaimValue; minPeginFeeRate governs the
      // PegIn-fee slice of htlcValue. The wrapper must thread them to
      // separate WASM computations — not conflate them.
      const low = await buildPrePeginPsbt(
        makePrePeginParams({ feeRate: 5n, minPeginFeeRate: 10n }),
      );
      const high = await buildPrePeginPsbt(
        makePrePeginParams({ feeRate: 5n, minPeginFeeRate: 40n }),
      );

      // Same feeRate -> identical depositorClaimValue.
      expect(high.depositorClaimValue).toBe(low.depositorClaimValue);

      // Higher minPeginFeeRate -> larger PegIn fee baked into htlcValue.
      const lowFee =
        low.htlcValues[0] - low.peginAmounts[0] - low.depositorClaimValue;
      const highFee =
        high.htlcValues[0] - high.peginAmounts[0] - high.depositorClaimValue;
      expect(highFee).toBeGreaterThan(lowFee);
    });

    it("should handle different networks", async () => {
      const networks: Network[] = ["bitcoin", "testnet", "regtest", "signet"];

      for (const network of networks) {
        const result = await buildPrePeginPsbt(makePrePeginParams({ network }));

        expect(result.psbtHex.length).toBeGreaterThan(0);
        expect(result.htlcValues[0]).toBeGreaterThan(0n);
        expect(result.peginAmounts[0]).toBe(TEST_AMOUNTS.PEGIN);
      }
    });

    it("should handle different peg-in amounts", async () => {
      const amounts = [
        TEST_AMOUNTS.PEGIN_SMALL,
        TEST_AMOUNTS.PEGIN_MEDIUM,
        TEST_AMOUNTS.PEGIN_LARGE,
        TEST_AMOUNTS.ONE_BTC,
      ];

      for (const pegInAmount of amounts) {
        const result = await buildPrePeginPsbt(
          makePrePeginParams({ pegInAmounts: [pegInAmount] }),
        );

        expect(result.peginAmounts[0]).toBe(pegInAmount);
        expect(result.htlcValues[0]).toBeGreaterThanOrEqual(pegInAmount);
      }
    });

    it("should handle multiple vault keepers", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          vaultKeeperPubkeys: [
            TEST_KEYS.VAULT_KEEPER_1,
            TEST_KEYS.VAULT_KEEPER_2,
          ],
          numLocalChallengers: 2,
        }),
      );

      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.htlcValues[0]).toBeGreaterThan(0n);
    });

    it("should handle multiple universal challengers", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          universalChallengerPubkeys: [
            TEST_KEYS.UNIVERSAL_CHALLENGER_1,
            TEST_KEYS.UNIVERSAL_CHALLENGER_2,
          ],
        }),
      );

      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.htlcValues[0]).toBeGreaterThan(0n);
    });
  });

  describe("Deterministic output", () => {
    // v1 tx-byte parity gate: this exact unfunded Pre-PegIn hex was produced
    // by the pre-facade binary (btc-vault @ 63ab9e8d) for these fixed inputs
    // (x-only keys = x-coords of 1G..5G on secp256k1). The vault-wasm facade
    // must reproduce it byte-for-byte for graph v1 — drift means in-flight v1
    // deposits no longer reconstruct (hard fork). Re-verify on every pin bump.
    it("builds the v1 Pre-PegIn byte-identical to the pre-facade binary", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          depositorPubkey:
            "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
          vaultProviderPubkey:
            "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
          vaultKeeperPubkeys: [
            "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
            "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
          ],
          universalChallengerPubkeys: [
            "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
          ],
          hashlocks: ["12".repeat(32)],
          timelockRefund: 144,
          pegInAmounts: [100_000n],
          feeRate: 2n,
          minPeginFeeRate: 1n,
          numLocalChallengers: 3,
          councilQuorum: 1,
          councilSize: 2,
          network: "signet" as Network,
          authAnchorHash: "34".repeat(32),
        }),
      );

      expect(result.psbtHex).toBe(
        "0200000000010003c8d8010000000000225120b4ddfd220597dc619a1a1e5daa8d2fefa5cb6d3745b334b485e690c7b562ccd90000000000000000226a20343434343434343434343434343434343434343434343434343434343434343422020000000000002251" +
          "20da4710964f7852695de2da025290e24af6d8c281de5a0b902b7135fd9fd74d2100000000",
      );
      expect(result.htlcValues.map(String)).toEqual(["121032"]);
      expect(String(result.depositorClaimValue)).toBe("20734");
    });

    // v2 golden vector: pinned from the facade at VAULT_WASM_COMMIT 4d7ee90e
    // (btc-vault graph v2 @ d7e33b26) for the same fixture as the v1 gate.
    // htlcValue decomposes as 100000 (pegin) + 20846 (claim, larger than
    // v1's 20734 by the RFC-008 assert-marker fee) + 240 (P2A anchor) +
    // 311 (minPeginFee, +13 vbytes over v1 for the anchor output). Drift on
    // a pin bump = the v2 graph changed shape — stop and re-verify against
    // btc-vault before shipping.
    it("builds the v2 Pre-PegIn byte-identical to the pinned facade vector", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          vaultCoreVersion: 2,
          depositorPubkey:
            "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
          vaultProviderPubkey:
            "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
          vaultKeeperPubkeys: [
            "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
            "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
          ],
          universalChallengerPubkeys: [
            "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
          ],
          hashlocks: ["12".repeat(32)],
          timelockRefund: 144,
          pegInAmounts: [100_000n],
          feeRate: 2n,
          minPeginFeeRate: 1n,
          numLocalChallengers: 3,
          councilQuorum: 1,
          councilSize: 2,
          network: "signet" as Network,
          authAnchorHash: "34".repeat(32),
        }),
      );

      expect(result.psbtHex).toBe(
        "020000000001000335da010000000000225120b4ddfd220597dc619a1a1e5daa8d2fefa5cb6d3745b334b485e690c7b562ccd90000000000000000226a2034343434343434343434343434343434343434343434343434343434343434342202000000000000225120da4710964f7852695de2da025290e24af6d8c281de5a0b902b7135fd9fd74d2100000000",
      );
      expect(result.htlcValues.map(String)).toEqual(["121397"]);
      expect(String(result.depositorClaimValue)).toBe("20846");
      // Exact decomposition: htlc = pegin + claim + anchor + fee.
      expect(result.htlcValues[0]).toBe(
        100_000n + result.depositorClaimValue + 240n + 311n,
      );
    });

    it("should produce the same result for the same inputs", async () => {
      const params = makePrePeginParams();

      const result1 = await buildPrePeginPsbt(params);
      const result2 = await buildPrePeginPsbt(params);

      expect(result1.psbtHex).toBe(result2.psbtHex);
      expect(result1.htlcValues[0]).toBe(result2.htlcValues[0]);
      expect(result1.htlcScriptPubKeys[0]).toBe(result2.htlcScriptPubKeys[0]);
      expect(result1.htlcAddresses[0]).toBe(result2.htlcAddresses[0]);
    });

    it("should produce different output for different depositor keys", async () => {
      const result1 = await buildPrePeginPsbt(makePrePeginParams());
      const result2 = await buildPrePeginPsbt(
        makePrePeginParams({ depositorPubkey: TEST_KEYS.VAULT_PROVIDER }),
      );

      expect(result1.psbtHex).not.toBe(result2.psbtHex);
      expect(result1.htlcScriptPubKeys[0]).not.toBe(
        result2.htlcScriptPubKeys[0],
      );
      expect(result1.htlcAddresses[0]).not.toBe(result2.htlcAddresses[0]);
    });

    it("should produce different output for different hashlocks values", async () => {
      const result1 = await buildPrePeginPsbt(
        makePrePeginParams({ hashlocks: ["ab".repeat(32)] }),
      );
      const result2 = await buildPrePeginPsbt(
        makePrePeginParams({ hashlocks: ["cd".repeat(32)] }),
      );

      expect(result1.htlcScriptPubKeys[0]).not.toBe(
        result2.htlcScriptPubKeys[0],
      );
      expect(result1.htlcAddresses[0]).not.toBe(result2.htlcAddresses[0]);
    });

    // Load-bearing invariant for the planned two-pass Pre-PegIn ordering
    // (sizing pass with placeholder hashlocks → UTXO selection → real
    // hashlocks from `expandHashlockSecret` after `deriveVaultRoot`).
    // Asserts the placeholder pass produces the same `htlcValues` and
    // `totalOutputValue` as the real pass — i.e., values are determined
    // by the economic parameters (peginAmount, depositorClaimValue,
    // minPeginFee), independent of hashlock script bytes. The Rust side
    // (btc-vault `prepegin.rs`) preserves this; pin it on the TS side
    // so silent regressions can't slip in.
    it("htlcValues + totalOutputValue are invariant under hashlock substitution", async () => {
      const HASH_A = "ab".repeat(32);
      const HASH_B = "cd".repeat(32);

      const a = await buildPrePeginPsbt(
        makePrePeginParams({ hashlocks: [HASH_A] }),
      );
      const b = await buildPrePeginPsbt(
        makePrePeginParams({ hashlocks: [HASH_B] }),
      );

      // Values match across hashlock substitution.
      expect(a.htlcValues).toEqual(b.htlcValues);
      expect(a.totalOutputValue).toBe(b.totalOutputValue);
      expect(a.peginAmounts).toEqual(b.peginAmounts);
      expect(a.depositorClaimValue).toBe(b.depositorClaimValue);
      // Scripts MUST differ — sanity check that we actually changed
      // the hashlock and the test isn't a tautology.
      expect(a.htlcScriptPubKeys).not.toEqual(b.htlcScriptPubKeys);
    });

    it("htlcValues invariance also holds across multi-vault batches", async () => {
      const baseParams = makePrePeginParams();
      const HASHES_A = [
        "11".repeat(32),
        "22".repeat(32),
        "33".repeat(32),
      ];
      const HASHES_B = [
        "44".repeat(32),
        "55".repeat(32),
        "66".repeat(32),
      ];

      const a = await buildPrePeginPsbt({
        ...baseParams,
        pegInAmounts: [
          BigInt(100_000),
          BigInt(200_000),
          BigInt(300_000),
        ],
        hashlocks: HASHES_A,
      });
      const b = await buildPrePeginPsbt({
        ...baseParams,
        pegInAmounts: [
          BigInt(100_000),
          BigInt(200_000),
          BigInt(300_000),
        ],
        hashlocks: HASHES_B,
      });

      expect(a.htlcValues).toEqual(b.htlcValues);
      expect(a.totalOutputValue).toBe(b.totalOutputValue);
      expect(a.htlcScriptPubKeys).not.toEqual(b.htlcScriptPubKeys);
    });

    it("should produce different output for different vault keepers", async () => {
      const result1 = await buildPrePeginPsbt(
        makePrePeginParams({ vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1] }),
      );
      const result2 = await buildPrePeginPsbt(
        makePrePeginParams({ vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_2] }),
      );

      expect(result1.htlcScriptPubKeys[0]).not.toBe(
        result2.htlcScriptPubKeys[0],
      );
    });
  });

  // Tests the OP_RETURN auth-anchor commitment from btc-vault #1516.
  // Requires WASM rebuilt against a commit ≥ 1ced81e5.
  describe("authAnchorHash (OP_RETURN commitment)", () => {
    const VALID_AUTH_ANCHOR_HASH = "ab".repeat(32);

    it("returns authAnchorVout = null when no authAnchorHash is provided", async () => {
      const result = await buildPrePeginPsbt(makePrePeginParams());
      expect(result.authAnchorVout).toBeNull();
    });

    it("returns authAnchorVout = htlc count when authAnchorHash is provided", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({ authAnchorHash: VALID_AUTH_ANCHOR_HASH }),
      );
      expect(result.authAnchorVout).toBe(result.htlcValues.length);
    });

    it("emits an OP_RETURN <PUSH32 hash> output at the reported vout", async () => {
      const result = await buildPrePeginPsbt(
        makePrePeginParams({ authAnchorHash: VALID_AUTH_ANCHOR_HASH }),
      );
      expect(result.authAnchorVout).not.toBeNull();

      const parsed = parseUnfundedWasmTransaction(result.psbtHex);
      const output = parsed.outputs[result.authAnchorVout as number];
      // Value must be 0 (OP_RETURN outputs are zero-sat)
      expect(output.value).toBe(0);
      // scriptPubKey = OP_RETURN (0x6a) || OP_PUSHBYTES_32 (0x20) || 32B hash
      const scriptHex = output.script.toString("hex");
      expect(scriptHex).toBe(`6a20${VALID_AUTH_ANCHOR_HASH}`);
    });

    it("accepts a 0x-prefixed authAnchorHash and normalizes to lowercase", async () => {
      const prefixed = "0x" + "CD".repeat(32);
      const result = await buildPrePeginPsbt(
        makePrePeginParams({ authAnchorHash: prefixed }),
      );
      const parsed = parseUnfundedWasmTransaction(result.psbtHex);
      const output = parsed.outputs[result.authAnchorVout as number];
      const scriptHex = output.script.toString("hex");
      expect(scriptHex).toBe(`6a20${"cd".repeat(32)}`);
    });

    it("rejects authAnchorHash with wrong length", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ authAnchorHash: "ab".repeat(31) }),
        ),
      ).rejects.toThrow(/authAnchorHash/);
    });

    it("rejects authAnchorHash with non-hex chars", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ authAnchorHash: "zz".repeat(32) }),
        ),
      ).rejects.toThrow(/authAnchorHash/);
    });

    it("places OP_RETURN at vout = htlc count for multi-HTLC batches", async () => {
      // 2 HTLCs → OP_RETURN at vout 2 (HTLCs at 0, 1; OP_RETURN at 2;
      // CPFP anchor at 3).
      const result = await buildPrePeginPsbt(
        makePrePeginParams({
          hashlocks: ["ab".repeat(32), "cd".repeat(32)],
          pegInAmounts: [TEST_AMOUNTS.PEGIN, TEST_AMOUNTS.PEGIN],
          authAnchorHash: VALID_AUTH_ANCHOR_HASH,
        }),
      );

      expect(result.htlcValues.length).toBe(2);
      expect(result.authAnchorVout).toBe(2);

      const parsed = parseUnfundedWasmTransaction(result.psbtHex);
      const output = parsed.outputs[2];
      expect(output.value).toBe(0);
      expect(output.script.toString("hex")).toBe(
        `6a20${VALID_AUTH_ANCHOR_HASH}`,
      );
    });

    it("does not change htlc scriptPubKeys when authAnchorHash is added", async () => {
      // The HTLC outputs should be byte-identical whether or not the
      // auth-anchor OP_RETURN is present — it's just an additional output.
      const without = await buildPrePeginPsbt(makePrePeginParams());
      const with_ = await buildPrePeginPsbt(
        makePrePeginParams({ authAnchorHash: VALID_AUTH_ANCHOR_HASH }),
      );
      expect(with_.htlcScriptPubKeys).toEqual(without.htlcScriptPubKeys);
      expect(with_.htlcValues).toEqual(without.htlcValues);
    });

    it("totalOutputValue and tx structure are invariant under hashlock content", async () => {
      // The sizing pass uses 32-byte placeholder hashlocks because the
      // wallet popup that produces real ones hasn't run yet. The commit
      // pass swaps in real values. UTXO selection MUST be invariant
      // under that swap — otherwise sizing's fee/changeAmount would be
      // wrong for the funded broadcast tx and broadcast underfunding
      // (or change misaccounting) becomes possible. Mirrors the
      // auth-anchor invariance test below.
      const placeholderHashlocks = ["00".repeat(32), "00".repeat(32)];
      const realHashlocks = ["ab".repeat(32), "cd".repeat(32)];
      const sized = await buildPrePeginPsbt(
        makePrePeginParams({
          hashlocks: placeholderHashlocks,
          pegInAmounts: [50_000n, 60_000n],
        }),
      );
      const committed = await buildPrePeginPsbt(
        makePrePeginParams({
          hashlocks: realHashlocks,
          pegInAmounts: [50_000n, 60_000n],
        }),
      );
      expect(committed.totalOutputValue).toBe(sized.totalOutputValue);
      expect(committed.htlcValues).toEqual(sized.htlcValues);
      // HTLC scriptPubKey is a tweaked taproot output key that depends
      // on the hashlock — these legitimately differ between sized and
      // committed. We don't assert equality on htlcScriptPubKeys here.
    });

    it("totalOutputValue and fee sizing are invariant under authAnchorHash content", async () => {
      // The sizing pass uses a 32-byte placeholder for `authAnchorHash`
      // because the wallet popup that produces the real anchor hasn't
      // run yet. The commit pass swaps in the real hash. UTXO selection
      // and fee computation MUST be identical between the two so the
      // funding outpoints used to derive the vault root are the same as
      // the ones funding the broadcast tx — otherwise the resume flow
      // re-derives a different root and activation fails.
      const placeholderHash = "00".repeat(32);
      const realHash = VALID_AUTH_ANCHOR_HASH;
      const sized = await buildPrePeginPsbt(
        makePrePeginParams({ authAnchorHash: placeholderHash }),
      );
      const committed = await buildPrePeginPsbt(
        makePrePeginParams({ authAnchorHash: realHash }),
      );
      expect(committed.totalOutputValue).toBe(sized.totalOutputValue);
      expect(committed.htlcValues).toEqual(sized.htlcValues);
      expect(committed.htlcScriptPubKeys).toEqual(sized.htlcScriptPubKeys);
      expect(committed.authAnchorVout).toBe(sized.authAnchorVout);
    });
  });

  describe("Error handling", () => {
    it("should reject invalid depositor pubkey", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ depositorPubkey: "invalid-pubkey" }),
        ),
      ).rejects.toThrow();
    });

    it("should reject depositor pubkey with incorrect length", async () => {
      await expect(
        buildPrePeginPsbt(makePrePeginParams({ depositorPubkey: "abcd1234" })),
      ).rejects.toThrow();
    });

    it("should reject invalid vault provider pubkey", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ vaultProviderPubkey: "not-a-valid-hex-key" }),
        ),
      ).rejects.toThrow();
    });

    it("should reject invalid vault keeper pubkey in array", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ vaultKeeperPubkeys: ["zzzzinvalidhexzzzz"] }),
        ),
      ).rejects.toThrow();
    });

    it("should reject invalid network string", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({ network: "invalid-network" as Network }),
        ),
      ).rejects.toThrow();
    });

    it("rejects a non-positive pegInAmount before WASM construction", async () => {
      await expect(
        buildPrePeginPsbt(makePrePeginParams({ pegInAmounts: [0n] })),
      ).rejects.toThrow(/pegInAmounts\[0\] must be > 0/);
    });

    it("rejects a non-bigint pegInAmount that bypassed the type check", async () => {
      await expect(
        buildPrePeginPsbt(
          makePrePeginParams({
            pegInAmounts: [100_000 as unknown as bigint],
          }),
        ),
      ).rejects.toThrow(/pegInAmounts\[0\] must be a bigint \(got number\)/);
    });
  });
});

describe("buildPeginTxFromFundedPrePegin", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  // Helper: build an unfunded Pre-PegIn tx, then fund it with a fake UTXO
  // so fromFundedTransaction gets a valid tx with at least one input.
  async function buildFundedPrePeginTxHex(overrides?: Partial<PrePeginParams>) {
    const params = makePrePeginParams(overrides);
    const result = await buildPrePeginPsbt(params);

    // Fund the unfunded tx with a fake UTXO that covers totalOutputValue
    const fundedTxHex = fundPeginTransaction({
      unfundedTxHex: result.psbtHex,
      selectedUTXOs: [
        {
          txid: "aa".repeat(32),
          vout: 0,
          value: Number(result.totalOutputValue + 10_000n),
          scriptPubKey: "0014" + "bb".repeat(20),
        },
      ],
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 10_000n,
      network: bitcoin.networks.testnet,
    });

    return { txHex: fundedTxHex, params };
  }

  describe("Basic functionality", () => {
    // v1 PegIn parity gate — companion to the Pre-PegIn byte pin above: the
    // DERIVED PegIn assembly must also stay byte-identical across vault-wasm
    // pin bumps. These exact bytes were produced by the pre-facade binary
    // (btc-vault @ 63ab9e8d) for this fixture + deterministic funding.
    it("derives the v1 PegIn byte-identical to the pre-facade binary", async () => {
      const { txHex } = await buildFundedPrePeginTxHex({
        depositorPubkey:
          "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        vaultProviderPubkey:
          "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        vaultKeeperPubkeys: [
          "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
          "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
        ],
        universalChallengerPubkeys: [
          "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
        ],
        hashlocks: ["12".repeat(32)],
        timelockRefund: 144,
        pegInAmounts: [100_000n],
        feeRate: 2n,
        minPeginFeeRate: 1n,
        numLocalChallengers: 3,
        councilQuorum: 1,
        councilSize: 2,
        network: "signet" as Network,
        authAnchorHash: "34".repeat(32),
      });

      const result = await buildPeginTxFromFundedPrePegin({
        prePeginParams: makePrePeginParams({
          depositorPubkey:
            "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
          vaultProviderPubkey:
            "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
          vaultKeeperPubkeys: [
            "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
            "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
          ],
          universalChallengerPubkeys: [
            "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
          ],
          hashlocks: ["12".repeat(32)],
          timelockRefund: 144,
          pegInAmounts: [100_000n],
          feeRate: 2n,
          minPeginFeeRate: 1n,
          numLocalChallengers: 3,
          councilQuorum: 1,
          councilSize: 2,
          network: "signet" as Network,
          authAnchorHash: "34".repeat(32),
        }),
        timelockPegin: 100,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      expect(result.txHex).toBe(
        "0200000001c66b93ce2325af6f2e8488d50fb2d48e7e320d5c5206de5152c859ad3b189da90000000000feffffff02a086010000000000225120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc0fe5000000000000022512089b13f1de2d5bc700695813283363c8c3464dd9597994c072ca5e4df022c394700000000",
      );
      expect(result.txid).toBe(
        "b733a5ddca006f3e3c5250e17286a479a927b7e2bb9e8998a689492d27c62918",
      );
      expect(String(result.vaultValue)).toBe("100000");
      expect(result.vaultScriptPubKey).toBe(
        "5120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc0",
      );
    });

    // v2 derived-PegIn golden vector (facade @ 4d7ee90e, btc-vault v2 @
    // d7e33b26): nVersion 3 (TRUC), 3 outputs — vault (100000) at vout 0,
    // depositor claim (20846) at vout 1, P2A anchor (240, `51024e73`) at
    // vout 2. Same fixture + deterministic funding as the v1 gate.
    it("derives the v2 PegIn byte-identical to the pinned facade vector", async () => {
      const v2Fixture = {
        vaultCoreVersion: 2,
        depositorPubkey:
          "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        vaultProviderPubkey:
          "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        vaultKeeperPubkeys: [
          "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
          "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
        ],
        universalChallengerPubkeys: [
          "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
        ],
        hashlocks: ["12".repeat(32)],
        timelockRefund: 144,
        pegInAmounts: [100_000n],
        feeRate: 2n,
        minPeginFeeRate: 1n,
        numLocalChallengers: 3,
        councilQuorum: 1,
        councilSize: 2,
        network: "signet" as Network,
        authAnchorHash: "34".repeat(32),
      };
      const { txHex } = await buildFundedPrePeginTxHex(v2Fixture);

      const result = await buildPeginTxFromFundedPrePegin({
        prePeginParams: makePrePeginParams(v2Fixture),
        timelockPegin: 100,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      expect(result.txHex).toBe(
        "030000000173ce2a94c3e428d7e7bdc83db4427f790c78e623397566c16834c984da4d0ff50000000000feffffff03a086010000000000225120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc06e5100000000000022512089b13f1de2d5bc700695813283363c8c3464dd9597994c072ca5e4df022c3947f0000000000000000451024e7300000000",
      );
      expect(result.txid).toBe(
        "1eb910990eb04af204d02cae1824e69945977a4a8d636d88bce725826b489146",
      );
      expect(String(result.vaultValue)).toBe("100000");

      const peginTx = bitcoin.Transaction.fromHex(result.txHex);
      expect(peginTx.version).toBe(3);
      expect(peginTx.outs).toHaveLength(3);
      expect(peginTx.outs[2].script.toString("hex")).toBe("51024e73");
      expect(peginTx.outs[2].value).toBe(240);
    });

    it("should build a valid PegIn transaction from a funded Pre-PegIn tx hex", async () => {
      const { txHex, params } = await buildFundedPrePeginTxHex();

      const result = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      expect(result).toHaveProperty("txHex");
      expect(result).toHaveProperty("txid");
      expect(result).toHaveProperty("vaultScriptPubKey");
      expect(result).toHaveProperty("vaultValue");

      expect(typeof result.txHex).toBe("string");
      expect(typeof result.txid).toBe("string");
      expect(typeof result.vaultScriptPubKey).toBe("string");
      expect(typeof result.vaultValue).toBe("bigint");

      expect(result.txHex.length).toBeGreaterThan(0);
      expect(result.txid).toMatch(/^[0-9a-f]{64}$/);
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.vaultValue).toBeGreaterThan(0n);
    });

    it("should embed fundedPrePeginTxHex as the input reference", async () => {
      const { txHex: txHex1, params: params1 } =
        await buildFundedPrePeginTxHex();
      const { txHex: txHex2, params: params2 } = await buildFundedPrePeginTxHex(
        {
          hashlocks: ["cd".repeat(32)],
        },
      );

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params1,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex1,
        htlcVout: 0,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params2,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex2,
        htlcVout: 0,
      });

      // Different Pre-PegIn transactions produce different PegIn txids
      expect(result1.txid).not.toBe(result2.txid);
      expect(result1.txHex).not.toBe(result2.txHex);
    });

    it("should produce the same vaultScriptPubKey for same depositor and keepers", async () => {
      const { txHex, params } = await buildFundedPrePeginTxHex();

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      expect(result1.txid).toBe(result2.txid);
      expect(result1.vaultScriptPubKey).toBe(result2.vaultScriptPubKey);
      expect(result1.vaultValue).toBe(result2.vaultValue);
    });

    it("should produce different vaultScriptPubKey for different depositors", async () => {
      const { txHex: txHex1, params: params1 } =
        await buildFundedPrePeginTxHex();
      const { txHex: txHex2, params: params2 } = await buildFundedPrePeginTxHex(
        {
          depositorPubkey: TEST_KEYS.VAULT_PROVIDER,
        },
      );

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params1,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex1,
        htlcVout: 0,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params2,
        timelockPegin: TEST_TIMELOCK_PEGIN,
        fundedPrePeginTxHex: txHex2,
        htlcVout: 0,
      });

      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
      expect(result1.txid).not.toBe(result2.txid);
    });

    it("should produce different results for different timelockPegin", async () => {
      const { txHex, params } = await buildFundedPrePeginTxHex();

      const result1 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: 100,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      const result2 = await buildPeginTxFromFundedPrePegin({
        prePeginParams: params,
        timelockPegin: 200,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
      });

      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
    });
  });

  describe("Error handling", () => {
    // The reconstruction path has no assertWasmPeginSizing amount-echo backstop,
    // so the input guard at the BigUint64Array construction is its only defense
    // against a bad pegInAmount.
    it("rejects a non-positive pegInAmount during reconstruction", async () => {
      const { txHex } = await buildFundedPrePeginTxHex();

      await expect(
        buildPeginTxFromFundedPrePegin({
          prePeginParams: makePrePeginParams({ pegInAmounts: [0n] }),
          timelockPegin: TEST_TIMELOCK_PEGIN,
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
        }),
      ).rejects.toThrow(/pegInAmounts\[0\] must be > 0/);
    });
  });
});
