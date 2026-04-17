/**
 * Tests for useUTXOs hook
 *
 * Covers the split between non-blocking display (`availableUTXOs`) and
 * fail-closed spend paths (`spendableUTXOs` / `spendableMempoolUTXOs`) when
 * the ordinals classifier is loading or unavailable.
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

    it("should fail closed on spendable UTXOs when ordinals API fails and inscriptions are excluded", () => {
      // Setup: UTXOs loaded successfully
      mockUseQuery.mockReturnValue({
        data: confirmedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      // Setup: Ordinals API returns error
      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: new Error("Ordinals API returned 500"),
        refetch: vi.fn(),
      });

      mockLoggerWarn.mockClear();

      const { result } = renderHook(() => useUTXOs(testAddress));

      // Display collections stay non-blocking so the UI can render totals.
      expect(result.current.availableUTXOs).toHaveLength(3);
      expect(result.current.inscriptionUTXOs).toHaveLength(0);
      // Spend collections fail closed so callers cannot consume unclassified UTXOs.
      expect(result.current.spendableUTXOs).toHaveLength(0);
      expect(result.current.spendableMempoolUTXOs).toHaveLength(0);
      expect(result.current.spendableBlockedByOrdinals).toBe(true);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Ordinals API failed, treating all UTXOs as available",
        expect.objectContaining({
          data: { error: "Ordinals API returned 500" },
        }),
      );
    });

    it("should fail closed on spendable UTXOs while ordinals API is loading and inscriptions are excluded", () => {
      // Setup: UTXOs loaded successfully
      mockUseQuery.mockReturnValue({
        data: confirmedUtxos,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      // Setup: Ordinals API is still loading
      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUTXOs(testAddress));

      // Display collections stay non-blocking.
      expect(result.current.availableUTXOs).toHaveLength(3);
      expect(result.current.inscriptionUTXOs).toHaveLength(0);
      // Spend collections fail closed until classification completes.
      expect(result.current.spendableUTXOs).toHaveLength(0);
      expect(result.current.spendableMempoolUTXOs).toHaveLength(0);
      expect(result.current.spendableBlockedByOrdinals).toBe(true);

      // Loading flag should be exposed for UI
      expect(result.current.isLoadingOrdinals).toBe(true);
    });

    it("should remain non-blocking on spendable UTXOs when the user has opted in to inscriptions", () => {
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

      expect(result.current.spendableUTXOs).toHaveLength(3);
      expect(result.current.spendableMempoolUTXOs).toHaveLength(3);
      expect(result.current.spendableBlockedByOrdinals).toBe(false);
    });

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
      expect(result.current.availableUTXOs).toHaveLength(2);
      expect(result.current.inscriptionUTXOs).toHaveLength(1);
      expect(result.current.inscriptionUTXOs[0].txid).toBe("txid2");
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

    it("should expose ordinalsError for UI to handle", () => {
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
      // UTXOs should still be available despite error
      expect(result.current.availableUTXOs).toHaveLength(1);
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
  });
});
