import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "../Timeline";
import type { Candle, LiquidationBand, PriceAxisTick } from "../types";

const priceAxis: PriceAxisTick[] = [
  { value: 90000, label: "$90,000" },
  { value: 40000, label: "$40,000" },
];

const bands: LiquidationBand[] = [
  {
    key: "1",
    label: "Liq Event 1",
    sublabel: "(contain vault 1)",
    amountLabel: "0.6 BTC",
    priceTop: 77682,
    priceBottom: 40283,
    shareStart: 0,
    shareEnd: 0.55,
    state: "live",
    tone: "1",
  },
  {
    key: "2",
    label: "Liq Event 2",
    sublabel: "(contain vault 2)",
    amountLabel: "0.1 BTC",
    priceTop: 40283,
    priceBottom: 40100,
    shareStart: 0.55,
    shareEnd: 1,
    state: "live",
    tone: "2",
  },
];

const safeZone = {
  title: "Safe zone",
  lines: ["no events above $77,682", "13.3% drop to Liq 1"],
};

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1_750_000_000_000 + i * 86_400_000,
    open: 80000,
    high: 82000,
    low: 78000,
    close: 81000,
  }));
}

function renderTimeline(overrides: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  return render(
    <Timeline
      bands={bands}
      priceAxis={priceAxis}
      currentPrice={88700}
      currentPriceLabel="$88,700"
      safeZone={safeZone}
      {...overrides}
    />,
  );
}

describe("Timeline", () => {
  it("renders one candle per data point", () => {
    renderTimeline({ candles: makeCandles(12) });
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(12);
  });

  it("renders a single candle with a single time tick", () => {
    const { container } = renderTimeline({ candles: makeCandles(1) });
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(1);
    expect(within(container).getByText("Jun 15")).toBeInTheDocument();
  });

  it("shows the safe-zone detail lines when they fit above the first event", () => {
    // First band triggers at 77,682 on a 90k-40k axis: roughly the top quarter
    // of the plot is safe, which comfortably fits the title plus two lines.
    // Queries scoped to the chart: @visx/text keeps a hidden measurement node
    // on document.body that would otherwise double-match.
    const { container } = renderTimeline();
    const chart = within(container);
    expect(chart.getByText("Safe zone")).toBeInTheDocument();
    expect(chart.getByText("no events above $77,682")).toBeInTheDocument();
    expect(chart.getByText("13.3% drop to Liq 1")).toBeInTheDocument();
  });

  it("sheds the safe-zone detail lines when the safe region is too short for them", () => {
    const { container } = renderTimeline({
      priceAxis: [
        { value: 84000, label: "$84,000" },
        { value: 40000, label: "$40,000" },
      ],
      currentPrice: 83500,
      currentPriceLabel: "$83,500",
    });
    const chart = within(container);
    expect(chart.getByText("Safe zone")).toBeInTheDocument();
    expect(chart.queryByText("no events above $77,682")).not.toBeInTheDocument();
    expect(chart.queryByText("13.3% drop to Liq 1")).not.toBeInTheDocument();
  });

  it("marks liquidation levels inside the price domain with an axis pill", () => {
    const { container } = renderTimeline();
    expect(within(container).getByText("$77,682")).toBeInTheDocument();
  });

  it("does not mark levels that fall outside the price domain", () => {
    const { container } = renderTimeline({
      bands: [{ ...bands[0], priceTop: 30000, priceBottom: 20000 }],
    });
    expect(within(container).queryByText("$30,000")).not.toBeInTheDocument();
  });

  it("reserves no x-axis strip when there is nothing to label", () => {
    const { container } = renderTimeline({ candles: [], timeAxisLabels: undefined });
    const svg = container.querySelector(".bbn-liq-chart__svg");
    // Full plot height at the 1016px fallback width, and nothing below it.
    expect(Number.parseFloat(svg?.getAttribute("height") ?? "0")).toBeCloseTo((948 * 350) / 1016, 3);
  });

  it("adds the x-axis strip when candles provide time labels", () => {
    const { container } = renderTimeline({ candles: makeCandles(12) });
    const svg = container.querySelector(".bbn-liq-chart__svg");
    expect(Number.parseFloat(svg?.getAttribute("height") ?? "0")).toBeGreaterThan((948 * 350) / 1016);
  });

  it("renders the frame without candles until a price feed exists", () => {
    renderTimeline({ candles: [] });
    expect(screen.queryAllByTestId("liq-candle")).toHaveLength(0);
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(screen.getByTestId("liq-band-1")).toBeInTheDocument();
  });

  it("sizes the gutter blocks equally regardless of their price spans", () => {
    // Event 1 spans $37k of price, event 2 spans $183 — the gutter still
    // gives them the same block height; only the axis pills carry the prices.
    renderTimeline();
    const h1 = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("height") ?? "0");
    const h2 = Number.parseFloat(screen.getByTestId("liq-band-2").getAttribute("height") ?? "0");
    expect(h1).toBeGreaterThan(0);
    expect(h1).toBeCloseTo(h2, 6);
  });
});
