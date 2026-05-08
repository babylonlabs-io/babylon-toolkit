/**
 * Tests for useAaveBorrowedAssets — audit #234 regression.
 *
 * The hook must propagate the on-chain `reserveId` for each borrowed asset
 * so the dashboard repay flow can route by id rather than by token symbol.
 * Two debts that share `token.symbol` must surface as distinct entries.
 */

import { renderHook } from "@testing-library/react";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { AavePositionWithLiveData, DebtPosition } from "../../services";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useAaveBorrowedAssets } from "../useAaveBorrowedAssets";

const mockUseAaveConfig = vi.fn();
vi.mock("../../context", () => ({
  useAaveConfig: () => mockUseAaveConfig(),
}));

vi.mock("@/services/token/tokenService", () => ({
  getTokenByAddress: vi.fn(() => undefined),
  getCurrencyIconWithFallback: vi.fn(
    (icon: string | undefined, symbol: string) => icon ?? `fallback:${symbol}`,
  ),
}));

const RESERVE_BRIDGED_USDC = {
  reserveId: 7n,
  reserve: {},
  token: {
    symbol: "USDC",
    name: "Bridged USD Coin",
    decimals: 6,
    address: "0xBridgedUSDC" as Address,
  },
} as unknown as AaveReserveConfig;

const RESERVE_NATIVE_USDC = {
  reserveId: 9n,
  reserve: {},
  token: {
    symbol: "USDC",
    name: "Native USD Coin",
    decimals: 6,
    address: "0xNativeUSDC" as Address,
  },
} as unknown as AaveReserveConfig;

function makeDebt(amount: bigint): DebtPosition {
  return {
    totalDebt: amount,
  } as unknown as DebtPosition;
}

describe("useAaveBorrowedAssets", () => {
  it("returns one BorrowedAsset per debt reserve, each carrying its own reserveId, even when symbols collide", () => {
    mockUseAaveConfig.mockReturnValue({
      allBorrowReserves: [RESERVE_BRIDGED_USDC, RESERVE_NATIVE_USDC],
    });

    const debtPositions = new Map<bigint, DebtPosition>([
      [7n, makeDebt(1_000_000n)],
      [9n, makeDebt(2_000_000n)],
    ]);

    const position = {
      debtPositions,
    } as unknown as AavePositionWithLiveData;

    const { result } = renderHook(() =>
      useAaveBorrowedAssets({ position, debtValueUsd: 3 }),
    );

    expect(result.current.borrowedAssets).toHaveLength(2);
    const ids = result.current.borrowedAssets.map((a) => a.reserveId);
    expect(ids).toEqual(["7", "9"]);
    // Both rows share a symbol but must remain distinguishable downstream.
    expect(new Set(result.current.borrowedAssets.map((a) => a.symbol))).toEqual(
      new Set(["USDC"]),
    );
  });
});
