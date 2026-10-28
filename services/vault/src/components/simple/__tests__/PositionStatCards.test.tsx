import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PositionStatCards, type PositionStatCard } from "../PositionStatCards";

const cards: PositionStatCard[] = [
  {
    label: "Total collateral value",
    value: "$10,000",
    caption: "0.5 BTC",
    actionLabel: "Deposit",
    onAction: () => {},
  },
  {
    label: "Available to borrow",
    value: "$5,000",
    actionLabel: "Borrow",
    onAction: () => {},
  },
];

describe("PositionStatCards", () => {
  it("forces the three-column row from xl (1280px) up, not just at 1440px", () => {
    render(<PositionStatCards cards={cards} />);

    const row = screen.getByText("$10,000").closest("div.flex.flex-col.gap-6");
    expect(row).toHaveClass("xl:flex-row");
    expect(row).toHaveClass("xl:items-stretch");
  });

  it("below xl, labels are free to wrap instead of forcing the row to overflow", () => {
    // Regression guard for PR #2296: shrink-0 + unconditional nowrap forced
    // the row wider than its content and clipped the Repay button.
    render(<PositionStatCards cards={cards} />);

    const label = screen.getByText("Total collateral value");
    expect(label).not.toHaveClass("whitespace-nowrap");
  });

  it("compresses gaps and the action button only in the 1280-1439px band, so the row fits between the sidebar and 1440px without clipping", () => {
    render(<PositionStatCards cards={cards} />);

    const row = screen.getByText("$10,000").closest("div.flex.flex-col.gap-6");
    expect(row).toHaveClass("xl:max-[1439px]:gap-4");
    // Figma-true gap-6 stays the base value, so it's back in effect at 1440+
    // without needing a separate min-[1440px] override.
    expect(row).toHaveClass("gap-6");

    const depositButton = screen.getByRole("button", { name: "Deposit" });
    expect(depositButton).toHaveClass("xl:max-[1439px]:w-[100px]");
    expect(depositButton).toHaveClass("w-[120px]");
  });

  it("lifts the min-width floor on the section and column so a long collateral total can wrap", () => {
    // Regression guard for issue #2428.
    const longValue = "$123,456,789,012,345,678.90";
    render(
      <PositionStatCards
        cards={[{ label: "Total collateral value", value: longValue }]}
      />,
    );

    const value = screen.getByText(longValue);

    const column = value.closest("div.flex-col");
    expect(column).toHaveClass("min-w-0");

    const section = value.closest("div.justify-between");
    expect(section).toHaveClass("min-w-0");
  });
});
