import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { GroupedProgress } from "../GroupedProgress";
import { buildStepItems } from "../steps";

const steps = buildStepItems(null);

describe("GroupedProgress", () => {
  it("renders all four group headers before any group completes", () => {
    render(<GroupedProgress steps={steps} currentStep={1} />);

    expect(
      screen.getByText(COPY.deposit.groups.registerDeposit),
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.deposit.groups.signWots)).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.groups.signPayout),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.groups.activateVault),
    ).toBeInTheDocument();
  });

  it("expands only the active group and hides other groups' sub-steps", () => {
    // Step 8 -> "Set up claim" group (7-8) is active.
    render(<GroupedProgress steps={steps} currentStep={8} />);

    // Active group sub-step is visible.
    expect(
      screen.getByText(COPY.deposit.steps.submitWotsKey),
    ).toBeInTheDocument();

    // A completed group's sub-step (step 1) stays collapsed.
    expect(
      screen.queryByText(COPY.deposit.steps.generateSecret),
    ).not.toBeInTheDocument();

    // An upcoming group's sub-step (Sign payouts) stays collapsed.
    expect(
      screen.queryByText(COPY.deposit.steps.signPayouts),
    ).not.toBeInTheDocument();
  });

  it("hides a finished group (it folds into the steps-completed pill)", () => {
    render(<GroupedProgress steps={steps} currentStep={8} />);

    // Register deposit (steps 1-6) is fully done → its header is not rendered.
    expect(
      screen.queryByText(COPY.deposit.groups.registerDeposit),
    ).not.toBeInTheDocument();

    // The active "Set up claim" group still shows its in-progress counter.
    expect(
      screen.getByText(COPY.deposit.groups.stepCounter(1, 2)),
    ).toBeInTheDocument();
  });

  it("renders completed sub-steps without a step number inside the active group", () => {
    // Step 11 -> "Sign payout" group (9-12) active; steps 9-10 are already done.
    render(<GroupedProgress steps={steps} currentStep={11} />);

    // Completed sub-step label is shown...
    expect(
      screen.getByText(COPY.deposit.steps.authenticateSession),
    ).toBeInTheDocument();
    // ...but rendered as a checkmark row, not the numbered pending row "1".
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    // The remaining pending sub-step carries its per-group number (4 within the group).
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("mounts the active-step detail panel inside the active step", () => {
    render(
      <GroupedProgress
        steps={steps}
        currentStep={7}
        activeStepDetail={<div data-testid="active-detail" />}
      />,
    );

    expect(screen.getByTestId("active-detail")).toBeInTheDocument();
  });

  it("hides every group on completion (all fold into the pill)", () => {
    render(<GroupedProgress steps={steps} currentStep={steps.length + 1} />);

    // All groups are complete → none render, neither headers nor sub-steps.
    expect(
      screen.queryByText(COPY.deposit.groups.registerDeposit),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.groups.activateVault),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.steps.submitWotsKey),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.steps.generateSecret),
    ).not.toBeInTheDocument();
  });

  describe("accessibility", () => {
    it("labels the active sub-step for screen readers with the global step number", () => {
      // Step 8 -> "Set up claim" group active; screen reader gets global step 8,
      // not the per-group display number 2.
      render(<GroupedProgress steps={steps} currentStep={8} />);

      expect(
        screen.getByLabelText(COPY.deposit.a11y.stepActive(8)),
      ).toBeInTheDocument();
    });

    it("labels a pending sub-step for screen readers with the global step number", () => {
      // Step 7 -> "Set up claim" group (7-8) active; global step 8 is pending and
      // its screen-reader label keeps the global number, not the per-group number 2.
      render(<GroupedProgress steps={steps} currentStep={7} />);

      expect(
        screen.getByLabelText(COPY.deposit.a11y.stepPending(8)),
      ).toBeInTheDocument();
    });

    it("exposes visible groups' status to screen readers (completed groups are hidden)", () => {
      render(<GroupedProgress steps={steps} currentStep={8} />);

      // Register deposit is done and therefore hidden — no completed indicator.
      expect(
        screen.queryByLabelText(COPY.deposit.a11y.groupStatus.completed),
      ).not.toBeInTheDocument();
      // Set up claim is active; Sign payout and Activate vault are upcoming.
      expect(
        screen.getByLabelText(COPY.deposit.a11y.groupStatus.active),
      ).toBeInTheDocument();
      expect(
        screen.getAllByLabelText(COPY.deposit.a11y.groupStatus.upcoming),
      ).toHaveLength(2);
    });
  });
});
