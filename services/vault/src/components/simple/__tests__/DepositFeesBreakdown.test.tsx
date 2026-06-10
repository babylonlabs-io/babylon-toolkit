/**
 * Tests for the deposit fee breakdown's VP-commission and net-payout lines
 * (the disclosure half of TRV-032). They pin the depositor-facing numbers:
 * the commission percent, the commission deducted from the deposit, and the
 * resulting net payout — and the placeholder shown before the commission loads.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DepositFeesBreakdown } from "../DepositFeesBreakdown";

const baseProps = {
  depositorClaimValue: 5000n,
  btcPrice: 0,
  hasPriceFetchError: false,
  protocolFeeAmount: "0.0001 BTC",
  protocolFeePrice: "",
  protocolFeeIsError: false,
};

describe("DepositFeesBreakdown commission disclosure", () => {
  it("shows the commission percent, commission amount, and net payout", () => {
    // 1 BTC deposit at 250 bps (2.5%): commission 0.025 BTC, net 0.975 BTC.
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        commissionBps={250}
      />,
    );

    expect(screen.getByText("VP commission (2.5%)")).toBeInTheDocument();
    expect(screen.getByText("Net payout")).toBeInTheDocument();
    expect(screen.getByText(/0\.025/)).toBeInTheDocument();
    expect(screen.getByText(/0\.975/)).toBeInTheDocument();
  });

  it("shows the placeholder and no percent while the commission is unavailable", () => {
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        commissionBps={undefined}
      />,
    );

    // Label has no percent suffix when the commission hasn't loaded.
    expect(screen.getByText("VP commission")).toBeInTheDocument();
    expect(screen.queryByText(/VP commission \(/)).not.toBeInTheDocument();
    // Both the commission and net-payout cells render the "--" placeholder.
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2);
  });
});
