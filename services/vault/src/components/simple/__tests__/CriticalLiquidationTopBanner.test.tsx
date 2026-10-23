/**
 * Tests for the critical near-liquidation top banner: it surfaces only at `red`
 * severity, picks the approaching-vs-liquidatable copy from the first group's
 * distance-to-liquidation when the calculator's own warning made it red, shows
 * the live health-factor warning when that warning made it red, and is
 * non-dismissible (no close button).
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  CalculatorResult,
  Warning,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";

import {
  CRITICAL_BANNER_SLOT_ID,
  CriticalLiquidationTopBanner,
} from "../CriticalLiquidationTopBanner";

// Minimal CalculatorResult: deriveBannerState keys severity off `warnings`
// (an "urgent" warning ⇒ red) while the banner reads `groups[0].distancePct`
// for the calculator's own urgency.
function makeResult({
  distancePct,
  urgent,
}: {
  distancePct: number;
  urgent: boolean;
}): CalculatorResult {
  return {
    groups: [
      {
        index: 0,
        vaults: [],
        combinedBtc: 1,
        liquidationPrice: 80621,
        distancePct,
        targetSeizureBtc: 0,
        overSeizureBtc: 0,
        isFullLiquidation: false,
        debtToRepay: 0,
        liquidatorProfitUsd: 0,
        debtRepaid: 0,
        fairnessDebtRepay: 0,
        fairnessPaymentUsd: 0,
        debtRemainingAfter: 0,
        btcRemainingAfter: 0,
      },
    ],
    currentHF: 1.1,
    collateralValue: 100000,
    targetSeizureBtc: 0,
    warnings: urgent ? [{ type: "urgent", title: "x", detail: "y" }] : [],
    optimalVaultOrder: null,
    suggestedNewVaultBtc: null,
  };
}

describe("CriticalLiquidationTopBanner", () => {
  beforeEach(() => {
    const slot = document.createElement("div");
    slot.id = CRITICAL_BANNER_SLOT_ID;
    document.body.appendChild(slot);
  });

  afterEach(() => {
    document.getElementById(CRITICAL_BANNER_SLOT_ID)?.remove();
  });

  it("shows the remaining distance when approaching liquidation (negative distancePct)", () => {
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: -4.3, urgent: true })}
      />,
    );

    expect(
      screen.getByText("Critical: liquidation in 4.3%"),
    ).toBeInTheDocument();
  });

  it("exposes the banner as an alert for assistive tech", () => {
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: -4.3, urgent: true })}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows the imminent message when already liquidatable (distancePct >= 0)", () => {
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: 1.2, urgent: true })}
      />,
    );

    expect(
      screen.getByText("Critical: liquidation can trigger now"),
    ).toBeInTheDocument();
  });

  it("renders nothing when severity is not red", () => {
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: -30, urgent: false })}
      />,
    );

    expect(screen.queryByText(/Critical:/)).not.toBeInTheDocument();
  });

  it("shows live health-factor risk without a calculated liquidation distance", () => {
    const title = COPY.liquidationWarnings.liveHealthFactor.title("1.05");
    render(
      <CriticalLiquidationTopBanner
        result={null}
        liveUrgentWarning={{
          type: "urgent",
          title,
          detail: COPY.liquidationWarnings.liveHealthFactor.detail,
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(title);
    expect(
      screen.queryByText(COPY.topBanner.liquidatable),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the live health-factor title instead of the calculated distance when the live warning made it red", () => {
    const liveWarning: Warning = {
      type: "urgent",
      title: COPY.liquidationWarnings.liveHealthFactor.title("1.00"),
      detail: COPY.liquidationWarnings.liveHealthFactor.detail,
    };
    // The calculator still sees a 9.1% buffer and raised nothing urgent, so the
    // hook put the live warning object itself into the result's warnings.
    const result: CalculatorResult = {
      ...makeResult({ distancePct: -9.1, urgent: false }),
      warnings: [liveWarning],
    };

    render(
      <CriticalLiquidationTopBanner
        result={result}
        liveUrgentWarning={liveWarning}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Critical - health factor 1.00",
    );
    expect(screen.queryByText(/Critical: liquidation/)).not.toBeInTheDocument();
  });

  it("shows the live health-factor title on a dust position the live warning made red", () => {
    const liveWarning: Warning = {
      type: "urgent",
      title: COPY.liquidationWarnings.liveHealthFactor.title("0.98"),
      detail: COPY.liquidationWarnings.liveHealthFactor.detail,
    };
    const result: CalculatorResult = {
      ...makeResult({ distancePct: -30, urgent: false }),
      warnings: [liveWarning, { type: "dust", title: "x", detail: "y" }],
    };

    render(
      <CriticalLiquidationTopBanner
        result={result}
        liveUrgentWarning={liveWarning}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Critical - health factor 0.98",
    );
    expect(screen.queryByText(/Critical: liquidation/)).not.toBeInTheDocument();
  });

  it("keeps the calculated distance when the calculator's own urgent warning made it red, even with a live warning present", () => {
    // The hook adds no live warning to the result when the calculator is
    // already urgent and the live health factor is not below 1.0, so the live
    // warning is a separate object here.
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: -4.3, urgent: true })}
        liveUrgentWarning={{
          type: "urgent",
          title: COPY.liquidationWarnings.liveHealthFactor.title("1.03"),
          detail: COPY.liquidationWarnings.liveHealthFactor.detail,
        }}
      />,
    );

    expect(
      screen.getByText("Critical: liquidation in 4.3%"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Critical - health factor 1.03"),
    ).not.toBeInTheDocument();
  });

  it("is non-dismissible — renders no close button", () => {
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: -4.3, urgent: true })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Dismiss banner" }),
    ).not.toBeInTheDocument();
  });
});
