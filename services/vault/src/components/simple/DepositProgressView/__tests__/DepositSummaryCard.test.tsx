import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { DepositSummaryCard } from "../DepositSummaryCard";

describe("DepositSummaryCard", () => {
  it("renders the heading with the estimated duration", () => {
    render(<DepositSummaryCard onSign={vi.fn()} />);

    expect(screen.getByText(COPY.deposit.progress.heading)).toBeTruthy();
    expect(
      screen.getByText(`(${COPY.deposit.progress.summary.estimate})`),
    ).toBeTruthy();
  });

  it("lists the four step groups with their signature counts", () => {
    render(<DepositSummaryCard onSign={vi.fn()} />);

    // Counts mirror STEP_GROUPS: register(6), claim(2), payout(4), activate(3).
    expect(screen.getByText(COPY.deposit.groups.registerDeposit)).toBeTruthy();
    expect(screen.getByText("0/6")).toBeTruthy();
    expect(screen.getByText(COPY.deposit.groups.signWots)).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(screen.getByText(COPY.deposit.groups.signPayout)).toBeTruthy();
    expect(screen.getByText("0/4")).toBeTruthy();
    expect(screen.getByText(COPY.deposit.groups.activateVault)).toBeTruthy();
    // Activate vault stays at 0/3 — the Figma 0/4 counter is the stale side.
    expect(screen.getByText("0/3")).toBeTruthy();
  });

  it("calls onSign when the Sign button is clicked", () => {
    const onSign = vi.fn();
    render(<DepositSummaryCard onSign={onSign} />);

    fireEvent.click(
      screen.getByRole("button", { name: COPY.deposit.progress.buttons.sign }),
    );

    expect(onSign).toHaveBeenCalledTimes(1);
  });
});
