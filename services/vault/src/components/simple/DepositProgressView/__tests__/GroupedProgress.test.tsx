import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { GroupedProgress } from "../GroupedProgress";
import { buildStepItems } from "../steps";

const steps = buildStepItems(null);

describe("GroupedProgress", () => {
  it("renders only the group holding the current step", () => {
    render(<GroupedProgress steps={steps} currentStep={1} />);

    expect(
      screen.getByText(COPY.deposit.groups.registerDeposit),
    ).toBeInTheDocument();

    // Every later group is hidden until its own turn.
    expect(
      screen.queryByText(COPY.deposit.groups.signWots),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.groups.signPayout),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.groups.activateVault),
    ).not.toBeInTheDocument();
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

    // An upcoming group is not rendered at all — neither header nor sub-step.
    expect(
      screen.queryByText(COPY.deposit.steps.signPayouts),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.groups.signPayout),
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

  it("renders the active group's sub-steps by state, not by number", () => {
    // Step 11 -> "Sign payout" group (9-12) active; steps 9-10 are already done.
    render(<GroupedProgress steps={steps} currentStep={11} />);

    // Completed sub-step label is shown as a checkmark row, not a numbered one.
    expect(
      screen.getByText(COPY.deposit.steps.authenticateSession),
    ).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    // The remaining sub-step reads pending; only the group circle is numbered.
    expect(
      screen.getByLabelText(COPY.deposit.a11y.stepPending(12)),
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
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

  describe("pre-sign entry (started=false)", () => {
    it("renders the Pre-PegIn group with its fee selector", () => {
      render(
        <GroupedProgress
          steps={steps}
          currentStep={1}
          started={false}
          preSignDetail={<div data-testid="pre-sign-detail" />}
        />,
      );

      expect(
        screen.getByText(COPY.deposit.groups.registerDeposit),
      ).toBeInTheDocument();
      expect(screen.getByTestId("pre-sign-detail")).toBeInTheDocument();
      expect(
        screen.queryByText(COPY.deposit.groups.signWots),
      ).not.toBeInTheDocument();
    });

    it("renders the current group's header when re-entering un-started mid-flow", () => {
      // WOTS re-offer: no group is `active` (nothing has started), so the
      // rendered group is the one holding the current step — and the finished
      // Register-deposit group must not come back with it.
      render(<GroupedProgress steps={steps} currentStep={7} started={false} />);

      expect(
        screen.getByText(COPY.deposit.groups.signWots),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(COPY.deposit.groups.registerDeposit),
      ).not.toBeInTheDocument();
    });
  });

  it("marks the group and its failing sub-step as failed when the current step errors", () => {
    render(<GroupedProgress steps={steps} currentStep={8} hasError />);

    const failed = screen.getAllByLabelText(
      COPY.deposit.a11y.groupStatus.failed,
    );
    expect(failed).toHaveLength(1);

    const header = failed[0].parentElement as HTMLElement;
    expect(
      within(header).getByText(COPY.deposit.groups.signWots),
    ).toBeInTheDocument();

    for (const status of ["active", "completed", "upcoming"] as const) {
      expect(
        screen.queryByLabelText(COPY.deposit.a11y.groupStatus[status]),
      ).not.toBeInTheDocument();
    }

    // The failing sub-step announces itself too.
    expect(
      screen.getByLabelText(COPY.deposit.a11y.stepFailed(8)),
    ).toBeInTheDocument();
  });

  it("swaps the group number for the close glyph on a failed header", () => {
    render(<GroupedProgress steps={steps} currentStep={8} hasError />);

    const circle = screen.getByLabelText(COPY.deposit.a11y.groupStatus.failed);
    expect(within(circle).queryByText("2")).not.toBeInTheDocument();
    expect(circle.querySelector("svg")).toBeInTheDocument();
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

    it("exposes only the rendered group's status to screen readers", () => {
      render(<GroupedProgress steps={steps} currentStep={8} />);

      // Register deposit is done and therefore hidden — no completed indicator.
      expect(
        screen.queryByLabelText(COPY.deposit.a11y.groupStatus.completed),
      ).not.toBeInTheDocument();
      // Set up claim is the only group left in the tree, and it is active.
      expect(
        screen.getByLabelText(COPY.deposit.a11y.groupStatus.active),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(COPY.deposit.a11y.groupStatus.upcoming),
      ).not.toBeInTheDocument();
    });
  });
});
