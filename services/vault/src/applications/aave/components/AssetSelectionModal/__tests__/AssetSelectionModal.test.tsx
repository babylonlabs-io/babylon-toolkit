/**
 * Tests for AssetSelectionModal — audit #234 regression.
 *
 * The borrow- and repay-mode selection modal must emit the on-chain
 * `reserveId` of the clicked row, not the row's `token.symbol`.
 * Otherwise two reserves sharing a symbol can collapse to the same
 * downstream selection at the borrow/repay tx site.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";

import { LOAN_TAB } from "../../../constants";
import type { AaveReserveConfig } from "../../../services/fetchConfig";
import type { Asset } from "../../../types";
import { AssetSelectionModal } from "../AssetSelectionModal";

const mockUseAaveConfig = vi.fn();
vi.mock("../../../context", () => ({
  useAaveConfig: () => mockUseAaveConfig(),
}));

const mockUsePrices = vi.fn(() => ({
  prices: {} as Record<string, number>,
  metadata: {},
  isLoading: false,
  error: null,
  hasStalePrices: false,
  hasPriceFetchError: false,
}));
vi.mock("@/hooks", () => ({
  usePrices: () => mockUsePrices(),
}));

vi.mock("@/services/token/tokenService", () => ({
  getTokenByAddress: vi.fn(() => undefined),
  getCurrencyIconWithFallback: vi.fn(
    (icon: string | undefined, symbol: string) => icon ?? `fallback:${symbol}`,
  ),
}));

const RESERVE_BRIDGED_USDC = {
  reserveId: 7n,
  reserve: { collateralFactor: 0 },
  token: {
    symbol: "USDC",
    name: "Bridged USD Coin",
    decimals: 6,
    address: "0xBridgedUSDC" as Address,
  },
} as unknown as AaveReserveConfig;

const RESERVE_NATIVE_USDC = {
  reserveId: 9n,
  reserve: { collateralFactor: 0 },
  token: {
    symbol: "USDC",
    name: "Native USD Coin",
    decimals: 6,
    address: "0xNativeUSDC" as Address,
  },
} as unknown as AaveReserveConfig;

describe("AssetSelectionModal — borrow mode (default reserve list)", () => {
  it("emits the clicked row's reserveId, not its token symbol, when symbols collide", () => {
    mockUseAaveConfig.mockReturnValue({
      borrowableReserves: [RESERVE_BRIDGED_USDC, RESERVE_NATIVE_USDC],
    });
    const onSelectAsset = vi.fn();
    const onClose = vi.fn();

    render(
      <AssetSelectionModal
        isOpen
        onClose={onClose}
        onSelectAsset={onSelectAsset}
        mode={LOAN_TAB.BORROW}
      />,
    );

    fireEvent.click(screen.getByText("Native USD Coin"));

    expect(onSelectAsset).toHaveBeenCalledTimes(1);
    expect(onSelectAsset).toHaveBeenCalledWith("9");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AssetSelectionModal — repay mode (caller-supplied assets)", () => {
  it("emits the clicked asset's reserveId from the supplied list", () => {
    mockUseAaveConfig.mockReturnValue({ borrowableReserves: [] });
    const assets: Asset[] = [
      {
        reserveId: "7",
        symbol: "USDC",
        name: "Bridged USD Coin",
        icon: "bridged.svg",
      },
      {
        reserveId: "9",
        symbol: "USDC",
        name: "Native USD Coin",
        icon: "native.svg",
      },
    ];
    const onSelectAsset = vi.fn();

    render(
      <AssetSelectionModal
        isOpen
        onClose={vi.fn()}
        onSelectAsset={onSelectAsset}
        mode={LOAN_TAB.REPAY}
        assets={assets}
      />,
    );

    fireEvent.click(screen.getByText("Native USD Coin"));

    expect(onSelectAsset).toHaveBeenCalledWith("9");
  });
});
