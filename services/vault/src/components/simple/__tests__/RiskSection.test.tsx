import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  computeRailLayout,
  getRiskDisplayState,
  spreadLabelCenters,
} from "../RiskSection/railLayout";
import { RiskSection } from "../RiskSection/RiskSection";

vi.mock("@/components/shared", () => ({
  HeartIcon: () => null,
}));

function renderSection(overrides: Record<string, unknown> = {}) {
  return render(
    <RiskSection
      healthFactor={2.1}
      healthFactorStatus="safe"
      hasPosition={true}
      liquidationPriceText="$77,600"
      btcPriceText="$88,400"
      pctToLiquidationText="12.2%"
      collateralFactorText="78%"
      btcPriceUsd={88400}
      liquidationPriceUsd={77600}
      {...overrides}
    />,
  );
}

describe("getRiskDisplayState", () => {
  it("returns noPosition regardless of status when there is no position", () => {
    expect(getRiskDisplayState("danger", 0.9, false)).toBe("noPosition");
    expect(getRiskDisplayState("safe", 2, false)).toBe("noPosition");
  });

  it("maps no_debt to verySafe", () => {
    expect(getRiskDisplayState("no_debt", null, true)).toBe("verySafe");
  });

  it("treats a safe status above the healthy threshold as verySafe", () => {
    expect(getRiskDisplayState("safe", 60, true)).toBe("verySafe");
    expect(getRiskDisplayState("safe", null, true)).toBe("verySafe");
    expect(getRiskDisplayState("safe", Infinity, true)).toBe("verySafe");
  });

  it("keeps a bounded safe status as safe", () => {
    expect(getRiskDisplayState("safe", 2.1, true)).toBe("safe");
  });

  it("maps warning to moderate and danger to liquidatable", () => {
    expect(getRiskDisplayState("warning", 1.14, true)).toBe("moderate");
    expect(getRiskDisplayState("danger", 0.94, true)).toBe("liquidatable");
  });
});

describe("RiskSection rendering", () => {
  it("renders the no-position state with an empty HF value and no liquidation math", () => {
    const { container } = renderSection({
      hasPosition: false,
      healthFactor: null,
      healthFactorStatus: "safe",
      liquidationPriceText: COPY.common.emptyValue,
      liquidationPriceUsd: null,
    });

    expect(screen.getByText(COPY.risk.status.noPosition)).toBeInTheDocument();
    expect(screen.getAllByText(COPY.common.emptyValue).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByText(COPY.overview.pctToLiquidationLabel),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("renders the very-safe state with the infinity glyph and the passed liquidation placeholder", () => {
    renderSection({
      healthFactorStatus: "no_debt",
      healthFactor: null,
      liquidationPriceText: COPY.common.emptyValue,
      liquidationPriceUsd: null,
    });

    expect(screen.getByText(COPY.risk.status.verySafe)).toBeInTheDocument();
    expect(
      screen.getByText(COPY.risk.healthFactorInfinity),
    ).toBeInTheDocument();
    // Liquidation BTC Price cell renders the passed placeholder.
    const liqCell = screen
      .getByText(COPY.risk.liquidationBtcPriceLabel)
      .closest("div");
    expect(liqCell).not.toBeNull();
    expect(
      within(liqCell as HTMLElement).getByText(COPY.common.emptyValue),
    ).toBeInTheDocument();
  });

  it("renders the moderate state with both price markers and the bracket", () => {
    renderSection({
      healthFactorStatus: "warning",
      healthFactor: 1.14,
    });

    expect(screen.getByText(COPY.risk.status.moderate)).toBeInTheDocument();
    expect(
      screen.getByText(COPY.risk.chart.liquidationPriceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.risk.chart.currentPriceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.overview.pctToLiquidationLabel),
    ).toBeInTheDocument();
    expect(screen.getByText("12.2%")).toBeInTheDocument();
  });

  it("orders the current marker left of the liquidation marker when liquidatable", () => {
    renderSection({
      healthFactorStatus: "danger",
      healthFactor: 0.94,
      btcPriceUsd: 88400,
      liquidationPriceUsd: 94000,
      liquidationPriceText: "$94,000",
    });

    expect(screen.getByText(COPY.risk.status.liquidatable)).toBeInTheDocument();

    const currentLeft = parseFloat(
      screen.getByTestId("risk-marker-current").style.left,
    );
    const liquidationLeft = parseFloat(
      screen.getByTestId("risk-marker-liquidation").style.left,
    );
    expect(currentLeft).toBeLessThan(liquidationLeft);
  });

  it("renders the three stat labels, their values, and the collateral-factor tooltip label", () => {
    renderSection();

    expect(
      screen.getByText(COPY.risk.liquidationBtcPriceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.risk.currentBtcPriceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.risk.collateralFactorLabel),
    ).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
  });
});

describe("computeRailLayout", () => {
  it("builds the ±20% window with a nice tick step for the Figma example", () => {
    const layout = computeRailLayout(88400, 77600);
    expect(layout.lo).toBeCloseTo(70720, 0);
    expect(layout.hi).toBeCloseTo(106080, 0);
    // Step of 5000 → ticks from 75k through 105k.
    expect(layout.ticks[0]).toBe(75000);
    expect(layout.ticks[layout.ticks.length - 1]).toBe(105000);
    expect(layout.ticks[1] - layout.ticks[0]).toBe(5000);
  });

  it("expands the window downward when liquidation sits far below the current price", () => {
    const layout = computeRailLayout(88400, 40000);
    expect(layout.lo).toBeLessThanOrEqual(38800);
  });

  it("orders the current percent below the liquidation percent when current < liquidation", () => {
    const layout = computeRailLayout(88400, 94000);
    expect(layout.currentPct).not.toBeNull();
    expect(layout.liquidationPct).not.toBeNull();
    expect(layout.currentPct as number).toBeLessThan(
      layout.liquidationPct as number,
    );
  });

  it("returns null positions when the current price is unavailable", () => {
    const layout = computeRailLayout(null, 77600);
    expect(layout.currentPct).toBeNull();
    expect(layout.liquidationPct).toBeNull();
    expect(layout.gradient).toBeNull();
  });

  it("produces no gradient when there is no liquidation price", () => {
    const layout = computeRailLayout(88400, null);
    expect(layout.currentPct).not.toBeNull();
    expect(layout.liquidationPct).toBeNull();
    expect(layout.gradient).toBeNull();
  });
});

describe("spreadLabelCenters", () => {
  const LABEL = 112;
  const HALF = LABEL / 2;

  it("pushes overlapping labels to a full-label separation within the rail at 400px", () => {
    const { current, liquidation } = spreadLabelCenters(50, 55, 400, LABEL);
    expect(current).toBeLessThan(liquidation);
    expect(liquidation - current).toBeGreaterThanOrEqual(LABEL - 0.001);
    for (const c of [current, liquidation]) {
      expect(c).toBeGreaterThanOrEqual(HALF - 0.001);
      expect(c).toBeLessThanOrEqual(400 - HALF + 0.001);
    }
  });

  it("keeps a near-edge label at least half its width from the edge, order preserved", () => {
    const { current, liquidation } = spreadLabelCenters(1, 90, 400, LABEL);
    expect(current).toBeGreaterThanOrEqual(HALF - 0.001);
    expect(liquidation).toBeLessThanOrEqual(400 - HALF + 0.001);
    expect(current).toBeLessThan(liquidation);
  });

  it("preserves current-right ordering and separation on the 460px desktop rail", () => {
    const { current, liquidation } = spreadLabelCenters(
      54.6,
      45.25,
      460,
      LABEL,
    );
    expect(current).toBeGreaterThan(liquidation);
    expect(current - liquidation).toBeGreaterThanOrEqual(LABEL - 0.001);
    for (const c of [current, liquidation]) {
      expect(c).toBeGreaterThanOrEqual(HALF - 0.001);
      expect(c).toBeLessThanOrEqual(460 - HALF + 0.001);
    }
  });

  it("clamps both labels inside the rail when both sit near the right edge", () => {
    const { current, liquidation } = spreadLabelCenters(95, 98, 400, LABEL);
    for (const c of [current, liquidation]) {
      expect(c).toBeLessThanOrEqual(400 - HALF + 0.001);
      expect(c).toBeGreaterThanOrEqual(HALF - 0.001);
    }
    expect(liquidation - current).toBeGreaterThanOrEqual(LABEL - 0.001);
  });
});
