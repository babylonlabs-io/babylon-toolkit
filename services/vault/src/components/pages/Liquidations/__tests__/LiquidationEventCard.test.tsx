import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

// Component tests mock core-ui (its dist isn't built in the test run) —
// the mock surfaces the tooltip text so it can be asserted against its row.
vi.mock("@babylonlabs-io/core-ui", () => ({
  Hint: ({ tooltip }: { tooltip?: string }) => <span>{tooltip}</span>,
}));

import { LiquidationEventCard } from "../LiquidationEventCard";
import type { LiquidationEventCard as EventCardData } from "../liquidationChartData";

const CARD: EventCardData = {
  key: "0",
  title: "Liq Event 1",
  tone: "1",
  triggered: false,
  collateralLabel: "0.42 BTC",
  liqPriceLabel: "$60,000",
  distanceLabel: "-10%",
  distanceNegative: true,
  seizedVaults: [{ name: "Vault 1", amount: "0.42", unit: "BTC" }],
  targetSeizure: { amount: "0.40", unit: "BTC" },
  overSeizure: { amount: "0.02", unit: "BTC" },
  collateralLiquidatedLabel: "0.42 BTC",
  debtRepaidLabel: "$1,000",
  liquidatorProfitLabel: "$100",
  fairness: {
    label: COPY.liquidations.events.fairnessPaymentWbtc,
    value: "$81 (0.002 BTC)",
    tooltip: COPY.liquidations.events.fairnessPaymentTooltip,
  },
  btcRemainingLabel: "0.5 BTC",
  debtRemainingLabel: "$5,000",
  hfAfterLabel: "1.20",
};

describe("LiquidationEventCard", () => {
  it("explains the target and over seizure rows with the design's tooltips", () => {
    render(<LiquidationEventCard card={CARD} />);

    expect(
      screen.getByText(COPY.liquidations.events.targetSeizureTooltip),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.liquidations.events.overSeizureTooltip),
    ).toBeInTheDocument();
  });

  it("shows the fairness tooltip supplied by the card", () => {
    render(<LiquidationEventCard card={CARD} />);

    expect(
      screen.getByText(COPY.liquidations.events.fairnessPaymentTooltip),
    ).toBeInTheDocument();
  });

  it("shows the debt-repaid fairness tooltip on a non-full liquidation", () => {
    render(
      <LiquidationEventCard
        card={{
          ...CARD,
          fairness: {
            label: COPY.liquidations.events.fairnessDebtRepaid,
            value: "$50",
            tooltip: COPY.liquidations.events.fairnessDebtRepaidTooltip,
          },
        }}
      />,
    );

    expect(
      screen.getByText(COPY.liquidations.events.fairnessDebtRepaidTooltip),
    ).toBeInTheDocument();
  });

  describe("collateral / liq price / distance stat columns", () => {
    const STAT_CARD: EventCardData = { ...CARD, collateralLabel: "1.23 tBTC" };

    it("gives each of the three stat columns an equal share that can shrink below its content width", () => {
      render(<LiquidationEventCard card={STAT_CARD} />);

      for (const value of ["1.23 tBTC", "$60,000", "-10%"]) {
        expect(screen.getByText(value).parentElement).toHaveClass(
          "flex-1",
          "min-w-0",
        );
      }
    });

    it("carries the full untruncated value in a title attribute", () => {
      render(<LiquidationEventCard card={STAT_CARD} />);

      for (const value of ["1.23 tBTC", "$60,000", "-10%"]) {
        expect(screen.getByText(value)).toHaveAttribute("title", value);
      }
    });

    it("clips an overflowing stat value with an ellipsis instead of pushing the next column", () => {
      render(<LiquidationEventCard card={STAT_CARD} />);

      for (const value of ["1.23 tBTC", "$60,000", "-10%"]) {
        const element = screen.getByText(value);
        expect(element).toHaveClass(
          "block",
          "overflow-hidden",
          "text-ellipsis",
        );
        expect(element.className).not.toMatch(/(^|\s)truncate(\s|$)/);
        expect(element.className).not.toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
      }
    });
  });
});
