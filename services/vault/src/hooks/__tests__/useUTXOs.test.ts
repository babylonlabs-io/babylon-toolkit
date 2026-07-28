/**
 * Tests for useUTXOs hook
 */

import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppState } from "../../state/AppState";
import { useOrdinals } from "../useOrdinals";
import { useUTXOs } from "../useUTXOs";

// Mock ts-sdk to avoid ecc library initialization
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  getAddressUtxos: vi.fn(),
}));

// Mock wallet-connector
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  // Mirrors the package's real value; the spendable-set floor is keyed to it.
  LOW_VALUE_UTXO_THRESHOLD: 10_000,
  filterInscriptionUtxos: vi.fn((utxos, inscriptions) => {
    const inscriptionSet = new Set(
      inscriptions.map(
        (i: { txid: string; vout: number }) => `${i.txid}:${i.vout}`,
      ),
    );
    const availableUtxos = utxos.filter(
      (u: { txid: string; vout: number }) =>
        !inscriptionSet.has(`${u.txid}:${u.vout}`),
    );
    const inscriptionUtxos = utxos.filter((u: { txid: string; vout: number }) =>
      inscriptionSet.has(`${u.txid}:${u.vout}`),
    );
    return { availableUtxos, inscriptionUtxos };
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../useOrdinals", () => ({
  useOrdinals: vi.fn(),
}));

vi.mock("../../state/AppState", () => ({
  useAppState: vi.fn(() => ({ ordinalsExcluded: true })),
}));

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
}));
vi.mock("@/infrastructure", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));

vi.mock("../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test/api"),
}));

// Type for MempoolUTXO (avoid importing from ts-sdk)
interface MempoolUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  confirmed: boolean;
}

const mockUseQuery = useQuery as ReturnType<typeof vi.fn>;
const mockUseOrdinals = useOrdinals as ReturnType<typeof vi.fn>;
const mockUseAppState = useAppState as ReturnType<typeof vi.fn>;

// Helper to create mock MempoolUTXO
function createMempoolUtxo(
  txid: string,
  vout: number,
  value: number,
  confirmed = true,
): MempoolUTXO {
  return {
    txid,
    vout,
    value,
    scriptPubKey: "0014abcd1234",
    confirmed,
  };
}

describe("useUTXOs", () => {
  const testAddress = "bc1qtest123";

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppState.mockReturnValue({ ordinalsExcluded: true });
  });

  describe("ordinals classification gating", () => {
    const confirmedUtxos: MempoolUTXO[] = [
      createMempoolUtxo("txid1", 0, 100000),
      createMempoolUtxo("txid2", 1, 200000),
      createMempoolUtxo("txid3", 2, 300000),
    ];

    it("should filter inscription UTXOs when ordinals API succeeds", () => {
      // Setup: UTXOs loaded successfully
      mockUseQuery.mockReturnValue({
        data: confirmedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      // Setup: Ordinals API returns inscriptions for txid2
      mockUseOrdinals.mockReturnValue({
        inscriptions: [{ txid: "txid2", vout: 1, satRanges: [] }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      // txid2 should be filtered out as inscription
      expect(result.current.spendableUTXOs.map((u) => u.txid)).toEqual([
        "txid1",
        "txid3",
      ]);
      expect(result.current.spendableMempoolUTXOs.map((u) => u.txid)).toEqual([
        "txid1",
        "txid3",
      ]);
      expect(result.current.inscriptionUTXOs).toHaveLength(1);
      expect(result.current.inscriptionUTXOs[0].txid).toBe("txid2");
    });

    it("spends inscription UTXOs when the user opted into including them", () => {
      mockUseAppState.mockReturnValue({ ordinalsExcluded: false });
      mockUseQuery.mockReturnValue({
        data: confirmedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseOrdinals.mockReturnValue({
        inscriptions: [{ txid: "txid2", vout: 1, satRanges: [] }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.spendableUTXOs).toHaveLength(3);
    });

    it("flags a pending check regardless of the inscription preference", () => {
      // The preference is persisted, client-tamperable UI state — it must not
      // decide whether the pending-check gate is honored.
      mockUseAppState.mockReturnValue({ ordinalsExcluded: false });
      mockUseQuery.mockReturnValue({
        data: confirmedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.ordinalsCheckPending).toBe(true);
    });
  });

  describe("dust floor on the spendable set", () => {
    // A 546-sat inscription output, a sub-floor plain output, one exactly at
    // the threshold, and one above it.
    const mixedUtxos: MempoolUTXO[] = [
      createMempoolUtxo("inscription", 0, 546),
      createMempoolUtxo("smallPlain", 0, 5000),
      createMempoolUtxo("atThreshold", 0, 10000),
      createMempoolUtxo("largePlain", 0, 100000),
    ];

    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: mixedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("excludes UTXOs at or below the classifier's coverage floor", () => {
      mockUseOrdinals.mockReturnValue({
        inscriptions: [{ txid: "inscription", vout: 0, satRanges: [] }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.spendableUTXOs.map((u) => u.txid)).toEqual([
        "largePlain",
      ]);
      expect(result.current.spendableMempoolUTXOs.map((u) => u.txid)).toEqual([
        "largePlain",
      ]);
    });

    it("still excludes sub-floor UTXOs when the ordinals check fails", () => {
      // This is what keeps an unclassified 546-sat inscription out of a deposit.
      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: new Error("Network error"),
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.spendableUTXOs.map((u) => u.txid)).toEqual([
        "largePlain",
      ]);
      expect(result.current.spendableMempoolUTXOs.map((u) => u.txid)).toEqual([
        "largePlain",
      ]);
    });

    it("still excludes sub-floor UTXOs when the user opted into inscriptions", () => {
      mockUseAppState.mockReturnValue({ ordinalsExcluded: false });
      mockUseOrdinals.mockReturnValue({
        inscriptions: [{ txid: "inscription", vout: 0, satRanges: [] }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.spendableUTXOs.map((u) => u.txid)).toEqual([
        "largePlain",
      ]);
    });

    it("still reports a sub-floor inscription so the wallet toggle can show", () => {
      mockUseOrdinals.mockReturnValue({
        inscriptions: [{ txid: "inscription", vout: 0, satRanges: [] }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.inscriptionUTXOs.map((u) => u.txid)).toEqual([
        "inscription",
      ]);
    });
  });

  describe("loading states", () => {
    it("should return empty arrays when UTXOs are loading", () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.allUTXOs).toHaveLength(0);
      expect(result.current.confirmedUTXOs).toHaveLength(0);
    });

    it("keeps above-floor UTXOs spendable when the ordinals check fails, and flags it", () => {
      // Deliberate: a failed check degrades to a notice rather than blocking
      // deposits. Sub-floor UTXOs — where inscriptions live — stay excluded
      // (covered in the dust-floor suite).
      const testError = new Error("Network error");

      mockUseQuery.mockReturnValue({
        data: [createMempoolUtxo("txid1", 0, 100000)],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: testError,
        refetch: vi.fn(),
      });

      vi.spyOn(console, "warn").mockImplementation(() => {});

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.ordinalsError).toBe(testError);
      expect(result.current.inscriptionCheckFailed).toBe(true);
      expect(result.current.spendableUTXOs).toHaveLength(1);
    });

    it("does not flag a failed check when there is nothing to classify", () => {
      mockUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: new Error("Network error"),
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.inscriptionCheckFailed).toBe(false);
      expect(result.current.ordinalsCheckPending).toBe(false);
    });
  });

  describe("confirmed vs unconfirmed UTXOs", () => {
    it("should only include confirmed UTXOs in confirmedUTXOs", () => {
      const mixedUtxos: MempoolUTXO[] = [
        createMempoolUtxo("confirmed1", 0, 100000, true),
        createMempoolUtxo("unconfirmed1", 0, 200000, false),
        createMempoolUtxo("confirmed2", 1, 300000, true),
      ];

      mockUseQuery.mockReturnValue({
        data: mixedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.allUTXOs).toHaveLength(3);
      expect(result.current.confirmedUTXOs).toHaveLength(2);
      expect(result.current.confirmedUTXOs.every((u) => u.confirmed)).toBe(
        true,
      );
    });

    it("should sum unconfirmed UTXO values in unconfirmedBalance", () => {
      const mixedUtxos: MempoolUTXO[] = [
        createMempoolUtxo("confirmed1", 0, 100000, true),
        createMempoolUtxo("unconfirmed1", 0, 200000, false),
        createMempoolUtxo("unconfirmed2", 1, 50000, false),
      ];

      mockUseQuery.mockReturnValue({
        data: mixedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.unconfirmedBalance).toBe(250000n);
      expect(result.current.confirmedBalance).toBe(100000n);
    });

    it("should report zero unconfirmedBalance when all UTXOs are confirmed", () => {
      const confirmedOnly: MempoolUTXO[] = [
        createMempoolUtxo("confirmed1", 0, 100000, true),
        createMempoolUtxo("confirmed2", 1, 300000, true),
      ];

      mockUseQuery.mockReturnValue({
        data: confirmedOnly,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.unconfirmedBalance).toBe(0n);
      expect(result.current.confirmedBalance).toBe(400000n);
    });

    it("should report zero confirmedBalance when all UTXOs are unconfirmed", () => {
      const unconfirmedOnly: MempoolUTXO[] = [
        createMempoolUtxo("unconfirmed1", 0, 200000, false),
        createMempoolUtxo("unconfirmed2", 1, 50000, false),
      ];

      mockUseQuery.mockReturnValue({
        data: unconfirmedOnly,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      expect(result.current.confirmedBalance).toBe(0n);
      expect(result.current.unconfirmedBalance).toBe(250000n);
    });
  });
});
