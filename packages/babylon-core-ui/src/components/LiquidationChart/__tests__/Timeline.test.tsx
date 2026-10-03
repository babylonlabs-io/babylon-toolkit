import { fireEvent, render, screen, within } from "@testing-library/react";
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
    // Explicit formatter: the default renders in the machine's local
    // timezone, which would flip the date around UTC midnight.
    const { container } = renderTimeline({
      candles: makeCandles(1),
      formatTime: (t) => `t${t}`,
    });
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(1);
    expect(within(container).getByText("t1750000000000")).toBeInTheDocument();
  });

  // A caller that has folded the amount into the label passes no `amountLabel`;
  // the band must not then print an empty line in its text stack.
  it("prints no amount line for a band that carries none", () => {
    const { container } = renderTimeline({
      bands: [{ ...bands[0], label: "Liq Event 1 (0.6 BTC)", amountLabel: undefined }],
    });
    const chart = within(container);
    expect(chart.getByText("Liq Event 1 (0.6 BTC)")).toBeInTheDocument();
    expect(chart.queryByText("0.6 BTC")).toBeNull();
  });

  // The axis labels are often abbreviated (a bare day number), so the readout
  // header gets its own formatter rather than reusing the tick one.
  it("formats the crosshair readout timestamp independently of the axis", () => {
    const { container } = renderTimeline({
      candles: makeCandles(4),
      interactions: { crosshair: true },
      formatTime: (t) => `tick-${t}`,
      formatReadoutTime: (t) => `readout-${t}`,
    });

    fireEvent.pointerMove(container.querySelector(".bbn-liq-candles__hit")!, {
      clientX: 10,
    });

    expect(screen.getByText("readout-1750000000000")).toBeInTheDocument();
  });

  it("shows the safe-zone detail lines when they fit above the first event", () => {
    // The two fixed-height event rows below leave most of the plot to the
    // safe zone, which comfortably fits the title plus two lines. Queries
    // scoped to the chart: @visx/text keeps a hidden measurement node on
    // document.body that would otherwise double-match.
    const { container } = renderTimeline();
    const chart = within(container);
    expect(chart.getByText("Safe zone")).toBeInTheDocument();
    expect(chart.getByText("no events above $77,682")).toBeInTheDocument();
    expect(chart.getByText("13.3% drop to Liq 1")).toBeInTheDocument();
  });

  it("sheds the safe-zone detail lines when they cannot fit the box", () => {
    // The safe zone now gets most of the plot (events are fixed-height rows),
    // so overflowing it takes a genuinely long stack, not just a handful of
    // lines.
    const tallStack = {
      title: "Safe zone",
      lines: Array.from({ length: 30 }, (_, i) => `line ${i + 1}`),
    };
    const { container } = renderTimeline({ safeZone: tallStack });
    const chart = within(container);
    expect(chart.getByText("Safe zone")).toBeInTheDocument();
    expect(chart.queryByText("line 1")).not.toBeInTheDocument();
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

  it("gives every event a fixed 44px row regardless of price span", () => {
    // Event 1 spans $37k of price, event 2 only $283: the design draws every
    // "Liq Event N" band as the same compact row, so neither span should
    // move its height off the 44px floor.
    const { container } = renderTimeline();
    const h1 = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("height") ?? "0");
    const h2 = Number.parseFloat(screen.getByTestId("liq-band-2").getAttribute("height") ?? "0");
    expect(h1).toBeCloseTo(44, 2);
    expect(h2).toBeCloseTo(44, 2);
    expect(within(container).getByText("Liq Event 2")).toBeInTheDocument();
  });

  it("honours a caller's event-row height", () => {
    renderTimeline({ eventRowPx: 24 });
    const h1 = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("height") ?? "0");
    expect(h1).toBeCloseTo(24, 2);
  });

  // The borrow-flow preview draws its bands across the whole plot with the
  // candles over them, rather than in a column beside them.
  it("spans the bands across the plot and keeps the candles full width", () => {
    const plotWidth = 1016 - 68; // chart width minus the fluid axis gutter
    const { container } = renderTimeline({ bandPlacement: "plot", safeZone: undefined, candles: makeCandles(4) });

    const band = screen.getByTestId("liq-band-1");
    expect(Number.parseFloat(band.getAttribute("x") ?? "-1")).toBe(0);
    expect(Number.parseFloat(band.getAttribute("width") ?? "0")).toBeCloseTo(plotWidth, 2);

    // Bands paint first so the candles read on top of them.
    const painted = Array.from(container.querySelectorAll("[data-testid]")).map((el) => el.getAttribute("data-testid"));
    expect(painted.indexOf("liq-band-1")).toBeLessThan(painted.indexOf("liq-candle"));
  });

  // Everything painted over a plot-width band would otherwise intercept its
  // hover: SVG marks hit-test by default, and a transparent rect still does.
  // jsdom does no hit-testing, so this asserts the structural conditions the
  // browser behaviour rests on — no bare interaction rect, an enabled one
  // painted under the bands, and the price series carrying the classes the
  // stylesheet makes `pointer-events: none`.
  it("leaves nothing over plot-width bands that could intercept their hover", async () => {
    const plotProps: Partial<React.ComponentProps<typeof Timeline>> = {
      bandPlacement: "plot",
      safeZone: undefined,
      candles: makeCandles(4),
      seriesStyle: "candles+line",
      bands: [{ ...bands[0], popoverMetrics: [{ label: "At price", value: "$77,682" }] }],
    };
    const { container, unmount } = renderTimeline(plotProps);

    expect(container.querySelector(".bbn-liq-candles__hit")).toBeNull();
    expect(container.querySelector(".bbn-liq-candle__body")).toBeTruthy();
    expect(container.querySelector(".bbn-liq-candle__wick")).toBeTruthy();
    expect(container.querySelector(".bbn-liq-series__line")).toBeTruthy();

    fireEvent.mouseEnter(screen.getByTestId("liq-band-1"));
    expect(await screen.findByText("At price")).toBeInTheDocument();
    unmount();

    const interactive = renderTimeline({ ...plotProps, interactions: { crosshair: true } });
    const hit = interactive.container.querySelector(".bbn-liq-candles__hit");
    const band = screen.getByTestId("liq-band-1");
    expect(hit).toBeTruthy();
    expect(hit!.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.queryByText("At price")).toBeNull();
    fireEvent.mouseEnter(band);
    expect(await screen.findByText("At price")).toBeInTheDocument();
  });

  it("keeps the interaction rect when an interaction is enabled", () => {
    const { container } = renderTimeline({ candles: makeCandles(4), interactions: { crosshair: true } });
    expect(container.querySelector(".bbn-liq-candles__hit")).toBeTruthy();
  });

  it("reserves a band column when the bands sit in the gutter", () => {
    const plotWidth = 1016 - 68;
    renderTimeline({ candles: makeCandles(4) });

    const band = screen.getByTestId("liq-band-1");
    const bandRight =
      Number.parseFloat(band.getAttribute("x") ?? "NaN") + Number.parseFloat(band.getAttribute("width") ?? "NaN");
    const bandWidth = Number.parseFloat(band.getAttribute("width") ?? "NaN");
    expect(bandWidth).toBeGreaterThan(0);
    expect(bandWidth).toBeLessThan(plotWidth);

    const candleRegion = screen.getAllByTestId("liq-candle")[0].parentElement;
    const regionLeft = Number.parseFloat(
      /translate\(([^,]+),/.exec(candleRegion?.getAttribute("transform") ?? "")?.[1] ?? "NaN",
    );
    expect(regionLeft).toBeGreaterThanOrEqual(bandRight);
  });

  it("draws no bands at all when the seizure map is unplugged", () => {
    renderTimeline({ bandPlacement: "none" });
    expect(screen.queryByTestId("liq-band-1")).toBeNull();
  });

  // Both marks come from the same series, so the close line takes the
  // price-line colour instead of the bullish green it uses on its own.
  it("traces the close line over the candles in the combined series style", () => {
    const { container } = renderTimeline({ seriesStyle: "candles+line", candles: makeCandles(6) });
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(6);
    expect(container.querySelector(".bbn-liq-series__line--over-candles")).toBeTruthy();
  });

  it("replaces the candles when the series is a line on its own", () => {
    const { container } = renderTimeline({ seriesStyle: "line", candles: makeCandles(6) });
    expect(screen.queryAllByTestId("liq-candle")).toHaveLength(0);
    expect(container.querySelector(".bbn-liq-series__line")).toBeTruthy();
    expect(container.querySelector(".bbn-liq-series__line--over-candles")).toBeNull();
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

  it("gives the safe zone whatever room the fixed-height events leave behind", () => {
    // Two events pinned at the 44px floor leave the rest of the plot to the
    // safe zone (and its candles) — the design's ~60%+ split, not a share
    // weighted by price span.
    renderTimeline();
    const plotHeight = (948 * 350) / 1016;
    const safeHeight = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("y") ?? "0");
    const h1 = Number.parseFloat(screen.getByTestId("liq-band-1").getAttribute("height") ?? "0");
    expect(h1).toBeCloseTo(44, 2);
    expect(safeHeight).toBeCloseTo(plotHeight - 2 * 44, 1);
    expect(safeHeight / plotHeight).toBeGreaterThan(0.5);
  });

  it("dims no gutter block while the price line sits above the safe zone floor", () => {
    const { container } = renderTimeline();
    expect(container.querySelectorAll(".bbn-liq-band--liquidated")).toHaveLength(0);
  });

  it("zooms the candle window in and out and resets to the default view", () => {
    renderTimeline({
      candles: makeCandles(160),
      visibleCandles: 44,
      interactions: { zoom: true },
    });
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(44);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(35);

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(44);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getAllByTestId("liq-candle")).toHaveLength(44);
  });

  it("renders vertical-only gridlines with no grid prop (deliberate default flip)", () => {
    // Timeline's anchored Y scale makes horizontal gridlines misleading, so
    // (unlike ChartFrame's generic "both" default) it defaults to
    // vertical-only. Locking this in: the Figma frame draws no horizontal
    // rows.
    const { container } = renderTimeline({ candles: makeCandles(12) });
    const lines = container.querySelectorAll(".bbn-liq-grid line");
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((line) => {
      expect(line.getAttribute("x1")).toBe(line.getAttribute("x2"));
      expect(line.getAttribute("y1")).not.toBe(line.getAttribute("y2"));
    });
  });

  it("names the chart for assistive tech", () => {
    const { container } = renderTimeline();
    const svg = container.querySelector(".bbn-liq-chart__svg");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg?.getAttribute("aria-label")).toContain("$88,700");
  });
});
