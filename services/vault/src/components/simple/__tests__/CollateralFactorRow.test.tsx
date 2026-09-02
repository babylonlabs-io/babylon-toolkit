import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

// The mock surfaces the tooltip text so it can be asserted against its row.
vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: ({ tooltip }: { tooltip?: string }) => <span>{tooltip}</span>,
  InfoIcon: () => null,
}));

import { CollateralFactorRow } from "../CollateralFactorRow";

describe("CollateralFactorRow", () => {
  it("renders nothing when collateralFactor is null", () => {
    const { container } = render(
      <CollateralFactorRow
        collateralFactor={null}
        amountBtc="1"
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows -- for max-to-borrow with the CF when amount is empty", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc=""
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(screen.getByText("Max to Borrow:")).toBeInTheDocument();
    expect(screen.getByText("(CF=72%)")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it("shows -- for max-to-borrow with the CF when amount is zero", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="0"
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(screen.getByText("(CF=72%)")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("shows the compact USD max-to-borrow and CF when CF, amount, and price are present", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="1"
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(screen.getByText("(CF=72%)")).toBeInTheDocument();
    expect(screen.getByText(/\$63\.6k USD/)).toBeInTheDocument();
  });

  it("explains the collateral factor in a tooltip on the row", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="1"
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(
      screen.getByText(COPY.tooltips.collateralFactor),
    ).toBeInTheDocument();
  });

  it("shows -- for max-to-borrow when hasPriceFetchError is true", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="1"
        btcPrice={88_400}
        hasPriceFetchError={true}
      />,
    );
    expect(screen.getByText("(CF=72%)")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });
});
