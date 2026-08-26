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

  it("shows no fairness tooltip when the card supplies none", () => {
    render(
      <LiquidationEventCard
        card={{
          ...CARD,
          fairness: {
            label: COPY.liquidations.events.fairnessDebtRepaid,
            value: "$50",
          },
        }}
      />,
    );

    expect(
      screen.queryByText(COPY.liquidations.events.fairnessPaymentTooltip),
    ).not.toBeInTheDocument();
  });
});
