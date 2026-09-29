/**
 * Tests for useActivities: the reserve map it hands the activity service must
 * cover every loan reserve, so a past borrow or repay on a reserve that has
 * since been frozen still renders its token, decimals and hub.
 */

import { renderHook } from "@testing-library/react";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { AaveReserveConfig } from "../../applications/aave/services/fetchConfig";
import type { FetchUserActivitiesDeps } from "../../services/activity";
import { useActivities } from "../useActivities";

const useAaveConfigMock = vi.fn();
const fetchUserActivitiesMock = vi.fn();

vi.mock("../../applications/aave/context", () => ({
  useAaveConfig: () => useAaveConfigMock(),
}));

vi.mock("../../services/activity", () => ({
  ACTIVITIES_QUERY_KEY: "activities",
  fetchUserActivities: (address: Address, deps: FetchUserActivitiesDeps) =>
    fetchUserActivitiesMock(address, deps),
}));

// Run the query function during render so the deps it closes over can be read.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    queryFn();
    return {};
  },
}));

const USER = "0xabc0000000000000000000000000000000000001" as Address;
/** Vault Devnet Babylon Hub, a registered hub. */
const BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as Address;
const USDT = "0x3333333333333333333333333333333333333333" as Address;

const frozenUsdt: AaveReserveConfig = {
  reserveId: 1n,
  reserve: {
    underlying: USDT,
    hub: BABYLON_HUB,
    assetId: 1,
    decimals: 6,
    dynamicConfigKey: 0,
    paused: false,
    frozen: true,
    borrowable: true,
    collateralRisk: 0,
    collateralFactor: 0,
  },
  token: { address: USDT, symbol: "USDT", name: "Tether USD", decimals: 6 },
};

describe("useActivities", () => {
  it("maps a frozen reserve so its past borrows and repays keep their token, decimals and hub", () => {
    useAaveConfigMock.mockReturnValue({
      allBorrowReserves: [frozenUsdt],
      borrowableReserves: [],
      vbtcReserve: null,
    });

    renderHook(() => useActivities(USER));

    const deps = fetchUserActivitiesMock.mock.calls[0][1];
    expect(deps.reserves.get("1")).toMatchObject({
      symbol: "USDT",
      decimals: 6,
      hubLabel: "Babylon Hub",
    });
  });

  it("maps the vBTC reserve alongside the loan reserves", () => {
    const VBTC = "0x4444444444444444444444444444444444444444" as Address;
    useAaveConfigMock.mockReturnValue({
      allBorrowReserves: [frozenUsdt],
      borrowableReserves: [],
      vbtcReserve: {
        reserveId: 3n,
        reserve: { ...frozenUsdt.reserve, underlying: VBTC, decimals: 8 },
        token: {
          address: VBTC,
          symbol: "vBTC",
          name: "vault BTC",
          decimals: 8,
        },
      },
    });

    renderHook(() => useActivities(USER));

    const deps = fetchUserActivitiesMock.mock.lastCall![1];
    expect(deps.reserves.get("3")).toMatchObject({
      symbol: "vBTC",
      decimals: 8,
      hubLabel: "Babylon Hub",
    });
    expect(deps.reserves.get("1")).toMatchObject({ symbol: "USDT" });
  });
});
