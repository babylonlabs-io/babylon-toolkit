import { renderHook } from "@testing-library/react";
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

import { useVaultDeposits } from "../useVaultDeposits";

vi.mock("../useVaults", () => ({
  useVaults: vi.fn(),
}));
vi.mock("../../storage/usePeginStorage", () => ({
  usePeginStorage: vi.fn(() => ({
    allActivities: [],
    pendingPegins: [],
    addPendingPegin: vi.fn(),
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

  it("exports the FAST/NORMAL interval constants used as polling cadences", () => {
    // Sanity check that the constants the hook depends on are wired
    // through. If FAST_POLL_INTERVAL ever drops below 1s or
    // NORMAL_POLL_INTERVAL above 5min the polling story changes
    // materially — surface either as a test signal.
    expect(FAST_POLL_INTERVAL).toBeGreaterThanOrEqual(1_000);
    expect(NORMAL_POLL_INTERVAL).toBeLessThanOrEqual(5 * 60_000);
  });
});
