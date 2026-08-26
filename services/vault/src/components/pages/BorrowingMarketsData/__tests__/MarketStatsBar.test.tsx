import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Component tests mock core-ui (its dist isn't built in the test run).
vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: ({ tooltip }: { tooltip?: string }) =>
    tooltip ? <span data-testid="hint" /> : null,
}));

import { MarketStatsBar } from "../MarketStatsBar";

describe("MarketStatsBar", () => {
  it("renders every provided label and value", () => {
    render(
      <MarketStatsBar
        stats={[
          { label: "Available Liquidity", value: "1,234 BTC" },
          { label: "Borrow APR", value: "3.21%" },
        ]}
      />,
    );

    expect(screen.getByText("Available Liquidity")).toBeInTheDocument();
    expect(screen.getByText("1,234 BTC")).toBeInTheDocument();
    expect(screen.getByText("Borrow APR")).toBeInTheDocument();
    expect(screen.getByText("3.21%")).toBeInTheDocument();
  });

  it("renders a hint only for stats that carry a tooltip", () => {
    render(
      <MarketStatsBar
        stats={[
          { label: "Supplied", value: "500 BTC", tooltip: "Total supplied" },
          { label: "Borrow APR", value: "3.21%" },
        ]}
      />,
    );

    expect(screen.getAllByTestId("hint")).toHaveLength(1);
  });
});
