/**
 * Tests for the critical near-liquidation top banner: it surfaces only at `red`
 * severity, picks the approaching-vs-liquidatable copy from the first group's
 * distance-to-liquidation, and is non-dismissible (no close button).
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CalculatorResult } from "@/applications/aave/positionNotifications";

import {
  CRITICAL_BANNER_SLOT_ID,
  CriticalLiquidationTopBanner,
} from "../CriticalLiquidationTopBanner";

// Minimal CalculatorResult: deriveBannerState keys severity off `warnings`
// (an "urgent" warning ⇒ red) while the banner reads `groups[0].distancePct`.
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
      screen.getByText("Critical — liquidation in 4.3%"),
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
      screen.getByText("Critical — liquidation can trigger now"),
    ).toBeInTheDocument();
  });

  it("renders nothing when severity is not red", () => {
    render(
      <CriticalLiquidationTopBanner
        result={makeResult({ distancePct: -30, urgent: false })}
      />,
    );

    expect(screen.queryByText(/Critical —/)).not.toBeInTheDocument();
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
