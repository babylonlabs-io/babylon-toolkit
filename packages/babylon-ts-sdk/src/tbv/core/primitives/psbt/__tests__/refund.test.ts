/**
 * Tests for buildRefundPsbt — refund PSBT construction over a funded
 * Pre-PegIn HTLC output via the CSV-timelocked refund script (leaf 1).
 *
 * Production peg-ins commit an OP_RETURN <PUSH32 SHA256(authAnchor)>
 * output at `vout = hashlocks.length`, so the refund flow must rebuild
 * the WASM unfunded template with the same output shape — otherwise
 * the reconstructed template doesn't align with the funded tx and
 * refund construction fails or yields an unspendable PSBT.
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import * as bitcoin from "bitcoinjs-lib";
import { beforeAll, describe, expect, it } from "vitest";

import { fundPeginTransaction } from "../../../utils/transaction/fundPeginTransaction";
import { buildPrePeginPsbt, type PrePeginParams } from "../pegin";
import { buildRefundPsbt } from "../refund";

import { TEST_AMOUNTS, TEST_KEYS, initializeWasmForTests } from "./helpers";

const TEST_HASH_H = "ab".repeat(32);
const TEST_AUTH_ANCHOR_HASH = "cd".repeat(32);
const TEST_TIMELOCK_REFUND = 50;
const TEST_REFUND_FEE = 1_000n;
const TEST_COUNCIL_QUORUM = 2;
const TEST_COUNCIL_SIZE = 3;

function makePrePeginParams(
  overrides?: Partial<PrePeginParams>,
): PrePeginParams {
  return {
    depositorPubkey: TEST_KEYS.DEPOSITOR,
    vaultProviderPubkey: TEST_KEYS.VAULT_PROVIDER,
    vaultKeeperPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
    universalChallengerPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
    hashlocks: [TEST_HASH_H],
    timelockRefund: TEST_TIMELOCK_REFUND,
    pegInAmounts: [TEST_AMOUNTS.PEGIN],
    feeRate: 10n,
    numLocalChallengers: 1,
    councilQuorum: TEST_COUNCIL_QUORUM,
    councilSize: TEST_COUNCIL_SIZE,
    network: "signet" as Network,
    ...overrides,
  };
}

async function buildFundedPrePegin(overrides?: Partial<PrePeginParams>) {
  const params = makePrePeginParams(overrides);
  const result = await buildPrePeginPsbt(params);

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

  return { txHex: fundedTxHex, params, psbtResult: result };
}

describe("buildRefundPsbt", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("auth-anchor reconstruction", () => {
    it("builds a valid refund PSBT for an auth-anchored funded Pre-PegIn", async () => {
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      const { psbtHex } = await buildRefundPsbt({
        prePeginParams: params,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
        refundFee: TEST_REFUND_FEE,
        hashlock: TEST_HASH_H,
      });

      const psbt = bitcoin.Psbt.fromHex(psbtHex);
      // Refund tx spends exactly the HTLC output of the funded Pre-PegIn.
      const unsigned = psbt.data.globalMap.unsignedTx.toBuffer();
      const refundTx = bitcoin.Transaction.fromBuffer(unsigned);
      expect(refundTx.ins.length).toBe(1);
      const fundedTxid = bitcoin.Transaction.fromHex(txHex).getId();
      const inputTxid = Buffer.from(refundTx.ins[0].hash)
        .slice()
        .reverse()
        .toString("hex");
      expect(inputTxid).toBe(fundedTxid);
      expect(refundTx.ins[0].index).toBe(0);
      // CSV sequence comes from the WASM and equals `timelockRefund`.
      expect(refundTx.ins[0].sequence).toBe(TEST_TIMELOCK_REFUND);
    });

    it("builds a valid refund PSBT for a legacy non-auth-anchored Pre-PegIn", async () => {
      // No authAnchorHash → unfunded template has no OP_RETURN, funded tx
      // has no OP_RETURN, reconstruction aligns by default.
      const { txHex, params } = await buildFundedPrePegin();
      expect(params.authAnchorHash).toBeUndefined();

      const result = await buildRefundPsbt({
        prePeginParams: params,
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
        refundFee: TEST_REFUND_FEE,
        hashlock: TEST_HASH_H,
      });

      expect(typeof result.psbtHex).toBe("string");
      expect(result.psbtHex.length).toBeGreaterThan(0);
    });

    it("rejects auth-anchored funded Pre-PegIn when authAnchorHash in params disagrees with on-chain commitment", async () => {
      // If `authAnchorHash` were not forwarded into the WASM
      // constructor, the unfunded template would have no OP_RETURN at
      // all and the funded tx's OP_RETURN would be ignored — so this
      // assertion would *succeed* instead of rejecting. The fact that
      // it rejects proves the hash flows through to the WASM, where the
      // content mismatch is detected.
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });
      const wrongHash = "ee".repeat(32);

      await expect(
        buildRefundPsbt({
          prePeginParams: { ...params, authAnchorHash: wrongHash },
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
          refundFee: TEST_REFUND_FEE,
          hashlock: TEST_HASH_H,
        }),
      ).rejects.toThrow();
    });
  });

  describe("authAnchorHash normalization (parity with peg-in primitives)", () => {
    // PrePeginParams is shared with buildPrePeginPsbt and
    // buildPeginTxFromFundedPrePegin, both of which normalize
    // `authAnchorHash` (strip 0x, lowercase, validate length/charset)
    // before crossing the WASM boundary. The refund primitive must
    // behave identically — a direct caller reusing successful peg-in
    // params shouldn't get a different validation surface.

    it("accepts a 0x-prefixed authAnchorHash and matches the funded tx", async () => {
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      const result = await buildRefundPsbt({
        prePeginParams: { ...params, authAnchorHash: `0x${TEST_AUTH_ANCHOR_HASH}` },
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
        refundFee: TEST_REFUND_FEE,
        hashlock: TEST_HASH_H,
      });

      expect(typeof result.psbtHex).toBe("string");
      expect(result.psbtHex.length).toBeGreaterThan(0);
    });

    it("accepts uppercase hex in authAnchorHash and matches the funded tx", async () => {
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      const result = await buildRefundPsbt({
        prePeginParams: { ...params, authAnchorHash: TEST_AUTH_ANCHOR_HASH.toUpperCase() },
        fundedPrePeginTxHex: txHex,
        htlcVout: 0,
        refundFee: TEST_REFUND_FEE,
        hashlock: TEST_HASH_H,
      });

      expect(typeof result.psbtHex).toBe("string");
      expect(result.psbtHex.length).toBeGreaterThan(0);
    });

    it("rejects an authAnchorHash with the wrong length", async () => {
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      await expect(
        buildRefundPsbt({
          prePeginParams: { ...params, authAnchorHash: "ab".repeat(31) },
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
          refundFee: TEST_REFUND_FEE,
          hashlock: TEST_HASH_H,
        }),
      ).rejects.toThrow(/authAnchorHash/);
    });

    it("rejects an authAnchorHash with non-hex characters", async () => {
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      await expect(
        buildRefundPsbt({
          prePeginParams: { ...params, authAnchorHash: "zz".repeat(32) },
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
          refundFee: TEST_REFUND_FEE,
          hashlock: TEST_HASH_H,
        }),
      ).rejects.toThrow(/authAnchorHash/);
    });
  });
});
