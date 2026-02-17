/**
 * Unit tests for the UTXO Allocation Service.
 *
 * The tests mock `createSplitTransaction` (SDK) and `getBTCNetworkForWASM`
 * so this module has no external dependencies and runs in isolation.
 *
 * Fee constants at feeRate=5 sat/vByte:
 *   estimatePeginTxFee(5)        = ceil(155 × 5)  = 775 sats
 *   estimateSplitTxFee(1, 3, 5)  = ceil(198 × 5)  = 990 sats   (1 input, 3 outputs)
 *   estimateSplitTxFee(2, 3, 5)  = ceil(256 × 5)  = 1280 sats  (2 inputs, 3 outputs)
 *   estimateSplitTxFee(10, 3, 5) = ceil(720 × 5)  = 3600 sats  (10 inputs, 3 outputs)
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { planUtxoAllocation } from "../utxoAllocationService";

// ─── Mocks (hoisted so they run before module imports) ───────────────────────

const mockCreateSplitTransaction = vi.hoisted(() => vi.fn());
const mockGetBTCNetworkForWASM = vi.hoisted(() => vi.fn(() => "testnet"));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  createSplitTransaction: mockCreateSplitTransaction,
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: mockGetBTCNetworkForWASM,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal UTXO fixture. */
function makeUtxo(value: number, index = 0): UTXO {
  return {
    txid: `${"a".repeat(63)}${index}`,
    vout: 0,
    value,
    scriptPubKey: "5120" + "ab".repeat(32), // P2TR scriptPubKey (34 bytes)
  };
}

/** Default split tx result returned by the mock. */
const MOCK_SPLIT_TX = {
  txHex: "deadbeef",
  txid: "cafebabe" + "0".repeat(56),
  outputs: [],
};

const CHANGE_ADDRESS = "tb1p" + "a".repeat(58);
const FEE_RATE = 5; // sat/vByte

// ─── Constants (must mirror utxoAllocationService.ts) ────────────────────────

const PEGIN_FEE_5 = 775n; // ceil(155 × 5)
const SPLIT_FEE_1_INPUT_5 = 990n; // ceil(198 × 5)
const SPLIT_FEE_2_INPUTS_5 = 1280n; // ceil(256 × 5)
const SPLIT_FEE_10_INPUTS_5 = 3600n; // ceil(720 × 5)

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("planUtxoAllocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSplitTransaction.mockReturnValue(MOCK_SPLIT_TX);
    mockGetBTCNetworkForWASM.mockReturnValue("testnet");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Input validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("input validation", () => {
    it("throws if vaultAmounts is empty", () => {
      expect(() =>
        planUtxoAllocation([makeUtxo(1_000_000)], [], FEE_RATE, CHANGE_ADDRESS),
      ).toThrow("vaultAmounts must not be empty");
    });

    it("throws if vaultAmounts has more than 2 elements", () => {
      const utxos = [makeUtxo(10_000_000)];
      expect(() =>
        planUtxoAllocation(
          utxos,
          [1_000_000n, 1_000_000n, 1_000_000n],
          FEE_RATE,
          CHANGE_ADDRESS,
        ),
      ).toThrow("Only 1 or 2 vaults are supported");
    });

    it("throws if availableUtxos is empty", () => {
      expect(() =>
        planUtxoAllocation([], [50_000_000n], FEE_RATE, CHANGE_ADDRESS),
      ).toThrow("No UTXOs available for deposit");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE strategy
  // ═══════════════════════════════════════════════════════════════════════════

  describe("SINGLE strategy (1 vault)", () => {
    it("returns SINGLE plan without touching UTXOs", () => {
      const utxos = [makeUtxo(10_000_000)];
      const plan = planUtxoAllocation(
        utxos,
        [5_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SINGLE");
      expect(plan.needsSplit).toBe(false);
      expect(plan.splitTransaction).toBeUndefined();
      expect(plan.vaultAllocations).toHaveLength(1);
    });

    it("sets correct amount and null UTXO in the single allocation", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(10_000_000)],
        [7_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const alloc = plan.vaultAllocations[0];
      expect(alloc?.vaultIndex).toBe(0);
      expect(alloc?.amount).toBe(7_500_000n);
      expect(alloc?.utxo).toBeNull();
      expect(alloc?.fromSplit).toBe(false);
    });

    it("does not call createSplitTransaction for SINGLE", () => {
      planUtxoAllocation(
        [makeUtxo(10_000_000)],
        [5_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );
      expect(mockCreateSplitTransaction).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI_UTXO strategy
  // ═══════════════════════════════════════════════════════════════════════════

  describe("MULTI_UTXO strategy (2 vaults, 2+ sufficient UTXOs)", () => {
    it("returns MULTI_UTXO when both top UTXOs individually cover their vault + pegin fee", () => {
      // UTXO 0: 80M, UTXO 1: 60M; vaults: 70M + 50M
      // sorted: 80M→70M ✓ (80M ≥ 70M+775), 60M→50M ✓ (60M ≥ 50M+775)
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [70_000_000n, 50_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_UTXO");
      expect(plan.needsSplit).toBe(false);
      expect(plan.splitTransaction).toBeUndefined();
      expect(mockCreateSplitTransaction).not.toHaveBeenCalled();
    });

    it("assigns largest UTXO to largest vault amount", () => {
      const utxos = [makeUtxo(60_000_000, 0), makeUtxo(80_000_000, 1)];
      // vaultAmounts[0]=50M, vaultAmounts[1]=70M → vault 1 is larger
      const plan = planUtxoAllocation(
        utxos,
        [50_000_000n, 70_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_UTXO");
      // Allocation sorted by vaultIndex: vault 0 → 50M, vault 1 → 70M
      const alloc0 = plan.vaultAllocations.find((a) => a.vaultIndex === 0);
      const alloc1 = plan.vaultAllocations.find((a) => a.vaultIndex === 1);
      expect(alloc0?.amount).toBe(50_000_000n);
      expect(alloc0?.utxo?.value).toBe(60_000_000);
      expect(alloc1?.amount).toBe(70_000_000n);
      // 80M UTXO assigned to the larger vault (vault 1)
      expect(alloc1?.utxo?.value).toBe(80_000_000);
    });

    it("allocations are sorted by vaultIndex ascending", () => {
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [70_000_000n, 50_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.vaultAllocations[0]?.vaultIndex).toBe(0);
      expect(plan.vaultAllocations[1]?.vaultIndex).toBe(1);
    });

    it("sets fromSplit=false for all MULTI_UTXO allocations", () => {
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [70_000_000n, 50_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      for (const alloc of plan.vaultAllocations) {
        expect(alloc.fromSplit).toBe(false);
        expect(alloc.splitTxOutputIndex).toBeUndefined();
      }
    });

    it("falls through to SPLIT when the second UTXO is too small for its vault", () => {
      // 0.8 BTC and 0.6 BTC UTXOs; vaults 0.65+0.65: 0.6 BTC UTXO < 0.65+775 → SPLIT
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [65_000_000n, 65_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
    });

    it("falls through to SPLIT when UTXOs fail MULTI_UTXO sufficiency but combined total is sufficient for SPLIT", () => {
      // vaults: 35M + 10M. Sorted vaults: [35M, 10M]. UTXOs: 2×30M.
      // MULTI_UTXO check: UTXO #0 (30M) vs vault 35M + 775 = 35_000_775 → 30M < 35_000_775 → FAILS
      // SPLIT: vaultOutputsTotal = (35M+775)+(10M+775) = 45_001_550
      //   after 1st UTXO (30M): splitFee(1,3,5)=990; totalNeeded=45_002_540 > 30M → add 2nd
      //   after 2nd UTXO (60M): splitFee(2,3,5)=1280; totalNeeded=45_002_830 ≤ 60M ✓
      const utxos = [makeUtxo(30_000_000, 0), makeUtxo(30_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [35_000_000n, 10_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
    });

    it("throws insufficient funds when both UTXOs are too small even for SPLIT", () => {
      // 2×10M = 20M total; vaults 45M+45M requires ~90M → always fails
      const utxos = [makeUtxo(10_000_000, 0), makeUtxo(10_000_000, 1)];
      expect(() =>
        planUtxoAllocation(
          utxos,
          [45_000_000n, 45_000_000n],
          FEE_RATE,
          CHANGE_ADDRESS,
        ),
      ).toThrow(/Insufficient funds/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SPLIT strategy — single input (normal case)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("SPLIT strategy — single input", () => {
    it("returns SPLIT plan when only 1 UTXO is available", () => {
      // 1 BTC UTXO, 0.475+0.475 BTC vaults
      const utxos = [makeUtxo(100_000_000)];
      const plan = planUtxoAllocation(
        utxos,
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
      expect(plan.needsSplit).toBe(true);
      expect(mockCreateSplitTransaction).toHaveBeenCalledTimes(1);
    });

    it("vault allocations record the pure vault amount, not the UTXO output size", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      // Each allocation.amount should be the user's requested 47.5M, not 47.5M+775
      expect(plan.vaultAllocations[0]?.amount).toBe(47_500_000n);
      expect(plan.vaultAllocations[1]?.amount).toBe(47_500_000n);
    });

    it("sets fromSplit=true and correct splitTxOutputIndex for each allocation", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.vaultAllocations[0]?.fromSplit).toBe(true);
      expect(plan.vaultAllocations[0]?.splitTxOutputIndex).toBe(0);
      expect(plan.vaultAllocations[1]?.fromSplit).toBe(true);
      expect(plan.vaultAllocations[1]?.splitTxOutputIndex).toBe(1);
    });

    it("split outputs include pegin fee buffer: output.amount = vaultAmount + peginFee", () => {
      // peginFee = 775 sats at feeRate=5
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.splitTransaction?.outputs[0]?.amount).toBe(
        47_500_000n + PEGIN_FEE_5,
      );
      expect(plan.splitTransaction?.outputs[1]?.amount).toBe(
        47_500_000n + PEGIN_FEE_5,
      );
    });

    it("includes a change output when change is above dust threshold", () => {
      // 1 BTC → 0.475+0.475; change = 100M - 2*(47.5M+775) - 990 = 4_997_460 sats
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const outputs = plan.splitTransaction?.outputs ?? [];
      expect(outputs).toHaveLength(3);
      // vault output[0] + vault output[1] + change output[2]
      const vaultOutputTotal = (47_500_000n + PEGIN_FEE_5) * 2n;
      const expectedChange =
        100_000_000n - vaultOutputTotal - SPLIT_FEE_1_INPUT_5;
      expect(outputs[2]?.amount).toBe(expectedChange);
      expect(outputs[2]?.address).toBe(CHANGE_ADDRESS);
    });

    it("omits change output when change is at or below dust threshold (546 sats)", () => {
      // Craft input so change = exactly DUST (546) → must NOT create output
      // vaultOutputsTotal = (45M+775)*2 = 90_001_550; splitFee=990
      // totalNeeded = 90_001_550 + 990 = 90_002_540
      // For change=546: input = totalNeeded + 546 = 90_003_086
      const dustyValue = 90_003_086;
      const plan = planUtxoAllocation(
        [makeUtxo(dustyValue)],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      // change = 90_003_086 - 90_001_550 - 990 = 546 → equals dust, NOT above
      expect(plan.splitTransaction?.outputs).toHaveLength(2);
    });

    it("creates change output when change is exactly 1 sat above dust (547 sats)", () => {
      const value = 90_003_087; // change = 547
      const plan = planUtxoAllocation(
        [makeUtxo(value)],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.splitTransaction?.outputs).toHaveLength(3);
      expect(plan.splitTransaction?.outputs[2]?.amount).toBe(547n);
    });

    it("passes the mock split transaction txHex and txid to the plan", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.splitTransaction?.txHex).toBe(MOCK_SPLIT_TX.txHex);
      expect(plan.splitTransaction?.txid).toBe(MOCK_SPLIT_TX.txid);
    });

    it("uses the network returned by getBTCNetworkForWASM", () => {
      mockGetBTCNetworkForWASM.mockReturnValue("bitcoin");
      planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(mockCreateSplitTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "bitcoin",
      );
    });

    it("throws insufficient funds when 1 BTC UTXO cannot fund a 1 BTC pegin (0.5+0.5)", () => {
      // totalNeeded = (50M+775)*2 + 990 = 100_002_540 > 100_000_000
      expect(() =>
        planUtxoAllocation(
          [makeUtxo(100_000_000)],
          [50_000_000n, 50_000_000n],
          FEE_RATE,
          CHANGE_ADDRESS,
        ),
      ).toThrow(/Insufficient funds/);
    });

    it("succeeds with a 0.95 BTC pegin (0.475+0.475) from a 1 BTC UTXO", () => {
      // totalNeeded = (47.5M+775)*2 + 990 = 95_002_540 < 100_000_000 ✓
      expect(() =>
        planUtxoAllocation(
          [makeUtxo(100_000_000)],
          [47_500_000n, 47_500_000n],
          FEE_RATE,
          CHANGE_ADDRESS,
        ),
      ).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SPLIT strategy — multi-input (the bug-fix scenario)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("SPLIT strategy — multi-input (fee scales with input count)", () => {
    it("scenario 2: 0.8+0.6 BTC UTXOs → 1.3 BTC pegin uses SPLIT with 2 inputs", () => {
      // MULTI_UTXO fails: 0.6 BTC UTXO < 0.65 BTC vault + 775 fee
      // SPLIT: vaultOutputsTotal = (65M+775)*2 = 130_001_550
      //   after 1st UTXO (80M): splitFee(1,3,5)=990; totalNeeded=130_002_540 > 80M → add 2nd
      //   after 2nd UTXO (140M): splitFee(2,3,5)=1280; totalNeeded=130_002_830 ≤ 140M ✓
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [65_000_000n, 65_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
      expect(plan.splitTransaction?.inputs).toHaveLength(2);
    });

    it("scenario 2: split tx is called with both input UTXOs", () => {
      const utxo0 = makeUtxo(80_000_000, 0);
      const utxo1 = makeUtxo(60_000_000, 1);
      planUtxoAllocation(
        [utxo0, utxo1],
        [65_000_000n, 65_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const [calledInputs] = mockCreateSplitTransaction.mock.calls[0] ?? [];
      expect(calledInputs).toHaveLength(2);
    });

    it("scenario 2: change is calculated using the 2-input split fee, not the 1-input fee", () => {
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [65_000_000n, 65_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const vaultOutputsTotal = (65_000_000n + PEGIN_FEE_5) * 2n; // 130_001_550
      const expectedChange =
        140_000_000n - vaultOutputsTotal - SPLIT_FEE_2_INPUTS_5;
      // expectedChange = 140M - 130_001_550 - 1280 = 8_997_170
      const changeOutput = plan.splitTransaction?.outputs[2];
      expect(changeOutput?.amount).toBe(expectedChange);
    });

    it("scenario 3: 10×0.1 BTC UTXOs → 0.9 BTC pegin selects all 10 UTXOs", () => {
      // Each UTXO = 10M. vaultOutputsTotal = (45M+775)*2 = 90_001_550
      // After 9 UTXOs (90M): splitFee(9,3,5)=ceil((522+129+11)*5)=3310; totalNeeded=90_004_860 > 90M → add 10th
      // After 10 UTXOs (100M): splitFee(10,3,5)=3600; totalNeeded=90_005_150 ≤ 100M ✓
      const utxos = Array.from({ length: 10 }, (_, i) =>
        makeUtxo(10_000_000, i),
      );
      const plan = planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
      expect(plan.splitTransaction?.inputs).toHaveLength(10);
    });

    it("scenario 3: change uses the 10-input split fee (3600 sats), not the 1-input fee (990 sats)", () => {
      const utxos = Array.from({ length: 10 }, (_, i) =>
        makeUtxo(10_000_000, i),
      );
      const plan = planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const vaultOutputsTotal = (45_000_000n + PEGIN_FEE_5) * 2n; // 90_001_550
      const expectedChange =
        100_000_000n - vaultOutputsTotal - SPLIT_FEE_10_INPUTS_5;
      // expectedChange = 100M - 90_001_550 - 3600 = 9_994_850

      const changeOutput = plan.splitTransaction?.outputs[2];
      expect(changeOutput?.amount).toBe(expectedChange);
    });

    it("scenario 3: 9 UTXOs of 0.1 BTC are insufficient for a 0.9 BTC pegin due to higher multi-input fee", () => {
      // 9 × 10M = 90M; vaultOutputsTotal=90_001_550; splitFee(9,3,5)=3310
      // totalNeeded=90_004_860 > 90_000_000 → insufficient
      const utxos = Array.from({ length: 9 }, (_, i) =>
        makeUtxo(10_000_000, i),
      );
      expect(() =>
        planUtxoAllocation(
          utxos,
          [45_000_000n, 45_000_000n],
          FEE_RATE,
          CHANGE_ADDRESS,
        ),
      ).toThrow(/Insufficient funds/);
    });

    it("split tx inputs are ordered largest-first", () => {
      // 3 UTXOs out of order: 30M, 50M, 40M → sorted: 50M, 40M, 30M
      // vaultOutputsTotal = (45M+775)*2 = 90_001_550
      // After 50M: splitFee(1,3,5)=990; totalNeeded=90_002_540 > 50M
      // After 90M: splitFee(2,3,5)=1280; totalNeeded=90_002_830 > 90M (barely)
      // After 120M: splitFee(3,3,5)=ceil((174+129+11)*5)=1570; totalNeeded=90_003_120 ≤ 120M ✓
      const utxos = [
        makeUtxo(30_000_000, 0),
        makeUtxo(50_000_000, 1),
        makeUtxo(40_000_000, 2),
      ];
      planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const [calledInputs] = mockCreateSplitTransaction.mock.calls[0] ?? [];
      const values = (calledInputs as UTXO[]).map((u) => u.value);
      // Should be [50M, 40M, 30M] — descending
      expect(values).toEqual([50_000_000, 40_000_000, 30_000_000]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("SPLIT: allocations have utxo=null (UTXOs come from split tx outputs)", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      for (const alloc of plan.vaultAllocations) {
        expect(alloc.utxo).toBeNull();
      }
    });

    it("SPLIT inputs list is stored in the split transaction", () => {
      const utxo = makeUtxo(100_000_000);
      const plan = planUtxoAllocation(
        [utxo],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.splitTransaction?.inputs).toHaveLength(1);
      expect(plan.splitTransaction?.inputs[0]).toEqual(utxo);
    });

    it("split output addresses match the provided changeAddress", () => {
      const customAddress = "tb1p" + "b".repeat(58);
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        customAddress,
      );

      for (const output of plan.splitTransaction?.outputs ?? []) {
        expect(output.address).toBe(customAddress);
      }
    });

    it("vaultAllocations length matches vaultAmounts length for 2 vaults", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.vaultAllocations).toHaveLength(2);
    });

    it("works correctly with asymmetric vault amounts in SPLIT mode", () => {
      // vault[0]=30M, vault[1]=60M — unequal split
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [30_000_000n, 60_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
      expect(plan.vaultAllocations[0]?.amount).toBe(30_000_000n);
      expect(plan.vaultAllocations[1]?.amount).toBe(60_000_000n);
      // Output[0] funds vault 0, output[1] funds vault 1
      expect(plan.splitTransaction?.outputs[0]?.amount).toBe(
        30_000_000n + PEGIN_FEE_5,
      );
      expect(plan.splitTransaction?.outputs[1]?.amount).toBe(
        60_000_000n + PEGIN_FEE_5,
      );
    });

    it("MULTI_UTXO: uses only the 2 largest UTXOs even when more are available", () => {
      // 5 UTXOs; only top 2 should be used
      const utxos = [
        makeUtxo(80_000_000, 0),
        makeUtxo(70_000_000, 1),
        makeUtxo(10_000_000, 2),
        makeUtxo(10_000_000, 3),
        makeUtxo(10_000_000, 4),
      ];
      const plan = planUtxoAllocation(
        utxos,
        [70_000_000n, 60_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_UTXO");
      // No split tx created
      expect(mockCreateSplitTransaction).not.toHaveBeenCalled();
      // Only 2 allocations, each with a UTXO
      expect(plan.vaultAllocations[0]?.utxo).not.toBeNull();
      expect(plan.vaultAllocations[1]?.utxo).not.toBeNull();
    });
  });
});
