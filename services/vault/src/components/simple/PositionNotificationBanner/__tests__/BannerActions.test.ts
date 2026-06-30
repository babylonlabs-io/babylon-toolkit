import { describe, expect, it, vi } from "vitest";

import type {
  BannerState,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";
import { COPY } from "@/copy";

import { buildBannerActions } from "../BannerActions";

function makeResult(
  overrides: Partial<CalculatorResult> = {},
): CalculatorResult {
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
    ...overrides,
  };
}

interface GateOpts {
  reorderBlocked?: boolean;
  depositBlocked?: boolean;
  repayBlocked?: boolean;
}

function build(
  bannerState: BannerState,
  result: CalculatorResult,
  gate: GateOpts = {},
) {
  return buildBannerActions({
    result,
    bannerState,
    onDeposit: vi.fn(),
    onRepay: vi.fn(),
    onApplyOrder: vi.fn(),
    isReordering: false,
    reorderBlocked: gate.reorderBlocked ?? false,
    depositBlocked: gate.depositBlocked ?? false,
    repayBlocked: gate.repayBlocked ?? false,
  });
}

// A healthy position whose on-chain order is suboptimal: the only action is the
// standalone "Apply Optimal Order" reorder CTA.
const REORDER_BANNER_STATE: BannerState = {
  severity: "soft",
  primaryWarning: null,
  secondaryWarnings: [],
  suggestReorder: true,
};

// An urgent (near-liquidation) position: shows "Add Collateral" + "Repay Debt".
const URGENT_BANNER_STATE: BannerState = {
  severity: "red",
  primaryWarning: {
    type: "urgent",
    title: "Liquidation can trigger now",
    detail: "…",
  },
  secondaryWarnings: [],
  suggestReorder: false,
};

describe("buildBannerActions — reorder gating", () => {
  it("enables the Apply Optimal Order CTA when reorder is not blocked", () => {
    const actions = build(REORDER_BANNER_STATE, makeResult());
    const apply = actions.find(
      (a) => a.label === COPY.banner.applyOptimalOrder,
    );
    expect(apply?.disabled).toBe(false);
  });

  it("disables the Apply Optimal Order CTA when Freeze/Pause blocks reorder", () => {
    const actions = build(REORDER_BANNER_STATE, makeResult(), {
      reorderBlocked: true,
    });
    const apply = actions.find(
      (a) => a.label === COPY.banner.applyOptimalOrder,
    );
    expect(apply?.disabled).toBe(true);
  });
});

describe("buildBannerActions — urgent CTA gating", () => {
  it("leaves Add Collateral and Repay Debt enabled when nothing is blocked", () => {
    const actions = build(URGENT_BANNER_STATE, makeResult());
    expect(
      actions.find((a) => a.label === COPY.banner.addCollateral)?.disabled,
    ).toBe(false);
    expect(
      actions.find((a) => a.label === COPY.banner.repayDebt)?.disabled,
    ).toBe(false);
  });

  it("disables Add Collateral when deposits are blocked (protocol Freeze/Pause)", () => {
    const actions = build(URGENT_BANNER_STATE, makeResult(), {
      depositBlocked: true,
    });
    expect(
      actions.find((a) => a.label === COPY.banner.addCollateral)?.disabled,
    ).toBe(true);
    // Repay is independent — an aave pause, not a deposit block, gates it.
    expect(
      actions.find((a) => a.label === COPY.banner.repayDebt)?.disabled,
    ).toBe(false);
  });

  it("disables Repay Debt when repay is blocked (aave Pause)", () => {
    const actions = build(URGENT_BANNER_STATE, makeResult(), {
      repayBlocked: true,
    });
    expect(
      actions.find((a) => a.label === COPY.banner.repayDebt)?.disabled,
    ).toBe(true);
    expect(
      actions.find((a) => a.label === COPY.banner.addCollateral)?.disabled,
    ).toBe(false);
  });

  it("disables the cliff Add-sacrificial-vault CTA when deposits are blocked", () => {
    const cliffState: BannerState = {
      severity: "yellow",
      primaryWarning: {
        type: "cliff",
        title: "First liquidation takes everything",
        detail: "…",
      },
      secondaryWarnings: [],
      suggestReorder: false,
    };
    const cliffResult = makeResult({
      warnings: [
        {
          type: "cliff",
          title: "First liquidation takes everything",
          detail: "…",
        },
      ],
      suggestedNewVaultBtc: 0.14,
    });

    expect(
      build(cliffState, cliffResult).find(
        (a) => a.label === COPY.banner.addSacrificialVault,
      )?.disabled,
    ).toBe(false);

    expect(
      build(cliffState, cliffResult, { depositBlocked: true }).find(
        (a) => a.label === COPY.banner.addSacrificialVault,
      )?.disabled,
    ).toBe(true);
  });
});
