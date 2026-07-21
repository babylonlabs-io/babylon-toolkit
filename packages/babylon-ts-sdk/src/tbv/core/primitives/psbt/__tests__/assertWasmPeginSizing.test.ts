/**
 * Tests for assertWasmPeginSizing — the cross-check that guards every
 * value-bearing field WASM returns from createPrePeginTransaction before it
 * feeds a signed tx or the on-chain PegIn registration (CLAUDE.md #1).
 */

import type {
  Network,
  PrePeginResult,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  computeMinClaimValueMock,
  computeMinPeginFeeMock,
  peginP2aAnchorOutputMock,
} = vi.hoisted(() => ({
  computeMinClaimValueMock: vi.fn(),
  computeMinPeginFeeMock: vi.fn(),
  peginP2aAnchorOutputMock: vi.fn(),
}));

vi.mock("@babylonlabs-io/babylon-tbv-rust-wasm", () => ({
  computeMinClaimValue: computeMinClaimValueMock,
  computeMinPeginFee: computeMinPeginFeeMock,
  peginP2aAnchorOutput: peginP2aAnchorOutputMock,
}));

import {
  assertEncodedHtlcOutputsMatch,
  assertWasmPeginSizing,
} from "../assertWasmPeginSizing";
import type { PrePeginParams } from "../pegin";

const CLAIM_VALUE = 5_000n;
const PEGIN_AMOUNT = 100_000n;
const PEGIN_FEE = 1_000n;
// v2 P2A anchor value the mocked peginP2aAnchorOutput reports.
const ANCHOR_VALUE = 240n;
// makeParams uses minPeginFeeRate = 10n, so the binary-independent
// plausibility cap is 10 × MAX_REASONABLE_PEGIN_VBYTES (100_000) =
// 1_000_000 sat.
const RESERVE_PLAUSIBILITY_CAP = 1_000_000n;

function makeParams(overrides?: Partial<PrePeginParams>): PrePeginParams {
  return {
    vaultCoreVersion: 1,
    depositorPubkey: "aa".repeat(32),
    vaultProviderPubkey: "bb".repeat(32),
    vaultKeeperPubkeys: ["cc".repeat(32)],
    universalChallengerPubkeys: ["dd".repeat(32)],
    hashlocks: ["ab".repeat(32)],
    timelockRefund: 50,
    pegInAmounts: [PEGIN_AMOUNT],
    feeRate: 10n,
    minPeginFeeRate: 10n,
    numLocalChallengers: 1,
    councilQuorum: 2,
    councilSize: 3,
    network: "signet" as Network,
    ...overrides,
  };
}

function makeResult(overrides?: Partial<PrePeginResult>): PrePeginResult {
  return {
    txHex: "00",
    txid: "ff".repeat(32),
    htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE],
    htlcScriptPubKeys: ["5120" + "11".repeat(32)],
    htlcAddresses: ["tb1pexampleaddress"],
    peginAmounts: [PEGIN_AMOUNT],
    depositorClaimValue: CLAIM_VALUE,
    ...overrides,
  };
}

describe("assertWasmPeginSizing", () => {
  beforeEach(() => {
    computeMinClaimValueMock.mockReset();
    computeMinClaimValueMock.mockResolvedValue(CLAIM_VALUE);
    computeMinPeginFeeMock.mockReset();
    computeMinPeginFeeMock.mockResolvedValue(PEGIN_FEE);
    // Default: v1 — no P2A anchor.
    peginP2aAnchorOutputMock.mockReset();
    peginP2aAnchorOutputMock.mockResolvedValue(null);
  });

  it("resolves without throwing for a valid single-vault result", async () => {
    await expect(
      assertWasmPeginSizing(makeResult(), makeParams()),
    ).resolves.toBeUndefined();
  });

  it("throws when htlcValues length does not match the request", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [
            PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE,
            PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE,
          ],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/expected 1 .one per requested deposit/);
  });

  it("throws when parallel array lengths disagree", async () => {
    await expect(
      assertWasmPeginSizing(makeResult({ peginAmounts: [] }), makeParams()),
    ).rejects.toThrow(/mismatched array lengths/);
  });

  it("throws when depositorClaimValue is non-positive", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({ depositorClaimValue: 0n }),
        makeParams(),
      ),
    ).rejects.toThrow(/non-positive depositorClaimValue/);
  });

  it("throws when depositorClaimValue disagrees with computeMinClaimValue", async () => {
    computeMinClaimValueMock.mockResolvedValue(CLAIM_VALUE + 1n);
    await expect(
      assertWasmPeginSizing(makeResult(), makeParams()),
    ).rejects.toThrow(/does not match the independently computed/);
  });

  it("throws when peginAmount does not echo the requested amount", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({
          peginAmounts: [PEGIN_AMOUNT - 1n],
          // keep htlcValue consistent so the amount check is what trips
          htlcValues: [PEGIN_AMOUNT - 1n + CLAIM_VALUE + PEGIN_FEE],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/does not match the requested amount/);
  });

  it("throws the independent strict-cover bound when the reserve is zero", async () => {
    await expect(
      assertWasmPeginSizing(
        // implied reserve == 0: fee/anchor budget missing entirely. This
        // must trip the binary-independent floor, not just the
        // WASM-vs-WASM identity.
        makeResult({ htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE] }),
        makeParams(),
      ),
    ).rejects.toThrow(/does not strictly cover/);
  });

  it("throws the independent plausibility cap even when the WASM reference agrees", async () => {
    // A consistently doctored binary: the builder AND computeMinPeginFee
    // both report the same grossly inflated reserve, so the exact identity
    // holds — only the pure-JS cap can reject it.
    computeMinPeginFeeMock.mockResolvedValue(RESERVE_PLAUSIBILITY_CAP + 1n);
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [
            PEGIN_AMOUNT + CLAIM_VALUE + RESERVE_PLAUSIBILITY_CAP + 1n,
          ],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/exceeds the plausibility cap/);
  });

  it("throws when the reserve exceeds the exact minPeginFee (inflated htlcValue)", async () => {
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE + 1n],
        }),
        makeParams(),
      ),
    ).rejects.toThrow(/expected exactly/);
  });

  it("v2: accepts a reserve of exactly minPeginFee + anchor value", async () => {
    peginP2aAnchorOutputMock.mockResolvedValue({
      value: ANCHOR_VALUE,
      vout: 2,
      scriptPubKey: "51024e73",
    });
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE + ANCHOR_VALUE],
        }),
        makeParams({ vaultCoreVersion: 2 }),
      ),
    ).resolves.toBeUndefined();
  });

  it("v2: throws when the htlcValue omits the anchor value (v1 formula)", async () => {
    peginP2aAnchorOutputMock.mockResolvedValue({
      value: ANCHOR_VALUE,
      vout: 2,
      scriptPubKey: "51024e73",
    });
    await expect(
      assertWasmPeginSizing(
        makeResult({
          htlcValues: [PEGIN_AMOUNT + CLAIM_VALUE + PEGIN_FEE],
        }),
        makeParams({ vaultCoreVersion: 2 }),
      ),
    ).rejects.toThrow(/expected exactly/);
  });

  describe("two-vault batch (overlapping inputs, distinct keys)", () => {
    const PEGIN_A = 100_000n;
    const PEGIN_B = 250_000n;

    function makeTwoVaultParams(): PrePeginParams {
      return makeParams({
        hashlocks: ["ab".repeat(32), "cd".repeat(32)],
        pegInAmounts: [PEGIN_A, PEGIN_B],
      });
    }

    function makeTwoVaultResult(
      overrides?: Partial<PrePeginResult>,
    ): PrePeginResult {
      return makeResult({
        htlcValues: [
          PEGIN_A + CLAIM_VALUE + PEGIN_FEE,
          PEGIN_B + CLAIM_VALUE + PEGIN_FEE,
        ],
        htlcScriptPubKeys: ["5120" + "11".repeat(32), "5120" + "22".repeat(32)],
        htlcAddresses: ["tb1pvaulta", "tb1pvaultb"],
        peginAmounts: [PEGIN_A, PEGIN_B],
        ...overrides,
      });
    }

    it("resolves for a valid two-vault result", async () => {
      await expect(
        assertWasmPeginSizing(makeTwoVaultResult(), makeTwoVaultParams()),
      ).resolves.toBeUndefined();
    });

    it("catches a tampered second-vault peginAmount", async () => {
      await expect(
        assertWasmPeginSizing(
          makeTwoVaultResult({
            peginAmounts: [PEGIN_A, PEGIN_B - 10_000n],
          }),
          makeTwoVaultParams(),
        ),
      ).rejects.toThrow(/peginAmount\[1\].*does not match the requested amount/);
    });

    it("catches an inflated second-vault htlcValue", async () => {
      await expect(
        assertWasmPeginSizing(
          makeTwoVaultResult({
            htlcValues: [
              PEGIN_A + CLAIM_VALUE + PEGIN_FEE,
              PEGIN_B + CLAIM_VALUE + PEGIN_FEE + 1n,
            ],
          }),
          makeTwoVaultParams(),
        ),
      ).rejects.toThrow(/htlcValue\[1\].*expected exactly/);
    });
  });
});

describe("assertEncodedHtlcOutputsMatch", () => {
  const SCRIPT_A = "5120" + "11".repeat(32);
  const SCRIPT_B = "5120" + "22".repeat(32);
  const OP_RETURN_SCRIPT = "6a20" + "ab".repeat(32);
  const ANCHOR_SCRIPT = "51024e73";

  // HTLC outputs first (vouts 0..N-1), then optional OP_RETURN, then CPFP
  // anchor — mirroring the WASM layout.
  function htlcOutput(value: bigint, scriptHex: string) {
    return { value: Number(value), script: Buffer.from(scriptHex, "hex") };
  }

  it("passes when encoded HTLC outputs match the validated metadata", () => {
    const outputs = [
      htlcOutput(105_000n, SCRIPT_A),
      htlcOutput(255_000n, SCRIPT_B),
      htlcOutput(0n, OP_RETURN_SCRIPT),
      htlcOutput(330n, ANCHOR_SCRIPT),
    ];
    expect(() =>
      assertEncodedHtlcOutputsMatch(
        outputs,
        [105_000n, 255_000n],
        [SCRIPT_A, SCRIPT_B],
      ),
    ).not.toThrow();
  });

  it("throws when an encoded HTLC output value differs from htlcValues", () => {
    const outputs = [
      htlcOutput(105_000n, SCRIPT_A),
      htlcOutput(254_999n, SCRIPT_B),
    ];
    expect(() =>
      assertEncodedHtlcOutputsMatch(
        outputs,
        [105_000n, 255_000n],
        [SCRIPT_A, SCRIPT_B],
      ),
    ).toThrow(/output\[1\] value 254999 does not match the cross-checked htlcValue 255000/);
  });

  it("throws when an encoded HTLC scriptPubKey differs from htlcScriptPubKeys", () => {
    const outputs = [htlcOutput(105_000n, SCRIPT_B)];
    expect(() =>
      assertEncodedHtlcOutputsMatch(outputs, [105_000n], [SCRIPT_A]),
    ).toThrow(/output\[0\] scriptPubKey .* does not match the cross-checked htlcScriptPubKey/);
  });

  it("throws when the encoded tx has fewer outputs than validated HTLCs", () => {
    const outputs = [htlcOutput(105_000n, SCRIPT_A)];
    expect(() =>
      assertEncodedHtlcOutputsMatch(
        outputs,
        [105_000n, 255_000n],
        [SCRIPT_A, SCRIPT_B],
      ),
    ).toThrow(/has 1 output\(s\), fewer than the 2 HTLC output\(s\)/);
  });
});
