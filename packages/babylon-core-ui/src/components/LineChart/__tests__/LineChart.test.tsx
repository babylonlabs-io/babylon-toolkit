import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLOT_ASPECT_RATIO, Y_AXIS_LABEL_PLOT_GAP_PX } from "../../charts/chartLayout";
import { AXIS_LETTER_SPACING_PX } from "../../charts/textMeasure";
import { LineChart } from "../LineChart";
import type { LineChartHover, LineChartProps } from "../types";

// The chart renders from the deterministic fallback width (see setup.ts):
// chartWidth 1016. None of the tests below pass yTicks, so the y-axis label
// column is empty and the gutter collapses to 0 (see chartLayout.ts) — the
// plot spans the full chart width. jsdom reports a zeroed client rect for the
// hit area, so clientX reads straight through as the plot-local x.
const PLOT_WIDTH = 1016;

// jsdom has no canvas backend; the test canvas stub in setup.ts measures text
// at a fixed 7px per character so gutter-sizing assertions stay exact.
const TEST_CHAR_WIDTH_PX = 7;
function measuredLabelWidth(label: string): number {
  return label.length * TEST_CHAR_WIDTH_PX + label.length * AXIS_LETTER_SPACING_PX;
}

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
 * over 1016px, the quarter marks 254 / 508 / 762 land on 25 / 50 / 75. */
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

    hoverAt(254);

    const hover = onHoverChange.mock.calls.at(-1)?.[0];
    expect(hover?.x).toBeCloseTo(25, 5);
    expect(hover?.y).toBeCloseTo(5, 5);
  });

  it("snaps hover to the closest datum in nearest mode", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ hoverMode: "nearest", onHoverChange });

    hoverAt(254);

    expect(onHoverChange.mock.calls.at(-1)?.[0]).toMatchObject({ x: 0, y: 0, index: 0 });
  });

  it("reports the nearest datum alongside the interpolated value", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    hoverAt(762);

    const hover = onHoverChange.mock.calls.at(-1)?.[0];
    expect(hover?.point).toEqual({ x: 50, y: 10 });
    expect(hover?.y).toBeCloseTo(20, 5);
  });

  it("clears the hover when the mouse leaves", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    hoverAt(508);
    fireEvent.pointerLeave(hitArea(), { pointerType: "mouse" });

    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it("treats a tap as a hover so the readout works without a mouse", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    fireEvent.pointerDown(hitArea(), { clientX: 508, pointerType: "touch" });

    expect(onHoverChange.mock.calls.at(-1)?.[0]?.x).toBeCloseTo(50, 5);
  });

  it("keeps the tapped readout when the finger lifts", () => {
    // Touch pointers are destroyed on lift, so the browser fires pointerleave
    // straight after pointerup; clearing there would flash the readout away.
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    fireEvent.pointerDown(hitArea(), { clientX: 508, pointerType: "touch" });
    fireEvent.pointerUp(hitArea(), { clientX: 508, pointerType: "touch" });
    fireEvent.pointerLeave(hitArea(), { pointerType: "touch" });

    expect(onHoverChange.mock.calls.at(-1)?.[0]?.x).toBeCloseTo(50, 5);
  });

  it("moves the tapped readout to the next tap", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    fireEvent.pointerDown(hitArea(), { clientX: 254, pointerType: "touch" });
    fireEvent.pointerLeave(hitArea(), { pointerType: "touch" });
    fireEvent.pointerDown(hitArea(), { clientX: 762, pointerType: "touch" });

    expect(onHoverChange.mock.calls.at(-1)?.[0]?.x).toBeCloseTo(75, 5);
  });

  it("clears the readout when a touch interaction is cancelled", () => {
    const onHoverChange = vi.fn<(hover: LineChartHover | null) => void>();
    renderChart({ onHoverChange });

    fireEvent.pointerDown(hitArea(), { clientX: 508, pointerType: "touch" });
    fireEvent.pointerCancel(hitArea(), { pointerType: "touch" });

    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it("renders the caller's tooltip for the hovered position", () => {
    renderChart({ renderTooltip: (hover) => <span>{`value ${hover.y.toFixed(1)}`}</span> });

    hoverAt(508);

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

  it("left-aligns y-axis tick labels flush with the chart's left edge", () => {
    const { container } = renderChart({
      yTicks: [{ value: 0, label: "0%" }, { value: 30, label: "30%" }],
    });

    // No xTicks in this render, so every `.bbn-line-chart__axis-text` is a
    // y-axis label.
    const axisTexts = Array.from(container.querySelectorAll(".bbn-line-chart__axis-text"));
    expect(axisTexts).toHaveLength(2);
    for (const text of axisTexts) {
      expect(text).toHaveAttribute("x", "0");
      expect(text).toHaveAttribute("text-anchor", "start");
    }
  });

  it("sizes the gutter to the widest y-axis label plus the fixed label-to-plot gap", () => {
    const widestLabel = "100.0%";
    const { container } = renderChart({
      yTicks: [{ value: 0, label: "0%" }, { value: 100, label: widestLabel }],
    });

    const expectedGutter = measuredLabelWidth(widestLabel) + Y_AXIS_LABEL_PLOT_GAP_PX;

    // The plot's <Group left={layout.plotLeft}> — axisSide "left" puts
    // plotLeft at the gutter — renders as an SVG translate.
    const plotGroup = container.querySelector("g.visx-group");
    const translateLeft = Number(plotGroup?.getAttribute("transform")?.match(/translate\(([\d.]+),/)?.[1]);
    expect(translateLeft).toBeCloseTo(expectedGutter, 5);

    expect(Number(hitArea().getAttribute("width"))).toBeCloseTo(1016 - expectedGutter, 5);
  });

  it("collapses the gutter to zero and spans the full width when yTicks is empty", () => {
    const { container } = renderChart({ yTicks: [] });

    const plotGroup = container.querySelector("g.visx-group");
    expect(plotGroup?.getAttribute("transform")).toBe("translate(0, 0)");
    expect(Number(hitArea().getAttribute("width"))).toBe(1016);
  });
});
