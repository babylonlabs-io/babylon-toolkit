import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Component tests mock core-ui (its dist isn't built in the test run).
vi.mock("@babylonlabs-io/core-ui", () => ({
  Avatar: ({ alt }: { alt: string }) => <img alt={alt} />,
  Hint: () => null,
}));

import { COPY } from "@/copy";

import { CollateralInfoCard } from "../CollateralInfoCard";

describe("CollateralInfoCard", () => {
  it("renders the asset name, avatar alt text, and formatted collateral factor", () => {
    render(
      <CollateralInfoCard
        assetIcon="https://example.com/btc.png"
        assetName="Native BTC"
        collateralFactor="75%"
      />,
    );

    expect(screen.getByText("Native BTC")).toBeInTheDocument();
    expect(screen.getByAltText("Native BTC")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders the empty placeholder when collateral factor is unavailable", () => {
    render(
      <CollateralInfoCard
        assetIcon="https://example.com/btc.png"
        assetName="Native BTC"
        collateralFactor={COPY.common.emptyValue}
      />,
    );

    expect(screen.getByText(COPY.common.emptyValue)).toBeInTheDocument();
  });
});
