/**
 * Tests for useUTXOs hook
 */

import { getAddressUtxos } from "@babylonlabs-io/ts-sdk";
import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppState } from "../../state/AppState";
import { useOrdinals } from "../useOrdinals";
import {
  FUNDING_ADDRESSES_QUERY_KEY,
  SINGLE_ADDRESS_LISTING_KEY,
  UTXOS_QUERY_KEY,
  useUTXOs,
} from "../useUTXOs";

// Mock ts-sdk to avoid ecc library initialization
vi.mock("@babylonlabs-io/ts-sdk", () => ({
  getAddressUtxos: vi.fn(),
}));

// The capability probe is the SDK's `typeof getFundingAddresses === "function"`;
// restated here so the barrel (and its ecc initialisation) stays out of the test.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  supportsMultiAddressFunding: (wallet: { getFundingAddresses?: unknown }) =>
    typeof wallet.getFundingAddresses === "function",
}));

const { mockCollectFundingUtxos } = vi.hoisted(() => ({
  mockCollectFundingUtxos: vi.fn(),
}));
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", () => ({
  collectFundingUtxos: mockCollectFundingUtxos,
}));

vi.mock("@/config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "signet"),
}));

// Mock wallet-connector. No connected wallet by default: the single-address
// path, which every test below this file's multi-address section exercises.
const { mockUseChainConnector } = vi.hoisted(() => ({
  mockUseChainConnector: vi.fn(() => null),
}));
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: mockUseChainConnector,
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
    mockUseChainConnector.mockReturnValue(null);
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
    });
  });

  describe("multi-address funding", () => {
    const receiveAddress = "tb1preceive";
    const changeAddress = "tb1pchange";
    const fundingAddresses = [
      {
        address: receiveAddress,
        internalPubkeyHex: "aa".repeat(32),
        branch: 0,
        addressIndex: 0,
      },
      {
        address: changeAddress,
        internalPubkeyHex: "bb".repeat(32),
        branch: 1,
        addressIndex: 0,
      },
    ];
    const idleQuery = {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };

    function connectWallet(provider: object) {
      mockUseChainConnector.mockReturnValue({
        connectedWallet: { provider },
      } as never);
    }

    /** Route the mocked `useQuery` by the key's first element. */
    function answerQueries(
      funding: Record<string, unknown>,
      utxos: Record<string, unknown>,
    ) {
      mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
        options.queryKey[0] === FUNDING_ADDRESSES_QUERY_KEY ? funding : utxos,
      );
    }

    function optionsFor(key: string) {
      const call = mockUseQuery.mock.calls.find(
        ([options]) => options.queryKey[0] === key,
      );
      if (!call) throw new Error(`useQuery was not called for ${key}`);
      return call[0];
    }

    beforeEach(() => {
      mockUseOrdinals.mockReturnValue({
        inscriptions: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("reads the wallet's address set once per connection and lists nothing until it arrives", async () => {
      const getFundingAddresses = vi.fn().mockResolvedValue(fundingAddresses);
      connectWallet({ getFundingAddresses });
      answerQueries({ ...idleQuery, isLoading: true }, idleQuery);

      const { result } = renderHook(() => useUTXOs(receiveAddress));

      const addressOptions = optionsFor(FUNDING_ADDRESSES_QUERY_KEY);
      expect(addressOptions.queryKey).toEqual([
        FUNDING_ADDRESSES_QUERY_KEY,
        receiveAddress,
      ]);
      expect(addressOptions.enabled).toBe(true);
      expect(addressOptions.staleTime).toBe(Infinity);
      // The query reads the set from the wallet itself, nothing else.
      await expect(addressOptions.queryFn()).resolves.toBe(fundingAddresses);
      expect(getFundingAddresses).toHaveBeenCalledTimes(1);

      expect(optionsFor(UTXOS_QUERY_KEY).enabled).toBe(false);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.spendableUTXOs).toEqual([]);
    });

    it("refuses to list the connected address alone while the address set is pending, even when refetched", async () => {
      connectWallet({ getFundingAddresses: vi.fn() });
      answerQueries({ ...idleQuery, isLoading: true }, idleQuery);

      renderHook(() => useUTXOs(receiveAddress));

      // `refetch()` runs the query function regardless of `enabled`.
      await expect(optionsFor(UTXOS_QUERY_KEY).queryFn()).rejects.toThrow(
        "Cannot list UTXOs before the wallet's funding-address set is read",
      );
      expect(getAddressUtxos).not.toHaveBeenCalled();
      expect(mockCollectFundingUtxos).not.toHaveBeenCalled();
    });

    it("lists every funding address and keeps each UTXO's owning key on the spendable set", async () => {
      connectWallet({ getFundingAddresses: vi.fn() });
      const changeUtxo = {
        ...createMempoolUtxo("changetx", 1, 70000),
        internalPubkeyHex: "bb".repeat(32),
        address: changeAddress,
      };
      mockCollectFundingUtxos.mockResolvedValue([changeUtxo]);
      answerQueries(
        { ...idleQuery, data: fundingAddresses },
        { ...idleQuery, data: [changeUtxo] },
      );

      const { result } = renderHook(() => useUTXOs(receiveAddress));

      const utxoOptions = optionsFor(UTXOS_QUERY_KEY);
      expect(utxoOptions.queryKey).toEqual([
        UTXOS_QUERY_KEY,
        receiveAddress,
        [receiveAddress, changeAddress],
      ]);
      expect(utxoOptions.enabled).toBe(true);

      await expect(utxoOptions.queryFn()).resolves.toEqual([changeUtxo]);
      expect(mockCollectFundingUtxos).toHaveBeenCalledWith({
        addresses: fundingAddresses,
        network: "signet",
        listAddressUtxos: expect.any(Function),
      });
      const { listAddressUtxos } = mockCollectFundingUtxos.mock.calls[0][0];
      listAddressUtxos(changeAddress);
      expect(getAddressUtxos).toHaveBeenCalledWith(
        changeAddress,
        "https://mempool.test/api",
      );

      expect(result.current.spendableUTXOs).toEqual([
        {
          txid: "changetx",
          vout: 1,
          value: 70000,
          scriptPubKey: "0014abcd1234",
          internalPubkeyHex: "bb".repeat(32),
        },
      ]);
    });

    it("surfaces a failed address read as the hook's error", () => {
      connectWallet({ getFundingAddresses: vi.fn() });
      const deviceError = new Error("device busy");
      answerQueries({ ...idleQuery, error: deviceError }, idleQuery);

      const { result } = renderHook(() => useUTXOs(receiveAddress));

      expect(result.current.error).toBe(deviceError);
      expect(optionsFor(UTXOS_QUERY_KEY).enabled).toBe(false);
    });

    it("lists only the connected address for a wallet that cannot enumerate its addresses", async () => {
      connectWallet({ signPsbt: vi.fn() });
      answerQueries(idleQuery, { ...idleQuery, data: [] });

      renderHook(() => useUTXOs(receiveAddress));

      expect(optionsFor(FUNDING_ADDRESSES_QUERY_KEY).enabled).toBe(false);
      const utxoOptions = optionsFor(UTXOS_QUERY_KEY);
      expect(utxoOptions.queryKey[2]).toBe(SINGLE_ADDRESS_LISTING_KEY);
      await utxoOptions.queryFn();
      expect(getAddressUtxos).toHaveBeenCalledWith(
        receiveAddress,
        "https://mempool.test/api",
      );
      expect(mockCollectFundingUtxos).not.toHaveBeenCalled();
    });
  });
});
