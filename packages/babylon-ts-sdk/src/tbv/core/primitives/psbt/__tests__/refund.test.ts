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

import {
  deriveBip86ScriptPubKeyHex,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../../utils/bitcoin";
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
    minPeginFeeRate: 10n,
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

  describe("multi-vault batched Pre-PegIn", () => {
    const SECOND_HASH = "11".repeat(32);
    const SECOND_AMOUNT = 80_000n;

    it("builds a valid refund PSBT for the second vault (htlcVout=1) of a 2-vault batch", async () => {
      // Multi-vault Pre-PegIn: HTLCs at vouts 0 & 1, OP_RETURN at vout 2.
      // Refunding the vault at htlcVout=1 requires the WASM template to
      // reconstruct both HTLC outputs in vout order — otherwise the refund
      // input references the wrong output.
      const params = makePrePeginParams({
        hashlocks: [TEST_HASH_H, SECOND_HASH],
        pegInAmounts: [TEST_AMOUNTS.PEGIN, SECOND_AMOUNT],
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });
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

      const { psbtHex } = await buildRefundPsbt({
        prePeginParams: params,
        fundedPrePeginTxHex: fundedTxHex,
        htlcVout: 1,
        refundFee: TEST_REFUND_FEE,
        hashlock: SECOND_HASH,
      });

      const psbt = bitcoin.Psbt.fromHex(psbtHex);
      const unsigned = psbt.data.globalMap.unsignedTx.toBuffer();
      const refundTx = bitcoin.Transaction.fromBuffer(unsigned);
      const fundedTxid = bitcoin.Transaction.fromHex(fundedTxHex).getId();
      const inputTxid = Buffer.from(refundTx.ins[0].hash)
        .slice()
        .reverse()
        .toString("hex");
      expect(inputTxid).toBe(fundedTxid);
      // Must spend the SECOND HTLC (vout 1), not vout 0.
      expect(refundTx.ins[0].index).toBe(1);
      expect(refundTx.ins[0].sequence).toBe(TEST_TIMELOCK_REFUND);
    });

    it("rejects when the (hashlocks, amounts) vector disagrees with the funded tx", async () => {
      // Fund a 2-vault Pre-PegIn with the real (hashlocks, amounts).
      const realParams = makePrePeginParams({
        hashlocks: [TEST_HASH_H, SECOND_HASH],
        pegInAmounts: [TEST_AMOUNTS.PEGIN, SECOND_AMOUNT],
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });
      const real = await buildPrePeginPsbt(realParams);
      const fundedTxHex = fundPeginTransaction({
        unfundedTxHex: real.psbtHex,
        selectedUTXOs: [
          {
            txid: "aa".repeat(32),
            vout: 0,
            value: Number(real.totalOutputValue + 10_000n),
            scriptPubKey: "0014" + "bb".repeat(20),
          },
        ],
        changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        changeAmount: 10_000n,
        network: bitcoin.networks.testnet,
      });

      // Try to refund using a template that names a DIFFERENT second
      // hashlock. The HTLC scriptPubKey at vout 1 would not match the
      // funded tx's vout 1 — the new cross-check must reject before
      // the WASM produces a refund tx that signs the wrong output.
      const wrongHashlock = "ff".repeat(32);
      const wrongParams = makePrePeginParams({
        hashlocks: [TEST_HASH_H, wrongHashlock],
        pegInAmounts: [TEST_AMOUNTS.PEGIN, SECOND_AMOUNT],
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      await expect(
        buildRefundPsbt({
          prePeginParams: wrongParams,
          fundedPrePeginTxHex: fundedTxHex,
          htlcVout: 1,
          refundFee: TEST_REFUND_FEE,
          hashlock: wrongHashlock,
        }),
      ).rejects.toThrow();
    });
  });

  describe("HTLC value cross-check", () => {
    it("rejects when pegInAmounts disagree with the funded HTLC value", async () => {
      // Fund a Pre-PegIn with the real pegInAmounts, then reconstruct the
      // refund template with an inflated pegInAmount (same hashlock + keys,
      // so the HTLC *script* still matches). The HTLC script does not depend
      // on the amount, so the script cross-check passes — only the value
      // cross-check catches that the template's HTLC value no longer equals
      // the funded output. This is the bug class where a caller feeds the
      // HTLC output value (not the original peg-in amount) as pegInAmounts.
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      await expect(
        buildRefundPsbt({
          prePeginParams: {
            ...params,
            pegInAmounts: [params.pegInAmounts[0] + 10_000n],
          },
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
          refundFee: TEST_REFUND_FEE,
          hashlock: TEST_HASH_H,
        }),
      ).rejects.toThrow(/value mismatch/i);
    });
  });

  describe("refund output pinning", () => {
    it("pays the single refund output to the depositor's BIP-86 address", async () => {
      // The refund must return funds to exactly one output — the depositor's
      // own BIP-86 P2TR address derived from their key — so a malformed
      // template can't redirect the reclaimed funds elsewhere.
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
      const unsigned = psbt.data.globalMap.unsignedTx.toBuffer();
      const refundTx = bitcoin.Transaction.fromBuffer(unsigned);
      expect(refundTx.outs.length).toBe(1);
      const outputScript = uint8ArrayToHex(
        new Uint8Array(refundTx.outs[0].script),
      ).toLowerCase();
      const expectedScript = stripHexPrefix(
        deriveBip86ScriptPubKeyHex(TEST_KEYS.DEPOSITOR),
      ).toLowerCase();
      expect(outputScript).toBe(expectedScript);

      // The single output returns the full HTLC value minus exactly the
      // requested fee — no value silently burned as excess miner fee.
      const fundedHtlcValue = BigInt(
        bitcoin.Transaction.fromHex(txHex).outs[0].value,
      );
      expect(BigInt(refundTx.outs[0].value)).toBe(
        fundedHtlcValue - TEST_REFUND_FEE,
      );
    });
  });

  describe("peg-in amount pass-through", () => {
    it("passes the on-chain peg-in amount straight through and the value cross-check accepts it (real WASM)", async () => {
      // `batch[i].amount` is the on-chain vault deposit (peg-in) amount, which
      // is exactly what WASM's `pegInAmounts` expects: WASM re-adds the protocol
      // reserve (`depositorClaimValue + minPeginFee`) internally when it sizes
      // the HTLC output, so the template's HTLC value equals the funded tx's
      // output and `buildRefundPsbt`'s value cross-check passes. Fund with a
      // known peg-in amount and prove the unmodified amount reconstructs a
      // template the cross-check accepts — a legitimate refund does not throw.
      const { txHex, params } = await buildFundedPrePegin({
        authAnchorHash: TEST_AUTH_ANCHOR_HASH,
      });

      await expect(
        buildRefundPsbt({
          prePeginParams: { ...params, pegInAmounts: [TEST_AMOUNTS.PEGIN] },
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
          refundFee: TEST_REFUND_FEE,
          hashlock: TEST_HASH_H,
        }),
      ).resolves.toMatchObject({ psbtHex: expect.any(String) });
    });
  });

  describe("pegInAmounts input guard", () => {
    // Refund reconstruction builds the WASM template from pegInAmounts with no
    // amount-echo backstop, so the input guard at the BigUint64Array
    // construction is the only check on these values.
    it("rejects a non-positive pegInAmount", async () => {
      const { txHex, params } = await buildFundedPrePegin();

      await expect(
        buildRefundPsbt({
          prePeginParams: { ...params, pegInAmounts: [0n] },
          fundedPrePeginTxHex: txHex,
          htlcVout: 0,
          refundFee: TEST_REFUND_FEE,
          hashlock: TEST_HASH_H,
        }),
      ).rejects.toThrow(/pegInAmounts\[0\] must be > 0/);
    });
  });
});
