/**
 * Unit tests for the UTXO Allocation Service.
 *
 * The tests mock `createSplitTransaction` (SDK) and `getBTCNetworkForWASM`
 * so this module has no external dependencies and runs in isolation.
 *
 * Fee constants at feeRate=5 sat/vByte:
 *   estimatePeginTxFee(1, 5)  = ceil((58+43+43+11)×5)  = ceil(155×5)  = 775 sats
 *   estimatePeginTxFee(2, 5)  = ceil((116+43+43+11)×5) = ceil(213×5)  = 1065 sats
 *   estimatePeginTxFee(5, 5)  = ceil((290+43+43+11)×5) = ceil(387×5)  = 1935 sats
 *   estimateSplitTxFee(1,3,5) = ceil(198×5)  = 990 sats   (1 input, 3 outputs)
 *   estimateSplitTxFee(2,3,5) = ceil(256×5)  = 1280 sats  (2 inputs, 3 outputs)
 */

import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { planUtxoAllocation } from "../utxoAllocationService";

// ─── Mocks (hoisted so they run before module imports) ───────────────────────

const mockCreateSplitTransaction = vi.hoisted(() => vi.fn());
const mockGetBTCNetworkForWASM = vi.hoisted(() => vi.fn(() => "testnet"));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  createSplitTransaction: mockCreateSplitTransaction,
  // Fee constants from SDK's fee/constants.ts — stable Bitcoin protocol values
  P2TR_INPUT_SIZE: 58,
  MAX_NON_LEGACY_OUTPUT_SIZE: 43,
  TX_BUFFER_SIZE_OVERHEAD: 11,
  BTC_DUST_SAT: 546,
  DUST_THRESHOLD: 546n,
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

const PEGIN_FEE_1_INPUT_5 = 775n; // ceil(155 × 5)  — 1 input
const PEGIN_FEE_2_INPUTS_5 = 1065n; // ceil(213 × 5)  — 2 inputs
const PEGIN_FEE_5_INPUTS_5 = 1935n; // ceil(387 × 5)  — 5 inputs
const SPLIT_FEE_1_INPUT_5 = 990n; // ceil(198 × 5)
const SPLIT_FEE_2_INPUTS_5 = 1280n; // ceil(256 × 5)

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

    it("sets correct amount and empty utxos in the single allocation", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(10_000_000)],
        [7_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const alloc = plan.vaultAllocations[0];
      expect(alloc?.vaultIndex).toBe(0);
      expect(alloc?.amount).toBe(7_500_000n);
      expect(alloc?.utxos).toEqual([]);
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
  // MULTI_INPUT strategy
  // ═══════════════════════════════════════════════════════════════════════════

  describe("MULTI_INPUT strategy (2 vaults, UTXOs partitioned directly)", () => {
    it("returns MULTI_INPUT when top 2 UTXOs each individually cover their vault + 1-input pegin fee", () => {
      // 80M→70M ✓ (80M ≥ 70M+775), 60M→50M ✓ (60M ≥ 50M+775)
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [70_000_000n, 50_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_INPUT");
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

      expect(plan.strategy).toBe("MULTI_INPUT");
      const alloc0 = plan.vaultAllocations.find((a) => a.vaultIndex === 0);
      const alloc1 = plan.vaultAllocations.find((a) => a.vaultIndex === 1);
      expect(alloc0?.amount).toBe(50_000_000n);
      expect(alloc0?.utxos[0]?.value).toBe(60_000_000); // 60M UTXO assigned to 50M vault
      expect(alloc1?.amount).toBe(70_000_000n);
      expect(alloc1?.utxos[0]?.value).toBe(80_000_000); // 80M UTXO assigned to 70M vault
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

    it("sets fromSplit=false and no splitTxOutputIndex for all MULTI_INPUT allocations", () => {
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

    it("scenario 3: 10×0.1 BTC UTXOs → 0.9 BTC pegin uses MULTI_INPUT (5 UTXOs per vault)", () => {
      // Each vault needs 45M + peginFee(5 inputs, 5) = 45M + 1935 = 45_001_935
      // After 5 UTXOs (50M): 50M ≥ 45_001_935 ✓ → vault 0 gets UTXOs 0-4
      // Remaining 5 UTXOs (50M) → vault 1: same check ✓
      const utxos = Array.from({ length: 10 }, (_, i) =>
        makeUtxo(10_000_000, i),
      );
      const plan = planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_INPUT");
      expect(plan.needsSplit).toBe(false);
      expect(mockCreateSplitTransaction).not.toHaveBeenCalled();
    });

    it("scenario 3: each vault gets exactly 5 UTXOs", () => {
      const utxos = Array.from({ length: 10 }, (_, i) =>
        makeUtxo(10_000_000, i),
      );
      const plan = planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.vaultAllocations[0]?.utxos).toHaveLength(5);
      expect(plan.vaultAllocations[1]?.utxos).toHaveLength(5);
    });

    it("scenario 3: the two UTXO sets are disjoint (no UTXO used twice)", () => {
      const utxos = Array.from({ length: 10 }, (_, i) =>
        makeUtxo(10_000_000, i),
      );
      const plan = planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const txids0 = new Set(
        plan.vaultAllocations[0]?.utxos.map((u) => u.txid),
      );
      const txids1 = new Set(
        plan.vaultAllocations[1]?.utxos.map((u) => u.txid),
      );
      for (const txid of txids1) {
        expect(txids0.has(txid)).toBe(false);
      }
    });

    it("MULTI_INPUT with 2 UTXOs: each vault gets 1 UTXO when individually sufficient", () => {
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [70_000_000n, 50_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_INPUT");
      expect(plan.vaultAllocations[0]?.utxos).toHaveLength(1);
      expect(plan.vaultAllocations[1]?.utxos).toHaveLength(1);
    });

    it("MULTI_INPUT: pegin fee scales with number of inputs (2-input allocation per vault)", () => {
      // 4×30M UTXOs; vaults 50M+50M
      // Vault 0: 30M < 50M+775. Add 2nd 30M: 60M ≥ 50M + peginFee(2,5)=1065 ✓ → 2 UTXOs
      // Vault 1: same → 2 UTXOs from remaining
      const utxos = Array.from({ length: 4 }, (_, i) =>
        makeUtxo(30_000_000, i),
      );
      const plan = planUtxoAllocation(
        utxos,
        [50_000_000n, 50_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("MULTI_INPUT");
      expect(plan.vaultAllocations[0]?.utxos).toHaveLength(2);
      expect(plan.vaultAllocations[1]?.utxos).toHaveLength(2);
    });

    it("MULTI_INPUT with 5 UTXOs: uses only as many as needed per vault", () => {
      // 5 UTXOs: [80M, 70M, 10M, 10M, 10M]; vaults: 70M+60M
      // Vault 0 (70M): 80M ≥ 70M+775 → 1 UTXO. Vault 1 (60M): 70M ≥ 60M+775 → 1 UTXO
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

      expect(plan.strategy).toBe("MULTI_INPUT");
      expect(mockCreateSplitTransaction).not.toHaveBeenCalled();
      expect(plan.vaultAllocations[0]?.utxos.length).toBeGreaterThan(0);
      expect(plan.vaultAllocations[1]?.utxos.length).toBeGreaterThan(0);
    });

    it("falls through to SPLIT when UTXOs cannot fund vault 1 after vault 0 is allocated", () => {
      // 0.8+0.6 BTC UTXOs; vaults 0.65+0.65
      // Vault 0 (65M): 80M ≥ 65M+775 → allocated [80M]
      // Vault 1 (65M): remaining [60M]. 60M < 65M+775 → pool exhausted → SPLIT
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [65_000_000n, 65_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.strategy).toBe("SPLIT");
    });

    it("throws insufficient funds when total is too small even for SPLIT", () => {
      // 2×10M = 20M total; vaults 45M+45M requires ~90M
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
  // SPLIT strategy — triggered when UTXOs cannot be partitioned between vaults
  // ═══════════════════════════════════════════════════════════════════════════

  describe("SPLIT strategy (UTXOs cannot be partitioned between vaults)", () => {
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

    it("SPLIT: allocations have utxos=[] (pegin uses split tx output, not wallet UTXOs)", () => {
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      for (const alloc of plan.vaultAllocations) {
        expect(alloc.utxos).toEqual([]);
      }
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

    it("split outputs include 1-input pegin fee buffer: output.amount = vaultAmount + peginFee(1)", () => {
      // peginFee(1 input, feeRate=5) = 775 sats (not 5-input fee)
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.splitTransaction?.outputs[0]?.amount).toBe(
        47_500_000n + PEGIN_FEE_1_INPUT_5,
      );
      expect(plan.splitTransaction?.outputs[1]?.amount).toBe(
        47_500_000n + PEGIN_FEE_1_INPUT_5,
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
      const vaultOutputTotal = (47_500_000n + PEGIN_FEE_1_INPUT_5) * 2n;
      const expectedChange =
        100_000_000n - vaultOutputTotal - SPLIT_FEE_1_INPUT_5;
      expect(outputs[2]?.amount).toBe(expectedChange);
      expect(outputs[2]?.address).toBe(CHANGE_ADDRESS);
    });

    it("omits change output when change is at or below dust threshold (546 sats)", () => {
      // vaultOutputsTotal = (45M+775)*2 = 90_001_550; splitFee=990
      // totalNeeded = 90_002_540; for change=546: input = 90_003_086
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

    it("scenario 2: 0.8+0.6 BTC UTXOs → 1.3 BTC pegin uses SPLIT (vault 1 underfunded)", () => {
      // Vault 0 (65M): 80M ≥ 65M+775 → allocated [80M]
      // Vault 1 (65M): remaining [60M]. 60M < 65M+775 → MULTI_INPUT fails → SPLIT
      // SPLIT: vaultOutputsTotal=(65M+775)*2=130_001_550
      //   after 1st UTXO (80M): splitFee(1,3,5)=990; needed=130_002_540 > 80M → add 2nd
      //   after 2nd UTXO (140M): splitFee(2,3,5)=1280; needed=130_002_830 ≤ 140M ✓
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

    it("scenario 2: split tx called with both UTXOs as inputs", () => {
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

    it("scenario 2: change uses 2-input split fee (1280), not 1-input fee (990)", () => {
      const utxos = [makeUtxo(80_000_000, 0), makeUtxo(60_000_000, 1)];
      const plan = planUtxoAllocation(
        utxos,
        [65_000_000n, 65_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const vaultOutputsTotal = (65_000_000n + PEGIN_FEE_1_INPUT_5) * 2n; // 130_001_550
      const expectedChange =
        140_000_000n - vaultOutputsTotal - SPLIT_FEE_2_INPUTS_5;
      // 140M - 130_001_550 - 1280 = 8_997_170
      const changeOutput = plan.splitTransaction?.outputs[2];
      expect(changeOutput?.amount).toBe(expectedChange);
    });

    it("SPLIT: inputs list is stored in the split transaction", () => {
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
      expect(plan.splitTransaction?.outputs[0]?.amount).toBe(
        30_000_000n + PEGIN_FEE_1_INPUT_5,
      );
      expect(plan.splitTransaction?.outputs[1]?.amount).toBe(
        60_000_000n + PEGIN_FEE_1_INPUT_5,
      );
    });

    it("SPLIT: split tx inputs are ordered largest-first", () => {
      // 2 UTXOs: [41M, 50M] (unsorted); vaults: 45M+45M
      // MULTI_INPUT: vault 0 takes [50M] (50M ≥ 45M+775 ✓). Vault 1: only [41M] left.
      //   41M < 45M+775=45,000,775 → MULTI_INPUT fails → falls through to SPLIT.
      // SPLIT: selects [50M, 41M] (sorted largest-first). Total=91M ≥ totalNeeded ✓.
      //   Inputs passed to createSplitTransaction = [50M, 41M].
      const utxos = [makeUtxo(41_000_000, 0), makeUtxo(50_000_000, 1)];
      planUtxoAllocation(
        utxos,
        [45_000_000n, 45_000_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      const [calledInputs] = mockCreateSplitTransaction.mock.calls[0] ?? [];
      const values = (calledInputs as UTXO[]).map((u) => u.value);
      expect(values).toEqual([50_000_000, 41_000_000]);
    });

    it("9×0.1 BTC UTXOs are insufficient for a 0.9 BTC pegin (both MULTI_INPUT and SPLIT fail)", () => {
      // MULTI_INPUT: vault 0 needs 5 UTXOs (50M ≥ 45M+1935). Vault 1: only 4 left (40M < 45M+...) → fails
      // SPLIT: 9×10M=90M; vaultOutputsTotal=90_001_550; splitFee(9,3,5)=3310; totalNeeded=90_004_860 > 90M → fails
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
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("MULTI_INPUT pegin fee for 5 inputs is larger than for 1 input", () => {
      expect(PEGIN_FEE_5_INPUTS_5).toBeGreaterThan(PEGIN_FEE_1_INPUT_5);
      expect(PEGIN_FEE_2_INPUTS_5).toBeGreaterThan(PEGIN_FEE_1_INPUT_5);
    });

    it("SPLIT: vault output uses 1-input pegin fee buffer (not multi-input)", () => {
      // With 1 UTXO → SPLIT. The vault output buffer must use 1-input peginFee (775),
      // not the multi-input peginFee (1935), because split outputs are 1-input pegins.
      const plan = planUtxoAllocation(
        [makeUtxo(100_000_000)],
        [47_500_000n, 47_500_000n],
        FEE_RATE,
        CHANGE_ADDRESS,
      );

      expect(plan.splitTransaction?.outputs[0]?.amount).toBe(
        47_500_000n + PEGIN_FEE_1_INPUT_5,
      );
    });
  });
});
