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
  it("forces the three-column row and single-line labels from xl (1280px) up, not just at 1440px", () => {
    render(<PositionStatCards cards={cards} />);

    const row = screen.getByText("$10,000").closest("div.flex.flex-col.gap-6");
    expect(row).toHaveClass("xl:flex-row");
    expect(row).toHaveClass("xl:items-stretch");

    const label = screen.getByText("Total collateral value");
    expect(label).toHaveClass("xl:whitespace-nowrap");

    const value = screen.getByText("$10,000").parentElement;
    expect(value).toHaveClass("xl:whitespace-nowrap");

    const caption = screen.getByText("0.5 BTC");
    expect(caption).toHaveClass("xl:whitespace-nowrap");
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

  it("clips a long collateral total inside its column instead of overflowing the card", () => {
    // Regression guard for issue #2428.
    const longValue = "$123,456,789,012,345,678.90";
    render(
      <PositionStatCards
        cards={[{ label: "Total collateral value", value: longValue }]}
      />,
    );

    const value = screen.getByText(longValue);
    expect(value).toHaveClass("overflow-hidden");
    expect(value).toHaveClass("text-ellipsis");

    const column = value.closest("div.flex-col");
    expect(column).toHaveClass("min-w-0");

    const section = value.closest("div.justify-between");
    expect(section).toHaveClass("min-w-0");
    expect(section).toHaveClass("flex-1");
  });

  it("clips a long caption inside its column instead of overflowing the card", () => {
    const longCaption =
      "0.11111111 BTC \u2192 0.22222222 BTC \u2192 0.33333333 BTC";
    render(
      <PositionStatCards
        cards={[{ label: "Active vaults", value: "3", caption: longCaption }]}
      />,
    );

    const caption = screen.getByText(longCaption);
    expect(caption).toHaveClass("overflow-hidden");
    expect(caption).toHaveClass("text-ellipsis");
  });

  it("clips custom valueNode content at the column edge, not only plain values", () => {
    const longValue = "$123,456,789,012,345,678.90";
    render(
      <PositionStatCards
        cards={[
          {
            label: "Total collateral value",
            value: longValue,
            valueNode: <span>{longValue} BTC</span>,
          },
        ]}
      />,
    );

    const valueRow = screen.getByText(`${longValue} BTC`).parentElement;
    expect(valueRow).toHaveClass("overflow-hidden");
    expect(valueRow).toHaveClass("min-w-0");
  });

  it("below xl, a long value wraps rather than being clipped to one line", () => {
    // truncate would force nowrap at every breakpoint; the component gates
    // nowrap behind xl: (PR #2296) so narrow viewports wrap instead.
    const longValue = "$123,456,789,012,345,678.90";
    render(
      <PositionStatCards
        cards={[{ label: "Total collateral value", value: longValue }]}
      />,
    );

    const value = screen.getByText(longValue);
    expect(value).not.toHaveClass("truncate");
    expect(value).not.toHaveClass("whitespace-nowrap");
  });
});
