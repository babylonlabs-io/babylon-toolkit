import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveHub", () => ({
  getHubSpokeConfigsSafe: vi.fn(),
}));

const HALTED = { drawCap: 1_000, active: true, halted: true };
const INACTIVE = { drawCap: 1_000, active: false, halted: false };
const USABLE = { drawCap: 1_000, active: true, halted: false };

const config = vi.hoisted(() => ({
  config: { coreSpokeAddress: "0x0000000000000000000000000000000000000005" },
  hubSpokeConfigs: {} as Record<string, unknown>,
}));
vi.mock("../../context", () => ({ useAaveConfig: () => config }));

import { getHubSpokeConfigsSafe } from "../../clients/aaveHub";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useHubSpokeConfigs } from "../useHubSpokeConfigs";

const HUB = "0x0000000000000000000000000000000000000003" as const;

const reserve = {
  reserveId: 4n,
  reserve: { hub: HUB, assetId: 2 },
} as unknown as AaveReserveConfig;

// One client per test, created outside the wrapper so a rerender keeps its cache.
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useHubSpokeConfigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("replaces a halted state from config load with the live read once it lands", async () => {
    // Config load saw the hub halted; the hub has since lifted the halt.
    config.hubSpokeConfigs = { "4": HALTED };
    vi.mocked(getHubSpokeConfigsSafe).mockResolvedValueOnce([USABLE]);
    const reserves = [reserve];

    const { result } = renderHook(() => useHubSpokeConfigs(reserves), {
      wrapper,
    });

    expect(result.current).toEqual({ "4": HALTED });
    await waitFor(() => expect(result.current).toEqual({ "4": USABLE }));
  });

  it("keeps the last live result over the config-load copy while a new reserve set loads", async () => {
    // Config load saw reserve 4's hub halted (since lifted) and reserve 5's
    // hub inactive (not read live yet).
    config.hubSpokeConfigs = { "4": HALTED, "5": INACTIVE };
    vi.mocked(getHubSpokeConfigsSafe)
      .mockResolvedValueOnce([USABLE])
      // The second read (after the reserve set grows) never settles in this test.
      .mockReturnValueOnce(new Promise(() => {}));
    const debtReserve = {
      reserveId: 5n,
      reserve: { hub: HUB, assetId: 3 },
    } as unknown as AaveReserveConfig;
    const selectedOnly = [reserve];
    const withDebt = [reserve, debtReserve];

    const { result, rerender } = renderHook(
      ({ reserves }) => useHubSpokeConfigs(reserves),
      { wrapper, initialProps: { reserves: selectedOnly } },
    );
    await waitFor(() => expect(result.current).toEqual({ "4": USABLE }));

    rerender({ reserves: withDebt });

    // Reserve 4 keeps its live state; reserve 5, which that read did not
    // cover, keeps its config-load state instead of reading as usable.
    expect(result.current).toEqual({ "4": USABLE, "5": INACTIVE });
  });
});
