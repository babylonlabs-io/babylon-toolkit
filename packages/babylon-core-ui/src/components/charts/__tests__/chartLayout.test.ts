import { describe, expect, it } from "vitest";
import { computeChartLayout } from "../chartLayout";

describe("computeChartLayout", () => {
  it("resolves the reference layout at the 1016px design width", () => {
    const layout = computeChartLayout({
      chartWidth: 1016,
      axisSide: "left",
      hasTopLegend: false,
      hasXAxis: false,
    });
    // gutter = clamp(3rem, 7cqi, 4.25rem) = clamp(48, 71.12, 68) = 68.
    expect(layout.gutter).toBe(68);
    expect(layout.plotWidth).toBe(948);
    // plot keeps the 1016/350 aspect ratio.
    expect(layout.plotHeight).toBeCloseTo((948 * 350) / 1016, 6);
    expect(layout.plotLeft).toBe(68);
    expect(layout.plotTop).toBe(0);
    expect(layout.svgHeight).toBeCloseTo(layout.plotHeight, 6);
  });

  it("clamps the gutter and fonts to their floors at narrow widths", () => {
    const layout = computeChartLayout({
      chartWidth: 420,
      axisSide: "left",
      hasTopLegend: false,
      hasXAxis: false,
    });
    expect(layout.gutter).toBe(48); // 3rem floor
    expect(layout.fontAxis).toBe(10); // 0.625rem floor
    expect(layout.fontLabel).toBeCloseTo(11.2, 6); // 0.7rem floor
    expect(layout.fontAmount).toBe(12); // 0.75rem floor
  });

  it("clamps the gutter and fonts to their ceilings at wide widths", () => {
    const layout = computeChartLayout({
      chartWidth: 2400,
      axisSide: "left",
      hasTopLegend: false,
      hasXAxis: false,
    });
    expect(layout.gutter).toBe(68); // 4.25rem ceiling
    expect(layout.fontAxis).toBe(12); // 0.75rem ceiling
    expect(layout.fontLabel).toBe(14); // 0.875rem ceiling
    expect(layout.fontAmount).toBe(16); // 1rem ceiling
  });

  it("puts the plot flush left when the axis sits on the right", () => {
    const layout = computeChartLayout({
      chartWidth: 1016,
      axisSide: "right",
      hasTopLegend: false,
      hasXAxis: false,
    });
    expect(layout.plotLeft).toBe(0);
    expect(layout.plotWidth).toBe(948);
  });

  it("reserves vertical space for the legend and x-axis only when present", () => {
    const bare = computeChartLayout({ chartWidth: 1016, axisSide: "left", hasTopLegend: false, hasXAxis: false });
    const withLegend = computeChartLayout({ chartWidth: 1016, axisSide: "left", hasTopLegend: true, hasXAxis: false });
    const withXAxis = computeChartLayout({ chartWidth: 1016, axisSide: "left", hasTopLegend: false, hasXAxis: true });

    expect(withLegend.legendHeight).toBeGreaterThan(0);
    expect(withLegend.plotTop).toBeGreaterThan(withLegend.legendHeight);
    expect(withLegend.svgHeight).toBeGreaterThan(bare.svgHeight);

    expect(withXAxis.plotTop).toBe(0);
    expect(withXAxis.svgHeight).toBeGreaterThan(bare.svgHeight);
    expect(bare.legendHeight).toBe(0);
  });
});
