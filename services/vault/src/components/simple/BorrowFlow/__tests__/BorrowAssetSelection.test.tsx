/**
 * Tests for BorrowAssetSelection — audit #234 regression.
 *
 * The list rows must emit the on-chain `reserveId` (not `token.symbol`) so
 * two reserves sharing a symbol cannot collapse to the same selection at
 * the borrow tx site.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockUseBorrowAssetSelection = vi.fn();

vi.mock("../useBorrowAssetSelection", () => ({
  useBorrowAssetSelection: () => mockUseBorrowAssetSelection(),
}));

import { BorrowAssetSelection } from "../BorrowAssetSelection";

describe("BorrowAssetSelection", () => {
  it("calls onSelectAsset with the row's reserveId, not its token symbol", () => {
    const onSelectAsset = vi.fn();
    mockUseBorrowAssetSelection.mockReturnValue({
      isLoading: false,
      assets: [
        {
          reserveId: "7",
          symbol: "USDC",
          name: "Bridged USD Coin",
          icon: "bridged.svg",
          priceFormatted: "$1.00",
          rateFormatted: "5%",
        },
        {
          reserveId: "9",
          symbol: "USDC",
          name: "Native USD Coin",
          icon: "native.svg",
          priceFormatted: "$1.00",
          rateFormatted: "5%",
        },
      ],
    });

    render(<BorrowAssetSelection onSelectAsset={onSelectAsset} />);

    // The user clicks the second row (native USDC, reserveId 9).
    fireEvent.click(screen.getByText("Native USD Coin"));

    expect(onSelectAsset).toHaveBeenCalledTimes(1);
    expect(onSelectAsset).toHaveBeenCalledWith("9");
  });

  it("renders one row per reserve even when symbols collide", () => {
    mockUseBorrowAssetSelection.mockReturnValue({
      isLoading: false,
      assets: [
        {
          reserveId: "7",
          symbol: "USDC",
          name: "Bridged USD Coin",
          icon: "bridged.svg",
          priceFormatted: "$1.00",
          rateFormatted: "5%",
        },
        {
          reserveId: "9",
          symbol: "USDC",
          name: "Native USD Coin",
          icon: "native.svg",
          priceFormatted: "$1.00",
          rateFormatted: "5%",
        },
      ],
    });

    render(<BorrowAssetSelection onSelectAsset={vi.fn()} />);

    // React keys are by reserveId, so both rows must mount.
    expect(screen.getByText("Bridged USD Coin")).toBeTruthy();
    expect(screen.getByText("Native USD Coin")).toBeTruthy();
  });
});
