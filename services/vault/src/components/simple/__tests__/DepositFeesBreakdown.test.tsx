/**
 * Tests for the deposit fee breakdown's VP-commission and net-payout lines
 * (the disclosure half of TRV-032). They pin the depositor-facing numbers:
 * the commission percent, the commission charged (on the full HTLC value, not
 * the entered amount), and the resulting net payout — plus the placeholder
 * shown before the inputs that size the HTLC value have loaded.
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
  it("charges commission on the HTLC value (deposit + reserve + pegin fee), not the deposit alone", () => {
    // htlcValue = 1.00 + 0.03 + 0.01 = 1.04 BTC. At 2.5%, commission =
    // floor(1.04 × 2.5%) = 0.026 — distinct from the deposit-only 0.025, which
    // proves the HTLC-value basis. Net payout = deposit − commission = 0.974.
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        depositorClaimValue={3_000_000n}
        commissionHtlcValues={[104_000_000n]}
        commissionBps={250}
      />,
    );

    expect(screen.getByText("VP commission (2.5%)")).toBeInTheDocument();
    expect(screen.getByText("Net payout")).toBeInTheDocument();
    expect(screen.getByText(/0\.026/)).toBeInTheDocument();
    expect(screen.getByText(/0\.974/)).toBeInTheDocument();
  });

  it("shows the placeholder and no percent while the commission is unavailable", () => {
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        depositorClaimValue={3_000_000n}
        commissionHtlcValues={[104_000_000n]}
        commissionBps={undefined}
      />,
    );

    // Label has no percent suffix when the commission hasn't loaded.
    expect(screen.getByText("VP commission")).toBeInTheDocument();
    expect(screen.queryByText(/VP commission \(/)).not.toBeInTheDocument();
    // Both the commission and net-payout cells render the "--" placeholder.
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the placeholder until the HTLC values have loaded", () => {
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={100_000_000n}
        depositorClaimValue={3_000_000n}
        commissionHtlcValues={undefined}
        commissionBps={250}
      />,
    );

    // Percent is still shown (it's just the bps), but the sats can't be sized
    // without the pegin fee, so commission and net payout stay as "--".
    expect(screen.getByText("VP commission (2.5%)")).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2);
  });

  it("floors commission per HTLC for split deposits", () => {
    render(
      <DepositFeesBreakdown
        {...baseProps}
        amountSats={10n}
        depositorClaimValue={0n}
        commissionHtlcValues={[5n, 5n]}
        commissionBps={5000}
      />,
    );

    // floor(5 * 50%) + floor(5 * 50%) = 4 sats. A single floor on the summed
    // value would produce 5 sats, which is not the per-HTLC protocol cap.
    expect(screen.getByText(/0\.00000004/)).toBeInTheDocument();
    expect(screen.getByText(/0\.00000006/)).toBeInTheDocument();
  });
});
