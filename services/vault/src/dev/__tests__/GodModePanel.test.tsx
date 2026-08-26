import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActionStatus } from "@/components/deposit/actionStatus";
import { COPY } from "@/copy";
import { ContractStatus, PeginAction } from "@/models/peginStateMachine";

import {
  useDebugManualMode,
  useDebugProtocolStatusOverride,
} from "../debugPositionStore";
import {
  ACTIVATED_SCENARIO_INDEX,
  ACTIVATION_CONFIRMING_SCENARIO_INDEX,
  activityScenarios,
  buildActivitiesDemo,
  buildCollateralsDemo,
  buildDepositsDemo,
  buildLoansDemo,
  COLLATERAL_SCENARIOS,
  type DemoBorrowSymbol,
  type DemoItem,
  DEPOSIT_SCENARIOS,
  getDemoStepperBatch,
  loanScenarios,
  READY_TO_ACTIVATE_SCENARIO_INDEX,
  resetDemoState,
  setDemoBorrowSymbol,
  setDemoItemState,
  submitDemoVaultActivation,
  useDemoBorrowSymbol,
  useDemoItems,
} from "../demoDeposit";
import { GodModePanel } from "../GodModePanel";
import { useLiquidationDebugState } from "../liquidationDebugStore";
import { DEV_PANEL_TABS, type DevPanelTab } from "../registry";

const mockSetTheme = vi.hoisted(() => vi.fn());
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: mockSetTheme }),
}));

// Every registered tab mounts at once while the panel is expanded (see
// GodModePanel's header comment), so the Position/Liquidations tabs' shared
// cascade simulator needs a wallet + live-hook stub even in tests that never
// click into those tabs.
vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: undefined }),
}));
vi.mock("@/applications/aave/hooks/usePositionNotifications", () => ({
  usePositionNotifications: () => ({ result: null, status: "no-wallet" }),
}));

const featureFlagsMock = vi.hoisted(() => ({
  isGodModePanelEnabled: true,
  isLiquidationNotificationsEnabled: true,
  isPositionDebugPanelEnabled: true,
}));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

/** Default borrowed-asset symbol — matches the store's default, so tests that
 *  don't exercise the selector see the same scenario shape as before. */
const TEST_SYMBOL: DemoBorrowSymbol = "USDC";

/** First DEPOSIT_SCENARIOS index whose built polling result exposes `action`. */
function scenarioIndexWithAction(action: PeginAction): number {
  const index = DEPOSIT_SCENARIOS.findIndex((_, i) => {
    const [result] = [
      ...buildDepositsDemo([depositItem(1, i)], false).resultsById.values(),
    ];
    return result.peginState.availableActions.includes(action);
  });
  if (index === -1) throw new Error(`No demo scenario exposes ${action}`);
  return index;
}

function depositItem(
  key: number,
  stateIndex: number,
  batched = false,
  amount = "0.0375",
): DemoItem {
  return { key, type: "deposit", stateIndex, amount, batched };
}

function loanItem(key: number, stateIndex: number, amount: string): DemoItem {
  return { key, type: "loan", stateIndex, amount, batched: false };
}

function activityItem(
  key: number,
  stateIndex: number,
  amount = "0.5",
): DemoItem {
  return { key, type: "activity", stateIndex, amount, batched: false };
}

describe("demoDeposit builders", () => {
  it("annotates every deposit scenario's CTA to match the real getActionStatus", () => {
    // expectedCta must agree with what the production action-status logic
    // produces, so the gallery can't silently drift.
    DEPOSIT_SCENARIOS.forEach((scenario, i) => {
      const demo = buildDepositsDemo([depositItem(i + 1, i)], false);
      const [result] = [...demo.resultsById.values()];
      const status = getActionStatus(result);
      const expected =
        status.type !== "available"
          ? "none"
          : status.action.label === COPY.pegin.primaryAction.REFUND_HTLC
            ? "outlined"
            : "primary";
      expect(scenario.expectedCta).toBe(expected);
    });
  });

  it("mocks several deposits at once, routed by contract status", () => {
    const expiredIndex = DEPOSIT_SCENARIOS.findIndex(
      (s) => s.contractStatus === ContractStatus.EXPIRED,
    );
    const demo = buildDepositsDemo(
      [depositItem(1, 0), depositItem(2, 6), depositItem(3, expiredIndex)],
      false,
    );
    // Two pending steps + one expired → routed into the right lists.
    expect(demo.pendingActivities).toHaveLength(2);
    expect(demo.expiredActivities).toHaveLength(1);
    expect(demo.resultsById.size).toBe(3);
    // Distinct ids per item.
    const ids = demo.pendingActivities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups batched deposits under one shared Pre-Pegin", () => {
    const demo = buildDepositsDemo(
      [
        depositItem(1, 0, true),
        depositItem(2, 6, true),
        depositItem(3, 4, false),
      ],
      false,
    );
    const [a, b, c] = demo.pendingActivities;
    expect(a.unsignedPrePeginTx).toBe(b.unsignedPrePeginTx);
    expect(a.unsignedPrePeginTx).not.toBe("");
    // The non-batched one stays standalone.
    expect(c.unsignedPrePeginTx).toBe("");
  });

  it("applies per-item amount and hide-real across the section builders", () => {
    const deposits = buildDepositsDemo(
      [depositItem(1, 0, false, "1.2345")],
      true,
    );
    expect(deposits.pendingActivities[0].collateral.amount).toBe("1.2345");
    expect(deposits.hideReal).toBe(true);

    const collateral = buildCollateralsDemo(
      [
        {
          key: 3,
          type: "collateral",
          stateIndex: 1,
          amount: "2",
          batched: false,
        },
      ],
      true,
    );
    expect(collateral.vaults[0].amountBtc).toBe(2);
    expect(collateral.vaults[0].inUse).toBe(true);
  });

  it("builds loan rows the v3 Loans page can render, every one action-inert", () => {
    const scenarios = loanScenarios(TEST_SYMBOL);
    const borrowable = scenarios.findIndex((s) => s.isBorrowable);
    const repayOnly = scenarios.findIndex((s) => !s.isBorrowable);
    const demo = buildLoansDemo(
      [loanItem(1, borrowable, "1500"), loanItem(2, repayOnly, "500")],
      false,
      TEST_SYMBOL,
    );

    expect(demo.rows.map((row) => row.amount)).toEqual(["1500", "500"]);
    expect(demo.rows.map((row) => row.isBorrowable)).toEqual([true, false]);
    // The summary totals the rendered rows, so the mock debt must add up.
    expect(demo.debtUsd).toBe(2000);
    // Safety: a mock row must never reach the real borrow/repay overlay.
    expect(demo.rows.every((row) => row.displayOnly)).toBe(true);
    // Distinct, non-numeric ids that cannot collide with a real reserveId.
    expect(new Set(demo.rows.map((row) => row.reserveId)).size).toBe(2);
    expect(demo.rows.every((row) => Number.isNaN(Number(row.reserveId)))).toBe(
      true,
    );
  });

  it("drops the liquidity and APR reads for the scenarios that mock them missing", () => {
    const scenarios = loanScenarios(TEST_SYMBOL);
    const noLiquidity = scenarios.findIndex((s) => !s.hasLiquidity);
    const noRate = scenarios.findIndex((s) => !s.hasBorrowRate);

    const [liquidityRow] = buildLoansDemo(
      [loanItem(1, noLiquidity, "100")],
      false,
      TEST_SYMBOL,
    ).rows;
    expect(liquidityRow.availableLiquidity).toBeNull();
    expect(liquidityRow.utilizationBps).toBeNull();

    const [rateRow] = buildLoansDemo(
      [loanItem(2, noRate, "100")],
      false,
      TEST_SYMBOL,
    ).rows;
    expect(rateRow.borrowRate).toBeUndefined();
  });

  it("ignores items of other types when building the loan rows", () => {
    const demo = buildLoansDemo(
      [depositItem(1, 0), loanItem(2, 0, "10")],
      true,
      TEST_SYMBOL,
    );
    expect(demo.rows).toHaveLength(1);
    expect(demo.hideReal).toBe(true);
  });

  it("denominates loan rows in whichever asset the panel selects", () => {
    const usdc = buildLoansDemo([loanItem(1, 0, "100")], false, "USDC").rows;
    const dai = buildLoansDemo([loanItem(1, 0, "100")], false, "DAI").rows;
    expect(usdc[0].symbol).toBe("USDC");
    expect(dai[0].symbol).toBe("DAI");
  });

  it("builds one activity row per mock, covering both row kinds", () => {
    const groupIndex = activityScenarios(TEST_SYMBOL).findIndex((s) =>
      s.key.startsWith("act-liquidation"),
    );
    const demo = buildActivitiesDemo(
      [activityItem(1, 0, "0.25"), activityItem(2, groupIndex, "0.75")],
      false,
      TEST_SYMBOL,
    );

    expect(demo.rows).toHaveLength(2);
    expect(demo.rows[0].kind).toBe("row");
    // The liquidation scenarios render as the expandable group card, which is a
    // different component — the builder must emit that shape, not a flat row.
    expect(demo.rows[1].kind).toBe("liquidationGroup");
    // Distinct, non-indexer ids so a mock can never collide with a real event.
    expect(new Set(demo.rows.map((row) => row.id)).size).toBe(2);
    expect(demo.rows.every((row) => row.id.startsWith("demo-activity-"))).toBe(
      true,
    );
  });

  // Fake timers, not a tolerance around a real clock: the builder reads
  // `Date.now()` itself, so comparing against a timestamp captured in the test
  // is a race — it went fractionally negative on CI.
  it("dates activity mocks relative to now so the date-group headers apply", () => {
    const fixedNow = new Date("2026-03-15T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      for (const [index, scenario] of activityScenarios(
        TEST_SYMBOL,
      ).entries()) {
        const [row] = buildActivitiesDemo(
          [activityItem(index + 1, index)],
          false,
          TEST_SYMBOL,
        ).rows;
        expect(row.date.getTime()).toBe(
          fixedNow.getTime() - scenario.daysAgo * 24 * 60 * 60 * 1000,
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression: borrow / repay rows used to hard-code their debt figure, so
  // the panel's amount control was inert for exactly those two scenarios.
  it("drives every activity scenario's headline amount from the item", () => {
    for (const [index, scenario] of activityScenarios(TEST_SYMBOL).entries()) {
      const [row] = buildActivitiesDemo(
        [activityItem(index + 1, index, "3.5")],
        false,
        TEST_SYMBOL,
      ).rows;
      const shown =
        row.kind === "liquidationGroup" ? row.summary.collateral : row.amount;
      expect(shown.value).toBe("3.5");
      expect(shown.symbol).toBe(scenario.unit);
    }
  });

  it("denominates debt-typed activity rows in whichever asset the panel selects", () => {
    const borrowIndex = activityScenarios(TEST_SYMBOL).findIndex(
      (s) => s.key === "act-borrow",
    );
    const usdcRow = buildActivitiesDemo(
      [activityItem(1, borrowIndex, "50")],
      false,
      "USDC",
    ).rows[0];
    const wethRow = buildActivitiesDemo(
      [activityItem(1, borrowIndex, "50")],
      false,
      "WETH",
    ).rows[0];
    if (usdcRow.kind !== "row" || wethRow.kind !== "row") {
      throw new Error("expected a flat activity row for act-borrow");
    }
    expect(usdcRow.amount.symbol).toBe("USDC");
    expect(wethRow.amount.symbol).toBe("WETH");
  });

  it("ignores items of other types when building the activity feed", () => {
    const demo = buildActivitiesDemo(
      [depositItem(1, 0), activityItem(2, 0)],
      true,
      TEST_SYMBOL,
    );
    expect(demo.rows).toHaveLength(1);
    expect(demo.hideReal).toBe(true);
  });

  it("supports different amounts per item", () => {
    const demo = buildDepositsDemo(
      [depositItem(1, 0, false, "0.1"), depositItem(2, 0, false, "0.9")],
      false,
    );
    expect(demo.pendingActivities.map((a) => a.collateral.amount)).toEqual([
      "0.1",
      "0.9",
    ]);
  });
});

describe("getDemoStepperBatch", () => {
  const expiredIndex = DEPOSIT_SCENARIOS.findIndex(
    (s) => s.contractStatus === ContractStatus.EXPIRED,
  );
  const unownedIndex = DEPOSIT_SCENARIOS.findIndex(
    (s) => s.key === "unowned-disabled",
  );

  it("opens the multistepper for a ready-to-activate demo deposit", () => {
    const demo = buildDepositsDemo(
      [depositItem(1, READY_TO_ACTIVATE_SCENARIO_INDEX)],
      false,
    );
    const id = demo.pendingActivities[0].id;
    expect(getDemoStepperBatch(demo, id)).toEqual([id]);
  });

  it("opens for an already-activated demo deposit (shows the success screen)", () => {
    const demo = buildDepositsDemo(
      [depositItem(1, ACTIVATED_SCENARIO_INDEX)],
      false,
    );
    const id = demo.pendingActivities[0].id;
    expect(getDemoStepperBatch(demo, id)).toEqual([id]);
  });

  it("opens for a mid-flow demo deposit so the whole flow can be walked", () => {
    // A non-activation flow step (WOTS) now opens read-only, not just activation.
    const wotsIndex = scenarioIndexWithAction(PeginAction.SUBMIT_WOTS_KEY);
    const demo = buildDepositsDemo([depositItem(1, wotsIndex)], false);
    const id = demo.pendingActivities[0].id;
    expect(getDemoStepperBatch(demo, id)).toEqual([id]);
  });

  it("opens the whole owned batch for batched flow siblings", () => {
    const wotsIndex = scenarioIndexWithAction(PeginAction.SUBMIT_WOTS_KEY);
    const demo = buildDepositsDemo(
      [
        depositItem(1, READY_TO_ACTIVATE_SCENARIO_INDEX, true),
        depositItem(2, wotsIndex, true),
      ],
      false,
    );
    const ids = demo.pendingActivities.map((a) => a.id);
    expect(getDemoStepperBatch(demo, ids[0])).toEqual(ids);
  });

  it("stays inert for a different-wallet (unowned) demo deposit", () => {
    const demo = buildDepositsDemo([depositItem(1, unownedIndex)], false);
    const id = demo.pendingActivities[0].id;
    expect(getDemoStepperBatch(demo, id)).toBeNull();
  });

  it("stays inert for an expired demo deposit (not in the pending list)", () => {
    const demo = buildDepositsDemo([depositItem(1, expiredIndex)], false);
    const id = demo.expiredActivities[0].id;
    expect(getDemoStepperBatch(demo, id)).toBeNull();
  });

  it("returns null for a null demo or an unknown id", () => {
    expect(getDemoStepperBatch(null, "0xdeadbeef")).toBeNull();
    const demo = buildDepositsDemo(
      [depositItem(1, READY_TO_ACTIVATE_SCENARIO_INDEX)],
      false,
    );
    expect(getDemoStepperBatch(demo, "0xunknown")).toBeNull();
  });
});

describe("submitDemoVaultActivation", () => {
  beforeEach(() => {
    resetDemoState();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks a ready-to-activate demo vault through confirming then active", () => {
    const { result } = renderHook(() => useDemoItems());
    const key = result.current[0].key;
    act(() => setDemoItemState(key, READY_TO_ACTIVATE_SCENARIO_INDEX));
    const vaultId = buildDepositsDemo(result.current, false)
      .pendingActivities[0].id;

    act(() => submitDemoVaultActivation(vaultId));
    // Immediately reflects the optimistic "activation submitted" state.
    expect(result.current[0].stateIndex).toBe(
      ACTIVATION_CONFIRMING_SCENARIO_INDEX,
    );

    act(() => vi.advanceTimersByTime(5000));
    // After the simulated confirmation delay it reaches the ACTIVE terminal.
    expect(result.current[0].stateIndex).toBe(ACTIVATED_SCENARIO_INDEX);
  });

  it("no-ops for a demo vault that is not at the ready-to-activate state", () => {
    const { result } = renderHook(() => useDemoItems());
    const vaultId = buildDepositsDemo(result.current, false)
      .pendingActivities[0].id;
    const before = result.current[0].stateIndex;

    act(() => submitDemoVaultActivation(vaultId));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current[0].stateIndex).toBe(before);
  });
});

// The panel starts collapsed (small launcher, bottom-right); expand it to
// reach the controls. Every registered tab mounts at once (hidden via the
// `hidden` attribute) once expanded, so a test that wants a specific tab's
// controls must click its rail button first — see `clickTab`.
function renderExpanded(registry: DevPanelTab[] = DEV_PANEL_TABS) {
  render(<GodModePanel registry={registry} />);
  fireEvent.click(screen.getByRole("button", { name: "God mode" }));
}

function clickTab(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("GodModePanel", () => {
  beforeEach(() => {
    resetDemoState();
  });

  it("starts collapsed and toggles open/closed", () => {
    render(<GodModePanel registry={DEV_PANEL_TABS} />);
    // Collapsed by default: only the launcher shows.
    expect(
      screen.queryByRole("button", { name: "Pop out ↗" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "God mode" }));
    expect(
      screen.getByRole("button", { name: "Pop out ↗" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(
      screen.getByRole("button", { name: "God mode" }),
    ).toBeInTheDocument();
  });

  it("renders every registered tab as a rail button", () => {
    renderExpanded();
    for (const tab of DEV_PANEL_TABS) {
      expect(
        screen.getByRole("button", { name: tab.label }),
      ).toBeInTheDocument();
    }
  });

  it("hides a tab whose gate returns false", () => {
    const fakeRegistry: DevPanelTab[] = [
      {
        id: "always",
        label: "Always",
        Component: () => <div>always-content</div>,
      },
      {
        id: "gated",
        label: "Gated",
        Component: () => <div>gated-content</div>,
        gate: () => false,
      },
    ];
    renderExpanded(fakeRegistry);

    expect(screen.getByRole("button", { name: "Always" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gated" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("gated-content")).not.toBeInTheDocument();
  });

  it("renders a default deposit mock", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");
    const type = screen.getByRole("combobox", { name: "Mock 1 type" });
    expect(type).toHaveValue("deposit");
    expect(
      screen.getByRole("combobox", { name: "Mock 1 mode" }),
    ).toBeInTheDocument();
    // The current-state readout shows the first flow step's label.
    expect(screen.getByText(DEPOSIT_SCENARIOS[0].label)).toBeInTheDocument();
  });

  it("switches the app theme from the panel", () => {
    renderExpanded();
    clickTab("Global");
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("adds and removes mocks", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    fireEvent.click(screen.getByRole("button", { name: "+ Add mock" }));
    expect(
      screen.getByRole("combobox", { name: "Mock 2 type" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove mock 2" }));
    expect(
      screen.queryByRole("combobox", { name: "Mock 2 type" }),
    ).not.toBeInTheDocument();
  });

  it("switches a mock to a loan and re-labels its amount in the borrowed asset", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 type" }), {
      target: { value: "loan" },
    });

    expect(
      screen.getByText(loanScenarios(TEST_SYMBOL)[0].label),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Mock 1 amount (USDC)" }),
    ).toBeInTheDocument();
  });

  it("switches a mock to an activity row and shows that type's states", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 type" }), {
      target: { value: "activity" },
    });

    expect(
      screen.getByText(activityScenarios(TEST_SYMBOL)[0].label),
    ).toBeInTheDocument();
  });

  // The amount field must name the unit of the value the selected scenario
  // actually renders — activity rows are not uniformly BTC.
  it("re-labels the amount field per activity scenario denomination", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");
    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 type" }), {
      target: { value: "activity" },
    });

    // Two scenarios with different denominations — the field must follow the
    // selected one, whatever the network's collateral symbol happens to be.
    const scenarios = activityScenarios(TEST_SYMBOL);
    const collateralUnit = scenarios[0].unit;
    const debtIndex = scenarios.findIndex((s) => s.unit !== collateralUnit);
    const slider = screen.getByRole("slider", { name: "Mock 1 step" });

    fireEvent.change(slider, { target: { value: "0" } });
    expect(
      screen.getByRole("spinbutton", {
        name: `Mock 1 amount (${collateralUnit})`,
      }),
    ).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: String(debtIndex) } });
    expect(
      screen.getByRole("spinbutton", {
        name: `Mock 1 amount (${scenarios[debtIndex].unit})`,
      }),
    ).toBeInTheDocument();
  });

  it("changes the borrowed asset from the Mocks section and relabels the loan amount field", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");
    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 type" }), {
      target: { value: "loan" },
    });
    expect(
      screen.getByRole("spinbutton", { name: "Mock 1 amount (USDC)" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Borrowed asset" }), {
      target: { value: "DAI" },
    });

    expect(
      screen.getByRole("spinbutton", { name: "Mock 1 amount (DAI)" }),
    ).toBeInTheDocument();
  });

  it("relabels a debt-typed activity mock's amount field when the borrowed asset changes", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");
    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 type" }), {
      target: { value: "activity" },
    });
    const borrowIndex = activityScenarios(TEST_SYMBOL).findIndex(
      (s) => s.key === "act-borrow",
    );
    fireEvent.change(screen.getByRole("slider", { name: "Mock 1 step" }), {
      target: { value: String(borrowIndex) },
    });
    expect(
      screen.getByRole("spinbutton", { name: "Mock 1 amount (USDC)" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Borrowed asset" }), {
      target: { value: "WETH" },
    });

    expect(
      screen.getByRole("spinbutton", { name: "Mock 1 amount (WETH)" }),
    ).toBeInTheDocument();
  });

  it("forces and releases the Loans summary health factor and capacity state", () => {
    renderExpanded();
    clickTab("Loans");

    fireEvent.click(screen.getByRole("button", { name: "Danger (0.95)" }));
    fireEvent.click(screen.getByRole("button", { name: "Error" }));

    // Both controls sit under the Loans summary section and have their own
    // "Live" release button, so releasing one must not release the other.
    const [healthFactorLive, capacityLive] = screen.getAllByRole("button", {
      name: "Live",
    });
    fireEvent.click(healthFactorLive);
    expect(healthFactorLive).toBeInTheDocument();
    fireEvent.click(capacityLive);
  });

  it("exposes hide-real and a per-item amount control", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    const hideReal = screen.getByRole("checkbox", { name: "Hide real items" });
    fireEvent.click(hideReal);
    expect(hideReal).toBeChecked();

    const amount = screen.getByRole("spinbutton", {
      name: "Mock 1 amount (BTC)",
    });
    fireEvent.change(amount, { target: { value: "2.5" } });
    expect(amount).toHaveValue(2.5);
  });

  it("exposes the artifact-download mock toggle, off by default", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    const mockDownload = screen.getByRole("checkbox", {
      name: "Mock artifact download",
    });
    expect(mockDownload).not.toBeChecked();

    fireEvent.click(mockDownload);
    expect(mockDownload).toBeChecked();

    // Reset so the session-level store doesn't leak into other tests.
    fireEvent.click(mockDownload);
    expect(mockDownload).not.toBeChecked();
  });

  it("steps a mock's state with the slider", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    const slider = screen.getByRole("slider", { name: "Mock 1 step" });
    fireEvent.change(slider, { target: { value: "1" } });

    // The readout advances to the second flow step.
    expect(screen.getByText(DEPOSIT_SCENARIOS[1].label)).toBeInTheDocument();
  });

  it("scrubs the expired variants with the slider in Expired mode", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 mode" }), {
      target: { value: "expired" },
    });

    // Expired mode keeps the slider live — it now scrubs the expired sub-states.
    const slider = screen.getByRole("slider", { name: "Mock 1 step" });
    expect(slider).not.toBeDisabled();
    expect(screen.getByText("Expired — refund available")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "1" } });
    expect(screen.getByText("Expired — refund maturing")).toBeInTheDocument();
  });

  it("disables the slider in Different wallet mode (a single state)", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 mode" }), {
      target: { value: "different-wallet" },
    });

    expect(screen.getByRole("slider", { name: "Mock 1 step" })).toBeDisabled();
  });

  it("disables the controls when the demo toggle is off", () => {
    renderExpanded();
    clickTab("Deposit & Vaults");

    const toggle = screen.getByRole("checkbox", { name: "Inject demo" });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "Mock 1 type" }),
    ).toBeDisabled();
  });

  // The Liquidations tab has exactly one "Live"/"Simulated" pair (its own
  // Liquidation Analysis segmented control uses "Auto", not "Live"), so the
  // cascade simulator's buttons are unambiguous there. Presets only show
  // once "Simulated" is selected.
  it("a preset click writes the cascade store; Live clears it", () => {
    const manualMode = renderHook(() => useDebugManualMode());
    renderExpanded();
    clickTab("Liquidations");

    fireEvent.click(screen.getByRole("button", { name: "Simulated" }));
    fireEvent.click(screen.getByRole("button", { name: "Healthy" }));
    expect(manualMode.result.current).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(manualMode.result.current).toBe(false);
  });

  it("the summary chip lists active overrides across stores and reset-all clears every one", () => {
    const protocolStatus = renderHook(() => useDebugProtocolStatusOverride());
    const liquidationCard = renderHook(() => useLiquidationDebugState());
    renderExpanded();

    // Activate one override on three different tabs, from three different
    // dev stores.
    clickTab("Deposit & Vaults");
    const mockDownload = screen.getByRole("checkbox", {
      name: "Mock artifact download",
    });
    fireEvent.click(mockDownload);

    clickTab("Global");
    fireEvent.click(screen.getByRole("button", { name: "Soft-paused" }));

    clickTab("Liquidations");
    fireEvent.click(screen.getByRole("button", { name: "No deposit" }));

    expect(screen.getByText("Artifact download mock")).toBeInTheDocument();
    expect(screen.getByText("Protocol status: frozen")).toBeInTheDocument();
    expect(
      screen.getByText("Liquidation card: no-deposit"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset all to live" }));

    expect(
      screen.queryByText("Artifact download mock"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Protocol status:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Liquidation card:/)).not.toBeInTheDocument();

    // The clears round-trip through the dev stores each tab reads, not just
    // the chip's own view.
    expect(mockDownload).not.toBeChecked();
    expect(protocolStatus.result.current).toBeNull();
    expect(liquidationCard.result.current).toBe("auto");
  });
});

// Collateral collation referenced for COLLATERAL_SCENARIOS length sanity.
describe("demoDeposit scenario lists", () => {
  it("exposes non-empty scenario lists per type", () => {
    expect(DEPOSIT_SCENARIOS.length).toBeGreaterThan(0);
    expect(COLLATERAL_SCENARIOS.length).toBeGreaterThan(0);
    expect(loanScenarios(TEST_SYMBOL).length).toBeGreaterThan(0);
    expect(activityScenarios(TEST_SYMBOL).length).toBeGreaterThan(0);
  });
});

describe("useDemoBorrowSymbol", () => {
  beforeEach(() => {
    resetDemoState();
  });

  it("defaults to USDC", () => {
    const { result } = renderHook(() => useDemoBorrowSymbol());
    expect(result.current).toBe("USDC");
  });

  it("updates when the panel sets a new selection", () => {
    const { result } = renderHook(() => useDemoBorrowSymbol());
    act(() => setDemoBorrowSymbol("WETH"));
    expect(result.current).toBe("WETH");
  });
});
