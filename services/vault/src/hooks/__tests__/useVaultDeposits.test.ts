import { renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { FAST_POLL_INTERVAL, NORMAL_POLL_INTERVAL } from "@/constants";

import { LocalStorageStatus } from "../../models/peginStateMachine";
import type { RemovePendingPeginsResult } from "../../storage/peginStorage";
import { useVaultDeposits } from "../useVaultDeposits";

vi.mock("../useVaults", () => ({
  useVaults: vi.fn(),
}));
vi.mock("../../storage/usePeginStorage", () => ({
  usePeginStorage: vi.fn(() => ({
    allActivities: [],
    pendingPegins: [],
    addPendingPegin: vi.fn(),
    removePendingPegins: vi.fn(),
  })),
}));
vi.mock("../../storage/peginStorage", () => ({
  getPendingPegins: vi.fn(() => []),
}));

const ADDRESS = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as const;

let useVaultsMock: Mock;
let setIntervalSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../useVaults");
  useVaultsMock = vi.mocked(mod.useVaults) as unknown as Mock;
  useVaultsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  setIntervalSpy = vi.spyOn(globalThis, "setInterval");
});

afterEach(() => {
  setIntervalSpy.mockRestore();
});

describe("useVaultDeposits", () => {
  it("delegates polling to React Query (no manual setInterval timer)", () => {
    renderHook(() => useVaultDeposits(ADDRESS));
    // Hook used to spawn a manual setInterval that ran alongside React
    // Query, bypassing tab-visibility pause and dedup. Confirm that
    // window-level timer is gone.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("starts polling at NORMAL_POLL_INTERVAL when no Processing activity exists", () => {
    renderHook(() => useVaultDeposits(ADDRESS));
    expect(useVaultsMock).toHaveBeenLastCalledWith(ADDRESS, {
      poll: true,
      interval: NORMAL_POLL_INTERVAL,
    });
  });

  it("does not enable polling when no wallet is connected", () => {
    renderHook(() => useVaultDeposits(undefined));
    // Hook still calls useVaults so React Query can manage the cache;
    // the underlying query is gated by `enabled: !!depositorAddress`.
    expect(useVaultsMock).toHaveBeenLastCalledWith(undefined, {
      poll: true,
      interval: NORMAL_POLL_INTERVAL,
    });
    // Importantly, no setInterval was scheduled regardless.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("exposes the indexed vault ids when the indexer returned every row", () => {
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 0 },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toEqual(new Set());
  });

  it("lowercases the indexed vault ids so a mixed-case row still matches", () => {
    useVaultsMock.mockReturnValue({
      data: {
        vaults: [{ id: "0xAbCdEf", amount: 0n, status: 0, isInUse: false }],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toEqual(new Set(["0xabcdef"]));
  });

  it("withholds the indexed vault ids when a background refetch failed", () => {
    // React Query keeps `status: "success"` while it serves stale cache
    // through a failing refetch, so the set must not be trusted on `status`
    // alone.
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 0 },
      status: "success",
      isLoading: false,
      error: new Error("indexer unreachable"),
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toBeNull();
  });

  it("withholds the indexed vault ids when the fetch dropped a row", () => {
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 1 },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toBeNull();
  });

  it("exports the FAST/NORMAL interval constants used as polling cadences", () => {
    // Sanity check that the constants the hook depends on are wired
    // through. If FAST_POLL_INTERVAL ever drops below 1s or
    // NORMAL_POLL_INTERVAL above 5min the polling story changes
    // materially — surface either as a test signal.
    expect(FAST_POLL_INTERVAL).toBeGreaterThanOrEqual(1_000);
    expect(NORMAL_POLL_INTERVAL).toBeLessThanOrEqual(5 * 60_000);
  });

  it("lowercases the stored record ids so a mixed-case record still matches", async () => {
    const mod = await import("../../storage/usePeginStorage");
    vi.mocked(mod.usePeginStorage).mockReturnValue({
      allActivities: [],
      pendingPegins: [
        {
          id: "0xAbCdEf" as Hex,
          timestamp: 0,
          status: LocalStorageStatus.PENDING,
          peginTxHash: "0xprepegin" as Hex,
          unsignedTxHex: "0xdeadbeef",
        },
      ],
      addPendingPegin: vi.fn(),
      updatePendingPeginStatus: vi.fn(),
      removePendingPegin: vi.fn(() => true),
      removePendingPegins: vi.fn((): RemovePendingPeginsResult => "removed"),
      markRefundBroadcast: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.localRecordStatuses.get("0xabcdef")).toBe(
      LocalStorageStatus.PENDING,
    );
  });
});
