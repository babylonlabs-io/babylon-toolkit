/**
 * Review Withdraw card (issue #2067). The restyle moved every row onto the
 * shared v3 review row, so these pin what the rows must still say: the same
 * amounts, the same conversions, and a projected health factor coloured by its
 * own status rather than always green.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HEALTH_FACTOR_COLORS } from "@/applications/aave/utils";

import { WithdrawReviewContent } from "../WithdrawReviewContent";

vi.mock("@/hooks/useNetworkFees", () => ({
  useNetworkFees: () => ({
    defaultFeeRate: 3,
    halfHourFeeRate: 2,
    hourFeeRate: 1,
  }),
}));

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: () => ({ minVpCommissionBps: 250 }),
}));

const baseProps = {
  totalAmountBtc: 0.6,
  totalAmountUsd: 21_686.17,
  currentHealthFactor: 1.6,
  projectedHealthFactor: 1.3,
  payoutAddresses: ["bc1qexampleaddress"],
  assertTimelockBlocks: 144,
  isProcessing: false,
  error: null,
  hubBlockMessage: null,
  acknowledged: true,
  onAcknowledgedChange: vi.fn(),
  onConfirm: () => {},
};

describe("WithdrawReviewContent", () => {
  it("renders each row's amount with its USD conversion on a second line", () => {
    render(<WithdrawReviewContent {...baseProps} />);

    expect(screen.getByText("Withdraw Amount")).toBeInTheDocument();
    expect(screen.getByText("0.6 sBTC")).toBeInTheDocument();
    expect(screen.getByText("$21,686.17 USD")).toBeInTheDocument();

    expect(screen.getByText("Network Fee Rate")).toBeInTheDocument();
    expect(screen.getByText("3 sats/vB")).toBeInTheDocument();

    // 2.5% of 0.6 BTC = 0.015 BTC / $542.15 — unchanged by the restyle.
    // (The test env is signet, so the coin symbol renders as sBTC.)
    expect(screen.getByText("VP Commission")).toBeInTheDocument();
    expect(screen.getByText("0.015 sBTC")).toBeInTheDocument();
    expect(screen.getByText("$542.15 USD")).toBeInTheDocument();
  });

  it("colours the projected health factor by the projected status, not the current one", () => {
    // Healthy now, danger after: painting the delta from the current status
    // would show this withdrawal as green.
    render(
      <WithdrawReviewContent
        {...baseProps}
        currentHealthFactor={1.6}
        projectedHealthFactor={0.9}
      />,
    );

    // The outgoing value reads as plain secondary text; only the projection
    // carries the position colour.
    expect(screen.getByText("1.60")).not.toHaveAttribute("style");
    expect(screen.getByText("0.90")).toHaveStyle({
      color: HEALTH_FACTOR_COLORS.DARK_RED,
    });
  });

  it("blocks confirmation and explains why when the projection breaches the floor", () => {
    render(
      <WithdrawReviewContent {...baseProps} projectedHealthFactor={0.9} />,
    );

    expect(screen.getByTestId("withdraw-hf-block-warning")).toHaveTextContent(
      "would drop your health factor below 1.0",
    );
    expect(screen.getByTestId("withdraw-confirm-button")).toBeDisabled();
  });

  it("announces the block warning as a titled alert banner", () => {
    render(
      <WithdrawReviewContent {...baseProps} projectedHealthFactor={0.9} />,
    );

    const banner = screen.getByTestId("withdraw-hf-block-warning");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent("Withdraw unavailable");
    // The warning triangle, not the error variant's default close glyph:
    // the two icons are only distinguishable in the DOM by their viewBox.
    expect(banner.querySelector('svg[viewBox="0 0 22 20"]')).not.toBeNull();
  });

  it("warns without blocking when the projection is above the floor but at risk", () => {
    render(
      <WithdrawReviewContent {...baseProps} projectedHealthFactor={1.05} />,
    );

    expect(screen.getByTestId("withdraw-hf-at-risk-warning")).toHaveTextContent(
      "health factor below 1.1",
    );
    expect(screen.getByTestId("withdraw-confirm-button")).toBeEnabled();
  });

  it("disables Confirm while at risk and unacknowledged", () => {
    render(
      <WithdrawReviewContent
        {...baseProps}
        projectedHealthFactor={1.05}
        acknowledged={false}
      />,
    );

    expect(screen.getByTestId("withdraw-review-acknowledge")).not.toBeChecked();
    expect(screen.getByTestId("withdraw-confirm-button")).toBeDisabled();
  });

  it("enables Confirm once acknowledged", () => {
    const onAcknowledgedChange = vi.fn();
    const { rerender } = render(
      <WithdrawReviewContent
        {...baseProps}
        projectedHealthFactor={1.05}
        acknowledged={false}
        onAcknowledgedChange={onAcknowledgedChange}
      />,
    );

    fireEvent.click(screen.getByTestId("withdraw-review-acknowledge"));
    expect(onAcknowledgedChange).toHaveBeenCalledWith(true);

    rerender(
      <WithdrawReviewContent
        {...baseProps}
        projectedHealthFactor={1.05}
        acknowledged
        onAcknowledgedChange={onAcknowledgedChange}
      />,
    );

    expect(screen.getByTestId("withdraw-confirm-button")).toBeEnabled();
  });

  it("blocks confirmation and shows the reason when a hub would reject the withdrawal", () => {
    render(
      <WithdrawReviewContent
        {...baseProps}
        hubBlockMessage="Core Hub, where you have debt, isn't accepting transactions right now."
      />,
    );

    expect(screen.getByTestId("withdraw-hub-block-warning")).toHaveTextContent(
      "Core Hub, where you have debt, isn't accepting transactions right now.",
    );
    expect(screen.getByTestId("withdraw-confirm-button")).toBeDisabled();
  });
});
