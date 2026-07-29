import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeizureMap } from "../SeizureMap";
import type { LiquidationBand, PriceAxisTick } from "../types";

const priceAxis: PriceAxisTick[] = [
  { value: 88400, label: "$88,400" },
  { value: 77682, label: "$77,682" },
  { value: 40283, label: "$40,283" },
  { value: 3417, label: "$3,417" },
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
    amountLabel: "0.4 BTC",
    priceTop: 40283,
    priceBottom: 3417,
    shareStart: 0.55,
    shareEnd: 1,
    state: "live",
    tone: "2",
  },
];

function renderMap(overrides: Partial<React.ComponentProps<typeof SeizureMap>> = {}) {
  return render(
    <SeizureMap bands={bands} priceAxis={priceAxis} currentPrice={88400} currentPriceLabel="$88,400" {...overrides} />,
  );
}

describe("SeizureMap", () => {
  it("renders the current-price line and one rect per band", () => {
    renderMap();
    expect(screen.getByTestId("liq-current-price-line")).toBeInTheDocument();
    expect(screen.getByTestId("liq-band-1")).toBeInTheDocument();
    expect(screen.getByTestId("liq-band-2")).toBeInTheDocument();
  });

  it("labels the price axis and the positioned share ticks", () => {
    // Queries scoped to the chart: @visx/text keeps a hidden measurement
    // node on document.body that would otherwise double-match.
    const { container } = renderMap({
      shareAxisTicks: [
        { fraction: 0, label: "0%" },
        { fraction: 0.55, label: "55%" },
        { fraction: 1, label: "100%" },
      ],
    });
    const chart = within(container);
    expect(chart.getByText("$77,682")).toBeInTheDocument();
    expect(chart.getByText("55%")).toBeInTheDocument();
    expect(chart.getByText("100%")).toBeInTheDocument();
  });

  it("hides all in-band text with hideBandLabels", () => {
    const { container } = renderMap({ hideBandLabels: true, showShareLegend: false });
    const chart = within(container);
    expect(chart.getByTestId("liq-band-1")).toBeInTheDocument();
    expect(chart.queryByText("Liq Event 1")).not.toBeInTheDocument();
    expect(chart.queryByText("0.6 BTC")).not.toBeInTheDocument();
  });

  it("marks a liquidated band as dimmed", () => {
    const { container } = renderMap({
      bands: bands.map((b) => (b.key === "1" ? { ...b, state: "liquidated" } : b)),
    });
    const dimmed = container.querySelectorAll(".bbn-liq-band--liquidated");
    expect(dimmed).toHaveLength(1);
    expect(dimmed[0].querySelector('[data-testid="liq-band-1"]')).not.toBeNull();
  });

  it("drops band text lines as the band gets shorter", () => {
    // Linear 2-tick axis over the deterministic 1016px fallback layout
    // (plot height ~326.6px): 100000 price units span the full plot, so a
    // band's pixel height is span/100000 * 326.6, minus 8px vertical padding
    // for the content box the thresholds apply to.
    const ladderAxis: PriceAxisTick[] = [
      { value: 100000, label: "$100k" },
      { value: 0, label: "$0" },
    ];
    const ladder: LiquidationBand[] = [
      {
        key: "tall",
        label: "Event A",
        sublabel: "(vault A)",
        amountLabel: "1.0 BTC",
        priceTop: 100000,
        priceBottom: 60000, // ~130.6px -> all three lines
        shareStart: 0,
        shareEnd: 0.4,
        state: "live",
        tone: "1",
      },
      {
        key: "short",
        label: "Event B",
        sublabel: "(vault B)",
        amountLabel: "0.5 BTC",
        priceTop: 60000,
        priceBottom: 45000, // ~49px -> content ~41px -> label only
        shareStart: 0.4,
        shareEnd: 0.7,
        state: "live",
        tone: "2",
      },
      {
        key: "tiny",
        label: "Event C",
        sublabel: "(vault C)",
        amountLabel: "0.1 BTC",
        priceTop: 45000,
        priceBottom: 35000, // ~32.7px -> content ~24.7px -> no text at all
        shareStart: 0.7,
        shareEnd: 1,
        state: "live",
        tone: "3",
      },
    ];
    const { container } = renderMap({
      bands: ladder,
      priceAxis: ladderAxis,
      currentPrice: 100000,
      showShareLegend: false,
    });
    const chart = within(container);

    expect(chart.getByText("Event A")).toBeInTheDocument();
    expect(chart.getByText("(vault A)")).toBeInTheDocument();
    expect(chart.getByText("1.0 BTC")).toBeInTheDocument();

    expect(chart.getByText("Event B")).toBeInTheDocument();
    expect(chart.queryByText("(vault B)")).not.toBeInTheDocument();
    expect(chart.queryByText("0.5 BTC")).not.toBeInTheDocument();

    expect(chart.queryByText("Event C")).not.toBeInTheDocument();
  });

  it("rejects a non-descending price axis loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderMap({
        priceAxis: [
          { value: 40283, label: "$40,283" },
          { value: 88400, label: "$88,400" },
        ],
      }),
    ).toThrow(/strictly descending/);
    spy.mockRestore();
  });
});
