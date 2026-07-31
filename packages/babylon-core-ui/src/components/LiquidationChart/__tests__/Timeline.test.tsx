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

  it("sheds the safe-zone detail lines when they cannot fit the fixed-third box", () => {
    const tallStack = {
      title: "Safe zone",
      lines: ["one", "two", "three", "four", "five", "six", "seven"],
    };
    const { container } = renderTimeline({ safeZone: tallStack });
    const chart = within(container);
    expect(chart.getByText("Safe zone")).toBeInTheDocument();
    expect(chart.queryByText("one")).not.toBeInTheDocument();
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

  it("sizes the gutter blocks by compressed price span with a readable floor", () => {
    // Event 1 spans $37k of price, event 2 only $283: the split follows the
    // square-rooted spans, but event 2 never shrinks below the 44px floor —
    // tall enough that its label still renders.
    const { container } = renderTimeline();
    const h1 = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("height") ?? "0");
    const h2 = Number.parseFloat(screen.getByTestId("liq-band-2").getAttribute("height") ?? "0");
    expect(h1).toBeGreaterThan(h2);
    expect(h2).toBeCloseTo(44, 3);
    expect(within(container).getByText("Liq Event 2")).toBeInTheDocument();
  });

  it("dims exactly the gutter blocks the price line has passed", () => {
    // With the anchored scale, $48,900 sits inside event 1's block (between
    // the $77,682 and $40,283 anchors), so only event 1 reads as passed.
    const { container } = renderTimeline({
      currentPrice: 48_900,
      currentPriceLabel: "$48,900",
    });
    expect(container.querySelectorAll(".bbn-liq-band--liquidated")).toHaveLength(1);
  });

  it("gives the safe zone at least as much room as the largest event", () => {
    // Safe span $12,318 weighs less than event 1's $37,399, so the guarantee
    // kicks in: the safe zone is raised to match event 1 exactly.
    renderTimeline();
    const plotHeight = (948 * 350) / 1016;
    const safeHeight = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("y") ?? "0");
    const h1 = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("height") ?? "0");
    expect(safeHeight).toBeCloseTo(h1, 2);
    expect(safeHeight / plotHeight).toBeGreaterThan(0.4);
  });

  it("dims no gutter block while the price line sits above the safe zone floor", () => {
    const { container } = renderTimeline();
    expect(container.querySelectorAll(".bbn-liq-band--liquidated")).toHaveLength(0);
  });
});
