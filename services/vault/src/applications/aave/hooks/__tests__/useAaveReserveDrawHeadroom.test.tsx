import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveHub", () => ({
  UNLIMITED_SPOKE_CAP: 2 ** 40 - 1,
  getSpokeDrawUsagesSafe: vi.fn(),
}));

const config = vi.hoisted(() => ({
  config: {
    coreSpokeAddress: "0x0000000000000000000000000000000000000005",
  } as {
    coreSpokeAddress: string;
  } | null,
}));
vi.mock("../../context", () => ({ useAaveConfig: () => config }));

import { getSpokeDrawUsagesSafe } from "../../clients/aaveHub";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useAaveReserveDrawHeadroom } from "../useAaveReserveDrawHeadroom";

const HUB = "0x0000000000000000000000000000000000000003" as const;
const SPOKE = "0x0000000000000000000000000000000000000005";

function makeReserve(reserveId: bigint, assetId: number): AaveReserveConfig {
  return {
    reserveId,
    reserve: { hub: HUB, assetId, decimals: 6 },
    token: { symbol: "USDC", decimals: 6 },
  } as unknown as AaveReserveConfig;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAaveReserveDrawHeadroom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.config = { coreSpokeAddress: SPOKE };
  });

  it("reads each reserve's hub asset against our spoke and keys the headroom by reserve id", async () => {
    vi.mocked(getSpokeDrawUsagesSafe).mockResolvedValueOnce([
      // Cap 1,000 USDC with 400 USDC counted against it → 600 left.
      { drawCap: 1_000, usedRaw: 400_000_000n },
      // No cap.
      { drawCap: 2 ** 40 - 1, usedRaw: 0n },
    ]);
    const reserves = [makeReserve(4n, 2), makeReserve(5n, 3)];

    const { result } = renderHook(
      () => useAaveReserveDrawHeadroom({ reserves }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.headroomByReserveId).toEqual({
        "4": 600,
        "5": null,
      }),
    );
    expect(getSpokeDrawUsagesSafe).toHaveBeenCalledWith(SPOKE, [
      { hub: HUB, assetId: 2 },
      { hub: HUB, assetId: 3 },
    ]);
  });

  it("returns null for a reserve whose read failed", async () => {
    vi.mocked(getSpokeDrawUsagesSafe).mockResolvedValueOnce([null]);
    const reserves = [makeReserve(4n, 2)];

    const { result } = renderHook(
      () => useAaveReserveDrawHeadroom({ reserves }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.headroomByReserveId).toEqual({ "4": null }),
    );
  });

  it("does not read before the Core Spoke address is known", () => {
    config.config = null;
    const reserves = [makeReserve(4n, 2)];

    const { result } = renderHook(
      () => useAaveReserveDrawHeadroom({ reserves }),
      { wrapper },
    );

    expect(result.current.headroomByReserveId).toEqual({});
    expect(getSpokeDrawUsagesSafe).not.toHaveBeenCalled();
  });
});
