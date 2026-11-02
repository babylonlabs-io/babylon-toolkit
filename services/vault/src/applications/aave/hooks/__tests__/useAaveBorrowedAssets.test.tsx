import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allBorrowReserves: [] as unknown[],
  aprPercentByReserveId: {} as Record<string, number | null>,
}));

vi.mock("../../context", () => ({
  useAaveConfig: () => ({ allBorrowReserves: mocks.allBorrowReserves }),
}));

vi.mock("../useAaveBorrowAprs", () => ({
  useAaveBorrowAprs: () => ({
    aprPercentByReserveId: mocks.aprPercentByReserveId,
  }),
}));

vi.mock("../../clients/transaction", () => ({
  getInterestFeeBps: vi.fn(),
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => "0x00000000000000000000000000000000000000aa",
}));

import { getInterestFeeBps } from "../../clients/transaction";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import type {
  AavePositionWithLiveData,
  DebtPosition,
} from "../../services/positionService";
import { useAaveBorrowedAssets } from "../useAaveBorrowedAssets";

const USDC = "0x0000000000000000000000000000000000000010";
const WBTC = "0x0000000000000000000000000000000000000011";
const HUB = "0x0000000000000000000000000000000000000003";

function makeReserve(
  reserveId: bigint,
  underlying: `0x${string}`,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: { underlying, hub: HUB, assetId: Number(reserveId) },
    token: { address: underlying, symbol: "TKN", name: "Token", decimals: 6 },
  } as unknown as AaveReserveConfig;
}

function makeDebt(
  reserveId: bigint,
  drawnShares: bigint,
  premiumShares: bigint,
): [bigint, DebtPosition] {
  return [
    reserveId,
    { reserveId, drawnShares, premiumShares, totalDebt: 1_000_000n },
  ];
}

/**
 * `liveData` is the vBTC collateral reserve's read and `accountData.riskPremium`
 * is a live recompute; neither is what a loan is charged.
 */
function makePosition(
  debts: [bigint, DebtPosition][],
  { collateralPremiumShares = 0n, liveRiskPremium = 0n } = {},
): AavePositionWithLiveData {
  return {
    liveData: { premiumShares: collateralPremiumShares },
    accountData: { riskPremium: liveRiskPremium },
    debtPositions: new Map(debts),
  } as unknown as AavePositionWithLiveData;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderBorrowedAssets(position: AavePositionWithLiveData | null) {
  return renderHook(
    () => useAaveBorrowedAssets({ position, debtValueUsd: 100 }),
    { wrapper },
  );
}

function rateOf(
  result: { current: ReturnType<typeof useAaveBorrowedAssets> },
  reserveId: string,
) {
  return result.current.borrowedAssets.find(
    (asset) => asset.reserveId === reserveId,
  )?.borrowRate;
}

describe("useAaveBorrowedAssets borrow rate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInterestFeeBps).mockResolvedValue(300);
    mocks.allBorrowReserves = [makeReserve(1n, USDC), makeReserve(2n, WBTC)];
    mocks.aprPercentByReserveId = { "1": 5, "2": 5 };
  });

  it("prices each loan from its own debt reserve's shares", async () => {
    const { result } = renderBorrowedAssets(
      makePosition([
        makeDebt(1n, 1_000_000_000n, 100_000_000n),
        makeDebt(2n, 1_000_000_000n, 0n),
      ]),
    );

    await waitFor(() =>
      expect(result.current.borrowedAssets[0].borrowRate).toBeDefined(),
    );
    const rateByReserveId = Object.fromEntries(
      result.current.borrowedAssets.map((asset) => [
        asset.reserveId,
        asset.borrowRate,
      ]),
    );
    expect(rateByReserveId).toEqual({ "1": "5.65%", "2": "5.15%" });
  });

  it("charges a premium held in shares even when the account's live risk premium reads zero", async () => {
    const { result } = renderBorrowedAssets(
      makePosition([makeDebt(1n, 1_000_000_000n, 100_000_000n)], {
        liveRiskPremium: 0n,
      }),
    );

    await waitFor(() =>
      expect(result.current.borrowedAssets[0].borrowRate).toBe("5.65%"),
    );
  });

  it("ignores the collateral reserve's premium shares and the account's live risk premium", async () => {
    const { result } = renderBorrowedAssets(
      makePosition([makeDebt(1n, 1_000_000_000n, 0n)], {
        collateralPremiumShares: 500_000_000n,
        liveRiskPremium: 1000n,
      }),
    );

    await waitFor(() =>
      expect(result.current.borrowedAssets[0].borrowRate).toBe("5.15%"),
    );
  });

  it("leaves the rate undefined when the loan has no drawn shares", async () => {
    const { result } = renderBorrowedAssets(
      makePosition([makeDebt(1n, 0n, 5n), makeDebt(2n, 1_000_000_000n, 0n)]),
    );

    // The other loan's figure proves the fee has landed, and until it does every
    // rate is undefined whatever the zero-shares guard does.
    await waitFor(() => expect(rateOf(result, "2")).toBe("5.15%"));
    expect(rateOf(result, "1")).toBeUndefined();
  });

  it("leaves the rate undefined when the interest fee read fails", async () => {
    vi.mocked(getInterestFeeBps).mockRejectedValue(new Error("RPC failure"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const position = makePosition([makeDebt(1n, 1_000_000_000n, 0n)]);

    const { result } = renderHook(
      () => useAaveBorrowedAssets({ position, debtValueUsd: 100 }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() =>
      expect(client.getQueryState(["aaveInterestFeeBps"])?.status).toBe(
        "error",
      ),
    );
    expect(rateOf(result, "1")).toBeUndefined();
  });

  it("leaves the rate undefined when the base rate read fails", async () => {
    mocks.aprPercentByReserveId = { "1": null, "2": 5 };

    const { result } = renderBorrowedAssets(
      makePosition([
        makeDebt(1n, 1_000_000_000n, 0n),
        makeDebt(2n, 1_000_000_000n, 0n),
      ]),
    );

    await waitFor(() => expect(rateOf(result, "2")).toBe("5.15%"));
    expect(rateOf(result, "1")).toBeUndefined();
  });

  it("does not read the interest fee without debt", () => {
    const { result } = renderBorrowedAssets(null);

    expect(result.current.borrowedAssets).toEqual([]);
    expect(getInterestFeeBps).not.toHaveBeenCalled();
  });
});
