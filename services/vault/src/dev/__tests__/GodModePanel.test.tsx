import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { getActionStatus } from "@/components/deposit/actionStatus";
import { COPY } from "@/copy";
import { ContractStatus } from "@/models/peginStateMachine";

import {
  buildCollateralsDemo,
  buildDepositsDemo,
  buildWithdrawalsDemo,
  COLLATERAL_SCENARIOS,
  type DemoItem,
  DEPOSIT_SCENARIOS,
  resetDemoState,
  WITHDRAWAL_SCENARIOS,
} from "../demoDeposit";
import { GodModePanel } from "../GodModePanel";

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
      screen.getByRole("combobox", { name: "Mock 1 state" }),
    ).toBeInTheDocument();
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

    const stateSelect = screen.getByRole("combobox", { name: "Mock 1 state" });
    expect(
      within(stateSelect).getByText(WITHDRAWAL_SCENARIOS[0].label),
    ).toBeInTheDocument();
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

  it("steps a mock's state with the slider", () => {
    renderExpanded();

    const slider = screen.getByRole("slider", { name: "Mock 1 step" });
    fireEvent.change(slider, { target: { value: "1" } });

    expect(screen.getByRole("combobox", { name: "Mock 1 state" })).toHaveValue(
      "1",
    );
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
