/**
 * Tests for the deposit fee breakdown's VP-commission and net-payout lines
 * (the disclosure half of TRV-032). They pin the depositor-facing numbers:
 * the commission percent, the commission charged on the deposit amount
 * (btc-vault: `floor(peginAmount × bps / 10000)` per payout — claim value,
 * PegIn fee, and the P2A anchor are NOT part of the basis), and the
 * resulting net payout.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DepositFeesBreakdown } from "../DepositFeesBreakdown";

const baseProps = {
  btcPrice: 0,
  hasPriceFetchError: false,
  protocolFeeAmount: "0.0001 BTC",
  protocolFeePrice: "",
  protocolFeeIsError: false,
};

describe("DepositFeesBreakdown commission disclosure", () => {
  it("charges commission on the deposit amount only", () => {
    // Deposit 1.00 BTC at 2.5% → commission = floor(1.00 × 2.5%) = 0.025,
    // net payout = 0.975. The claim value prop is display-only and must NOT
    // enter the commission basis.
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        depositorClaimValue={3_000_000n}
        commissionBaseValues={[100_000_000n]}
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
        depositorClaimValue={3_000_000n}
        commissionBaseValues={[100_000_000n]}
        commissionBps={undefined}
      />,
    );

    // Label has no percent suffix when the commission hasn't loaded.
    expect(screen.getByText("VP commission")).toBeInTheDocument();
    expect(screen.queryByText(/VP commission \(/)).not.toBeInTheDocument();
    // Both the commission and net-payout cells render the "--" placeholder.
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the placeholder until the per-vault amounts have loaded", () => {
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        depositorClaimValue={3_000_000n}
        commissionBaseValues={undefined}
        commissionBps={250}
      />,
    );

    // Percent is still shown (it's just the bps), but the sats can't be
    // sized until the split's per-vault amounts resolve, so commission and
    // net payout stay as "--".
    expect(screen.getByText("VP commission (2.5%)")).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2);
  });

  it("floors commission per vault for split deposits", () => {
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={10n}
        depositorClaimValue={0n}
        commissionBaseValues={[5n, 5n]}
        commissionBps={5000}
      />,
    );

    // floor(5 × 50%) + floor(5 × 50%) = 4 sats. A single floor on the summed
    // value would produce 5 sats, which is not the per-payout protocol math.
    expect(screen.getByText(/0\.00000004/)).toBeInTheDocument();
    expect(screen.getByText(/0\.00000006/)).toBeInTheDocument();
  });
});
