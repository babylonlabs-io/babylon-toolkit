import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// core-ui's dist is built in this worktree, so the real LineChart renders;
// only Hint is swapped for a stub that surfaces its `tooltip` prop as text
// (real Hint renders its tooltip via a floating-ui portal on hover, which
// isn't worth exercising here — the card's job is just to pass the right
// copy through).
vi.mock("@babylonlabs-io/core-ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@babylonlabs-io/core-ui")>();
  return {
    ...actual,
    Hint: ({ tooltip }: { tooltip?: React.ReactNode }) => (
      <span data-testid="utilization-rate-hint">{tooltip}</span>
    ),
  };
});

vi.mock("@/applications/aave/hooks", () => ({
  useInterestRateModelCurve: vi.fn(),
}));

import { useInterestRateModelCurve } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import type { IrmCurvePoint } from "@/clients/indexer/aaveIrmClient";
import { COPY } from "@/copy";

import { InterestRateModelCard } from "../InterestRateModelCard";

// The chart renders from the deterministic jsdom fallback width (chartWidth
// 1016), but the y-axis gutter is now measured from the widest rendered tick
// label + a fixed 24px gap (see chartLayout.ts's measureYAxisGutter) rather
// than a fluid clamp — and this repo's test setup, unlike core-ui's own,
// stubs no canvas backend, so the exact gutter isn't a value worth
// hardcoding here. Read the plot width straight off the rendered hit rect
// instead (see `measuredPlotWidth`), which is exactly `layout.plotWidth`.
// The card's own aspectRatio (frame plot box 1070x228, see the brief's D4/C2
// mapping table). Kept in sync with the constant of the same name in
// InterestRateModelCard.tsx.
const CHART_ASPECT_RATIO = 1070 / 228;

const MOCK_KINK_APR = 12;
const MOCK_CURRENT_APR = 9;
const MOCK_MAX_APR = 24;

const MOCK_CURVE: IrmCurvePoint[] = [
  { utilizationPercent: 0, aprPercent: 0 },
  { utilizationPercent: 50, aprPercent: 5 },
  { utilizationPercent: 68, aprPercent: MOCK_CURRENT_APR },
  { utilizationPercent: 80, aprPercent: MOCK_KINK_APR },
  { utilizationPercent: 100, aprPercent: MOCK_MAX_APR },
];

const FULL_HOOK_RESULT = {
  curve: MOCK_CURVE,
  kinkUtilizationPercent: 80,
  maxAprPercent: MOCK_MAX_APR,
  isLoading: false,
  error: null,
};

/** Live figures the page derives from its 60s reserve reads (68% = 6800 BPS). */
const MOCK_UTILIZATION_BPS = 6800;

function makeReserve(
  overrides: Partial<AaveReserveConfig["reserve"]> = {},
): AaveReserveConfig {
  return {
    reserveId: 1n,
    reserve: {
      underlying: "0x0000000000000000000000000000000000000010",
      hub: "0x0000000000000000000000000000000000000003",
      assetId: 0,
      decimals: 6,
      dynamicConfigKey: 0,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: 0,
      collateralFactor: 8000,
      ...overrides,
    },
    token: {
      address: "0x0000000000000000000000000000000000000010",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
  };
}

function renderCard({
  reserveOverrides = {},
  utilizationBps = MOCK_UTILIZATION_BPS,
}: {
  reserveOverrides?: Partial<AaveReserveConfig["reserve"]>;
  utilizationBps?: number | null;
} = {}) {
  return render(
    <InterestRateModelCard
      reserve={makeReserve(reserveOverrides)}
      utilizationBps={utilizationBps}
      symbol="USDC"
    />,
  );
}

function hitArea() {
  return screen.getByTestId("line-chart-hit");
}

/** The rendered plot's width in px — exactly `layout.plotWidth` (see
 * LineChart.tsx's `<Bar className="bbn-line-chart__hit" width={...} />`). */
function measuredPlotWidth(): number {
  return Number(hitArea().getAttribute("width"));
}

describe("InterestRateModelCard", () => {
  it("renders the utilization-rate header caption and value", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    renderCard();

    // Header caption and legend entry share the one copy string.
    expect(
      screen.getAllByText(COPY.marketData.charts.utilizationRateLabel),
    ).toHaveLength(2);
    expect(screen.getByText("68%")).toBeInTheDocument();
  });

  it("shows the utilization-rate info tooltip copy next to the header label", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    renderCard();

    expect(screen.getByTestId("utilization-rate-hint")).toHaveTextContent(
      COPY.marketData.charts.utilizationRateTooltip,
    );
  });

  it("renders the header legend with a dot and label for each series", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard();

    // jsdom doesn't resolve custom properties, so the assertions check the
    // theme-token reference itself (globals.css owns the per-theme values).
    const dots = container.querySelectorAll(".size-3.rounded-full");
    expect(dots).toHaveLength(2);
    expect(dots[0].className).toContain("bg-[color:var(--chart-irm-series)]");
    expect(dots[1].className).toContain("bg-[color:var(--chart-irm-marker)]");
    expect(
      screen.getByText(COPY.marketData.charts.borrowAprLabel),
    ).toBeInTheDocument();
    // The legend's second entry shares the header caption's copy string.
    expect(
      screen.getAllByText(COPY.marketData.charts.utilizationRateLabel).length,
    ).toBeGreaterThan(0);
  });

  it("passes the curve's series color as the legend's token, not the core-ui default implicitly", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard();

    const seriesPath = container.querySelector(".bbn-line-chart__series");
    const seriesGroup = seriesPath?.closest("g");
    expect(seriesGroup?.getAttribute("style")).toContain(
      "--bbn-line-chart-series: var(--chart-irm-series)",
    );
  });

  it("passes markers in kink-first order with the dashed/solid styles and shared marker color", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard();

    const rules = container.querySelectorAll(".bbn-line-chart__rule");
    expect(rules).toHaveLength(2);
    expect(rules[0].classList.contains("bbn-line-chart__rule--dashed")).toBe(
      true,
    );
    expect(rules[1].classList.contains("bbn-line-chart__rule--dashed")).toBe(
      false,
    );

    // Both markers share the design's accent-orange token (D3).
    for (const rule of rules) {
      const group = rule.closest("g");
      expect(group?.getAttribute("style")).toContain(
        "--bbn-line-chart-marker: var(--chart-irm-marker)",
      );
    }

    const titles = Array.from(
      container.querySelectorAll(".bbn-line-chart__callout-title"),
    ).map((el) => el.textContent);
    expect(titles).toEqual(["Optimal (Kink) 80%", "Current 68%"]);
  });

  it("builds callout APR lines from the on-chain kink and current figures", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard();

    const lines = Array.from(
      container.querySelectorAll(".bbn-line-chart__callout-line"),
    ).map((el) => el.textContent);
    // kink apr = 12 (curve sample at utilization 80), current apr = 9.
    expect(lines).toEqual(["APR ~ 12%", "APR ~ 9%"]);
  });

  it("interpolates the current-marker APR between the two neighboring samples", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    // 59% falls between MOCK_CURVE's 50->5 and 68->9 samples:
    // 5 + (59-50)/(68-50) * (9-5) = 7.
    const { container } = renderCard({ utilizationBps: 5900 });

    const titles = Array.from(
      container.querySelectorAll(".bbn-line-chart__callout-title"),
    ).map((el) => el.textContent);
    expect(titles).toEqual(["Optimal (Kink) 80%", "Current 59%"]);

    const lines = Array.from(
      container.querySelectorAll(".bbn-line-chart__callout-line"),
    ).map((el) => el.textContent);
    expect(lines).toEqual(["APR ~ 12%", "APR ~ 7%"]);
  });

  it("scales the y-axis to the on-chain maxAprPercent, not a fixed ceiling", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard();

    const plotHeight = measuredPlotWidth() / CHART_ASPECT_RATIO;
    const dots = container.querySelectorAll(".bbn-line-chart__dot");
    expect(dots).toHaveLength(2);
    // kink dot: apr 12 of max 24 -> halfway up the plot.
    expect(Number(dots[0].getAttribute("cy"))).toBeCloseTo(
      plotHeight * (1 - MOCK_KINK_APR / MOCK_MAX_APR),
      5,
    );
    // current dot: apr 9 of max 24.
    expect(Number(dots[1].getAttribute("cy"))).toBeCloseTo(
      plotHeight * (1 - MOCK_CURRENT_APR / MOCK_MAX_APR),
      5,
    );

    const axisTexts = Array.from(
      container.querySelectorAll(".bbn-line-chart__axis-text"),
    ).map((el) => el.textContent);
    expect(axisTexts).toContain("24%");
    expect(axisTexts).not.toContain("8%");
  });

  it("shows the hovered utilization and interpolated APR in the tooltip", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard();

    // Half the measured plot width lands on utilization 50% (domain [0,100]),
    // an exact curve sample (aprPercent 5), so no interpolation rounding to
    // account for.
    fireEvent.pointerMove(hitArea(), { clientX: measuredPlotWidth() / 2 });

    const tooltip = container.querySelector(".bbn-line-chart__tooltip");
    expect(tooltip?.textContent).toContain("50%");
    expect(tooltip?.textContent).toContain("5%");
  });

  it("renders normally for a paused reserve, with no special casing", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    renderCard({ reserveOverrides: { paused: true } });

    expect(screen.getByText("Optimal (Kink) 80%")).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.marketData.charts.chartUnavailable),
    ).not.toBeInTheDocument();
  });

  it("renders a kink-only chart when the live figures are missing", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue(FULL_HOOK_RESULT);

    const { container } = renderCard({
      utilizationBps: null,
    });

    // The cached curve still charts; only the "Current" marker is withheld.
    expect(container.querySelectorAll(".bbn-line-chart__rule")).toHaveLength(1);
    expect(screen.getByText("Optimal (Kink) 80%")).toBeInTheDocument();
    expect(screen.queryByText("Current 68%")).not.toBeInTheDocument();
    // Header figure degrades to the empty placeholder, never "0%".
    expect(screen.getByText(COPY.common.emptyValue)).toBeInTheDocument();
  });

  it("degrades to a chart with no kink marker when the curve has no exact kink sample", () => {
    // parseIrmPayload rejects such a curve at the fetch boundary, so this is
    // the second line of defence. It must not throw: the nearest boundary is
    // the app-wide one, so a throw here trades the whole app for the global
    // error screen over one missing marker.
    vi.mocked(useInterestRateModelCurve).mockReturnValue({
      ...FULL_HOOK_RESULT,
      kinkUtilizationPercent: 81,
    });

    const { container } = renderCard();

    expect(screen.getByTestId("interest-rate-model-card")).toBeInTheDocument();
    expect(screen.queryByText(/Optimal \(Kink\)/)).not.toBeInTheDocument();
    // The current marker still renders — only the kink rule is dropped.
    expect(container.querySelectorAll(".bbn-line-chart__rule")).toHaveLength(1);
    expect(screen.getByText("Current 68%")).toBeInTheDocument();
  });

  it("shows the unavailable message when the curve is null", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue({
      curve: null,
      kinkUtilizationPercent: null,
      maxAprPercent: null,
      isLoading: false,
      error: new Error("Interest-rate strategy curve read reverted"),
    });

    const { container } = renderCard();

    expect(
      screen.getByText(COPY.marketData.charts.chartUnavailable),
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("shows the unavailable message for an all-zero rate shape instead of a degenerate [0, 0] scale", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue({
      ...FULL_HOOK_RESULT,
      maxAprPercent: 0,
    });

    const { container } = renderCard();

    expect(
      screen.getByText(COPY.marketData.charts.chartUnavailable),
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("shows the loading message while the hook is loading", () => {
    vi.mocked(useInterestRateModelCurve).mockReturnValue({
      curve: null,
      kinkUtilizationPercent: null,
      maxAprPercent: null,
      isLoading: true,
      error: null,
    });

    renderCard();

    expect(screen.getByText(COPY.common.loading)).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.marketData.charts.chartUnavailable),
    ).not.toBeInTheDocument();
  });
});
