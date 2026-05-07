import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

  it("renders percent only when amount is empty", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc=""
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(screen.getByText("Collateral Factor:")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.queryByText(/max USD/)).not.toBeInTheDocument();
  });

  it("renders percent only when amount is zero", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="0"
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.queryByText(/max USD/)).not.toBeInTheDocument();
  });

  it("renders percent and compact USD max when CF, amount, and price are present", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="1"
        btcPrice={88_400}
        hasPriceFetchError={false}
      />,
    );
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText(/\$63\.6k max USD/)).toBeInTheDocument();
  });

  it("hides USD suffix when hasPriceFetchError is true", () => {
    render(
      <CollateralFactorRow
        collateralFactor={0.72}
        amountBtc="1"
        btcPrice={88_400}
        hasPriceFetchError={true}
      />,
    );
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.queryByText(/max USD/)).not.toBeInTheDocument();
  });
});
