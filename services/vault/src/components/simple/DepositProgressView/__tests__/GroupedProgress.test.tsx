import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { GroupedProgress } from "../GroupedProgress";
import { buildStepItems } from "../steps";

const steps = buildStepItems(null);

describe("GroupedProgress", () => {
  it("always renders all four group headers", () => {
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

  it("shows the per-group completed counter on a finished group", () => {
    render(<GroupedProgress steps={steps} currentStep={8} />);

    // Register deposit (steps 1-6) is fully done.
    expect(
      screen.getByText(COPY.deposit.groups.stepCounter(6, 6)),
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

  it("collapses every group on completion", () => {
    render(<GroupedProgress steps={steps} currentStep={steps.length + 1} />);

    // No sub-step labels are rendered when all groups are collapsed.
    expect(
      screen.queryByText(COPY.deposit.steps.submitWotsKey),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.steps.generateSecret),
    ).not.toBeInTheDocument();
    // Every group reports itself fully complete (6/6, 2/2, 4/4, 4/4).
    expect(
      screen.getByText(COPY.deposit.groups.stepCounter(6, 6)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.groups.stepCounter(2, 2)),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(COPY.deposit.groups.stepCounter(4, 4)),
    ).toHaveLength(2);
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

    it("exposes each group's status to screen readers", () => {
      render(<GroupedProgress steps={steps} currentStep={8} />);

      // Register deposit done, Set up claim active, the latter two not started.
      expect(
        screen.getByLabelText(COPY.deposit.a11y.groupStatus.completed),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(COPY.deposit.a11y.groupStatus.active),
      ).toBeInTheDocument();
      expect(
        screen.getAllByLabelText(COPY.deposit.a11y.groupStatus.upcoming),
      ).toHaveLength(2);
    });
  });
});
