import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLOT_ASPECT_RATIO } from "../../charts/chartLayout";
import { LineChart } from "../LineChart";
import type { LineChartHover, LineChartProps } from "../types";

// The chart renders from the deterministic fallback width (see setup.ts):
// chartWidth 1016 → gutter 68, plotWidth 948. jsdom reports a zeroed client
// rect for the hit area, so clientX reads straight through as the plot-local x.
const PLOT_WIDTH = 948;

const series = [
  { x: 0, y: 0 },
  { x: 50, y: 10 },
  { x: 100, y: 30 },
];

function renderChart(overrides: Partial<LineChartProps> = {}) {
  return render(<LineChart data={series} xDomain={[0, 100]} yDomain={[0, 30]} ariaLabel="Rate curve" {...overrides} />);
}

function hitArea() {
  return screen.getByTestId("line-chart-hit");
}

/** Pointer at `px` from the plot's left edge. Whole pixels only — jsdom
 * coerces MouseEvent coordinates to integers. With an x domain of [0, 100]
 * over 948px, the quarter marks 237 / 474 / 711 land on 25 / 50 / 75. */
function hoverAt(px: number) {
  fireEvent.pointerMove(hitArea(), { clientX: px });
}

describe("LineChart", () => {
  it("names itself as one image for screen readers", () => {
    renderChart();
    expect(screen.getByRole("img", { name: "Rate curve" })).toBeInTheDocument();
  });

  it("draws a stepped path when the interpolation is stepped", () => {
    const { container } = renderChart({ interpolation: "step" });
    const d = container.querySelector(".bbn-line-chart__series")?.getAttribute("d") ?? "";
    expect(d).toContain("H");
    expect(d).toContain("V");
    expect(d).not.toContain("L");
  });

  it("reads the interpolated value between data points on hover", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    hoverAt(237);

    const hover = onHoverChange.mock.calls.at(-1)?.[0];
    expect(hover?.x).toBeCloseTo(25, 5);
    expect(hover?.y).toBeCloseTo(5, 5);
  });

  it("snaps hover to the closest datum in nearest mode", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ hoverMode: "nearest", onHoverChange });

    hoverAt(237);

    expect(onHoverChange.mock.calls.at(-1)?.[0]).toMatchObject({ x: 0, y: 0, index: 0 });
  });

  it("reports the nearest datum alongside the interpolated value", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    hoverAt(711);

    const hover = onHoverChange.mock.calls.at(-1)?.[0];
    expect(hover?.point).toEqual({ x: 50, y: 10 });
    expect(hover?.y).toBeCloseTo(20, 5);
  });

  it("clears the hover when the pointer leaves", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    hoverAt(474);
    fireEvent.pointerLeave(hitArea());

    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it("treats a tap as a hover so the readout works without a mouse", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    fireEvent.pointerDown(hitArea(), { clientX: 474 });

    expect(onHoverChange.mock.calls.at(-1)?.[0]?.x).toBeCloseTo(50, 5);
  });

  it("renders the caller's tooltip for the hovered position", () => {
    renderChart({ renderTooltip: (hover) => <span>{`value ${hover.y.toFixed(1)}`}</span> });

    hoverAt(474);

    expect(screen.getByText("value 10.0")).toBeInTheDocument();
  });

  it("drops markers outside the x domain", () => {
    const { container } = renderChart({
      markers: [
        { key: "in", x: 50, title: "In" },
        { key: "out", x: 140, title: "Out" },
      ],
    });
    expect(screen.getByText("In")).toBeInTheDocument();
    expect(screen.queryByText("Out")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bbn-line-chart__rule")).toHaveLength(1);
  });

  it("puts the marker dot on the series, not on the axis", () => {
    const { container } = renderChart({
      markers: [{ key: "mid", x: 50, title: "Mid" }],
    });
    const dot = container.querySelector(".bbn-line-chart__dot");
    // y = 10 of a [0,30] domain → two thirds down the plot.
    const plotHeight = PLOT_WIDTH / DEFAULT_PLOT_ASPECT_RATIO;
    expect(Number(dot?.getAttribute("cy"))).toBeCloseTo((2 / 3) * plotHeight, 5);
  });

  it("displaces a colliding callout to the other side of its rule", () => {
    const { container } = renderChart({
      markers: [
        { key: "kink", x: 80, title: "Optimal (Kink) 80%", lines: ["APR ~ 4.0%"], style: "dashed" },
        { key: "current", x: 78, title: "Current 78%", lines: ["APR ~ 3.0%"] },
      ],
    });
    const [kink, current] = Array.from(container.querySelectorAll(".bbn-line-chart__callout")).map((rect) => ({
      left: Number(rect.getAttribute("x")),
      width: Number(rect.getAttribute("width")),
    }));

    expect(kink.left).toBeCloseTo(0.8 * PLOT_WIDTH, 5);
    // The current callout no longer starts at its own rule — it flipped left.
    expect(current.left).toBeLessThan(0.78 * PLOT_WIDTH);
    expect(current.left + current.width).toBeLessThanOrEqual(kink.left);
  });

  it("renders without markers, ticks or a tooltip", () => {
    const { container } = render(<LineChart data={series} />);
    expect(container.querySelector(".bbn-line-chart__series")).toBeInTheDocument();
    expect(container.querySelectorAll(".bbn-line-chart__callout")).toHaveLength(0);
  });

  it("renders an empty series without crashing", () => {
    const { container } = render(<LineChart data={[]} />);
    expect(container.querySelector(".bbn-line-chart__series")?.getAttribute("d")).toBe("");
  });
});
