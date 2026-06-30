import { describe, expect, it, vi } from "vitest";

import type {
  BannerState,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";

import { buildBannerActions } from "../BannerActions";

// A healthy position whose on-chain order is suboptimal: the only action is the
// standalone "Apply Optimal Order" reorder CTA.
function makeReorderResult(): CalculatorResult {
  return {
    groups: [],
    currentHF: 1.2,
    collateralValue: 40000,
    targetSeizureBtc: 0.28,
    warnings: [],
    optimalVaultOrder: [
      { id: "0xabc", name: "Vault 2", btc: 0.6 },
      { id: "0xdef", name: "Vault 1", btc: 0.1 },
    ],
    suggestedNewVaultBtc: null,
    suggestedRebalanceVaultBtc: null,
  };
}

const REORDER_BANNER_STATE: BannerState = {
  severity: "soft",
  primaryWarning: null,
  secondaryWarnings: [],
  suggestReorder: true,
};

function buildReorderActions(reorderBlocked: boolean) {
  return buildBannerActions({
    result: makeReorderResult(),
    bannerState: REORDER_BANNER_STATE,
    onDeposit: vi.fn(),
    onRepay: vi.fn(),
    onApplyOrder: vi.fn(),
    isReordering: false,
    reorderBlocked,
  });
}

describe("buildBannerActions — reorder gating", () => {
  it("enables the Apply Optimal Order CTA when reorder is not blocked", () => {
    const actions = buildReorderActions(false);
    const apply = actions.find(
      (a) => a.label === COPY.banner.applyOptimalOrder,
    );
    expect(apply).toBeDefined();
    expect(apply?.disabled).toBe(false);
  });

  it("disables the Apply Optimal Order CTA when Freeze/Pause blocks reorder", () => {
    const actions = buildReorderActions(true);
    const apply = actions.find(
      (a) => a.label === COPY.banner.applyOptimalOrder,
    );
    expect(apply).toBeDefined();
    expect(apply?.disabled).toBe(true);
  });
});
