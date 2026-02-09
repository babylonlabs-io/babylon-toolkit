/**
 * Tests for useUTXOs hook
 *
 * Focuses on non-blocking ordinals behavior:
 * - When ordinals API fails, all confirmed UTXOs should be available
 * - When ordinals API is loading, all confirmed UTXOs should be available
 */

import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  });

  describe("non-blocking ordinals behavior", () => {
    const confirmedUtxos: MempoolUTXO[] = [
      createMempoolUtxo("txid1", 0, 100000),
      createMempoolUtxo("txid2", 1, 200000),
      createMempoolUtxo("txid3", 2, 300000),
    ];

    it("should treat all confirmed UTXOs as available when ordinals API fails", () => {
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

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { result } = renderHook(() => useUTXOs(testAddress));

      // All confirmed UTXOs should be available
      expect(result.current.availableUTXOs).toHaveLength(3);
      expect(result.current.inscriptionUTXOs).toHaveLength(0);
      expect(result.current.spendableUTXOs).toHaveLength(3);
      expect(result.current.spendableMempoolUTXOs).toHaveLength(3);

      // Should log warning about ordinals failure
      expect(consoleSpy).toHaveBeenCalledWith(
        "Ordinals API failed, treating all UTXOs as available:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should treat all confirmed UTXOs as available when ordinals API is loading", () => {
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

      // All confirmed UTXOs should be available while ordinals is loading
      expect(result.current.availableUTXOs).toHaveLength(3);
      expect(result.current.inscriptionUTXOs).toHaveLength(0);
      expect(result.current.spendableUTXOs).toHaveLength(3);
      expect(result.current.spendableMempoolUTXOs).toHaveLength(3);

      // Loading flag should be exposed for UI
      expect(result.current.isLoadingOrdinals).toBe(true);
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
