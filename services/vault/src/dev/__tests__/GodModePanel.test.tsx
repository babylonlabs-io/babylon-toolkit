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
  ACTIVATED_SCENARIO_INDEX,
  ACTIVATION_CONFIRMING_SCENARIO_INDEX,
  buildCollateralsDemo,
  buildDepositsDemo,
  buildWithdrawalsDemo,
  COLLATERAL_SCENARIOS,
  type DemoItem,
  DEPOSIT_SCENARIOS,
  getDemoStepperBatch,
  READY_TO_ACTIVATE_SCENARIO_INDEX,
  resetDemoState,
  setDemoItemState,
  submitDemoVaultActivation,
  useDemoItems,
  WITHDRAWAL_SCENARIOS,
} from "../demoDeposit";
import { GodModePanel } from "../GodModePanel";

const mockSetTheme = vi.hoisted(() => vi.fn());
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: mockSetTheme }),
}));

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

    const withdrawals = buildWithdrawalsDemo(
      [
        {
          key: 2,
          type: "withdrawal",
          stateIndex: 0,
          amount: "0.5",
          batched: false,
        },
      ],
      true,
    );
    expect(withdrawals.vaults[0].amountBtc).toBe(0.5);
    expect(withdrawals.statuses.size).toBe(1);

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

// The panel starts collapsed (small launcher, bottom-right); expand it to reach
// the controls.
function renderExpanded() {
  render(<GodModePanel />);
  fireEvent.click(screen.getByRole("button", { name: "God mode" }));
}

describe("GodModePanel", () => {
  beforeEach(() => {
    resetDemoState();
  });

  it("starts collapsed and toggles open/closed", () => {
    render(<GodModePanel />);
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

  it("renders a default deposit mock", () => {
    renderExpanded();
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
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("adds and removes mocks", () => {
    renderExpanded();

    fireEvent.click(screen.getByRole("button", { name: "+ Add mock" }));
    expect(
      screen.getByRole("combobox", { name: "Mock 2 type" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove mock 2" }));
    expect(
      screen.queryByRole("combobox", { name: "Mock 2 type" }),
    ).not.toBeInTheDocument();
  });

  it("switches a mock to a different type and shows that type's states", () => {
    renderExpanded();

    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 type" }), {
      target: { value: "withdrawal" },
    });

    // The readout reflects the first state of the newly selected type.
    expect(screen.getByText(WITHDRAWAL_SCENARIOS[0].label)).toBeInTheDocument();
  });

  it("exposes hide-real and a per-item amount control", () => {
    renderExpanded();

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

    const slider = screen.getByRole("slider", { name: "Mock 1 step" });
    fireEvent.change(slider, { target: { value: "1" } });

    // The readout advances to the second flow step.
    expect(screen.getByText(DEPOSIT_SCENARIOS[1].label)).toBeInTheDocument();
  });

  it("scrubs the expired variants with the slider in Expired mode", () => {
    renderExpanded();

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

    fireEvent.change(screen.getByRole("combobox", { name: "Mock 1 mode" }), {
      target: { value: "different-wallet" },
    });

    expect(screen.getByRole("slider", { name: "Mock 1 step" })).toBeDisabled();
  });

  it("disables the controls when the demo toggle is off", () => {
    renderExpanded();

    const toggle = screen.getByRole("checkbox", { name: "Inject demo" });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "Mock 1 type" }),
    ).toBeDisabled();
  });

  it("renders a passed-in section (e.g. the position debug panel) once expanded", () => {
    render(
      <GodModePanel>
        <div>extra debug section</div>
      </GodModePanel>,
    );
    // Collapsed launcher shows no children.
    expect(screen.queryByText("extra debug section")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "God mode" }));
    expect(screen.getByText("extra debug section")).toBeInTheDocument();
  });
});

// Collateral collation referenced for COLLATERAL_SCENARIOS length sanity.
describe("demoDeposit scenario lists", () => {
  it("exposes non-empty scenario lists per type", () => {
    expect(DEPOSIT_SCENARIOS.length).toBeGreaterThan(0);
    expect(WITHDRAWAL_SCENARIOS.length).toBeGreaterThan(0);
    expect(COLLATERAL_SCENARIOS.length).toBeGreaterThan(0);
  });
});
