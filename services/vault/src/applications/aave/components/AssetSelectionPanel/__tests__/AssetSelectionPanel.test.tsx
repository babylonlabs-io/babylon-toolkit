/**
 * AssetSelectionPanel — Select asset shows one card per borrowable token,
 * however many hubs list it, labelled from the token registry.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BABYLON_HUB, CORE_HUB, USDC, WBTC } from "@/test/deploymentAddresses";

import type { AaveReserveConfig } from "../../../services/fetchConfig";
import { AssetSelectionPanel } from "../AssetSelectionPanel";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const config = vi.hoisted(() => ({
  borrowableReserves: [] as unknown[],
}));

vi.mock("../../../context", () => ({
  useAaveConfig: () => config,
}));

function reserve(
  reserveId: bigint,
  underlying: Address,
  hub: Address,
  indexerSymbol: string,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: { underlying, hub },
    token: { address: underlying, symbol: indexerSymbol, name: indexerSymbol },
  } as unknown as AaveReserveConfig;
}

const NO_CAP = {
  limit: null,
  borrowCount: 0n,
  borrowedReserveIds: new Set<bigint>(),
};

describe("AssetSelectionPanel", () => {
  beforeEach(() => {
    config.borrowableReserves = [];
  });

  it("shows one card per token even when the token is listed on two hubs", () => {
    config.borrowableReserves = [
      reserve(0n, USDC, BABYLON_HUB, "USDC"),
      reserve(2n, WBTC, BABYLON_HUB, "WBTC"),
      reserve(4n, USDC, CORE_HUB, "USDC"),
    ];

    render(<AssetSelectionPanel onSelectAsset={vi.fn()} borrowGate={NO_CAP} />);

    expect(screen.getByText("Select asset")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(
      screen.getByTestId(`asset-select-row-${USDC.toLowerCase()}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`asset-select-row-${WBTC.toLowerCase()}`),
    ).toBeInTheDocument();
  });

  it("labels a card from the token registry rather than the indexer symbol", () => {
    config.borrowableReserves = [reserve(0n, USDC, BABYLON_HUB, "FAKE")];

    render(<AssetSelectionPanel onSelectAsset={vi.fn()} borrowGate={NO_CAP} />);

    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.queryByText("FAKE")).not.toBeInTheDocument();
  });

  it("reports the card's underlying address when clicked", () => {
    config.borrowableReserves = [
      reserve(0n, USDC, BABYLON_HUB, "USDC"),
      reserve(4n, USDC, CORE_HUB, "USDC"),
    ];
    const onSelectAsset = vi.fn();

    render(
      <AssetSelectionPanel onSelectAsset={onSelectAsset} borrowGate={NO_CAP} />,
    );
    fireEvent.click(
      screen.getByTestId(`asset-select-row-${USDC.toLowerCase()}`),
    );

    expect(onSelectAsset).toHaveBeenCalledWith(USDC);
  });

  it("shows the empty copy when nothing is borrowable", () => {
    render(<AssetSelectionPanel onSelectAsset={vi.fn()} borrowGate={NO_CAP} />);

    expect(
      screen.getByText("No borrowable assets available"),
    ).toBeInTheDocument();
  });
});
