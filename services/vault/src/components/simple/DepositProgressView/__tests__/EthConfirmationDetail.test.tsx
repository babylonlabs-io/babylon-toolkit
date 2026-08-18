import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { EthConfirmationDetail } from "../EthConfirmationDetail";

describe("EthConfirmationDetail", () => {
  it("shows the accrued confirmations against the required depth", () => {
    render(<EthConfirmationDetail confirmations={3} required={8} />);
    expect(screen.getByText("3 of 8")).toBeInTheDocument();
  });

  it("shows the estimated seconds and the Ethereum blocks left", () => {
    render(<EthConfirmationDetail confirmations={3} required={8} />);
    expect(screen.getByText("~60 sec (5 Ethereum blocks)")).toBeInTheDocument();
  });

  it("uses the singular block form when one confirmation remains", () => {
    render(<EthConfirmationDetail confirmations={7} required={8} />);
    expect(screen.getByText("~12 sec (1 Ethereum block)")).toBeInTheDocument();
  });

  it("switches to the finalizing state once the depth is reached", () => {
    render(<EthConfirmationDetail confirmations={8} required={8} />);
    expect(
      screen.getByText(COPY.deposit.ethConfirmation.finalizing),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sec \(/)).not.toBeInTheDocument();
  });

  it("explains why the flow is paused here", () => {
    // Without this the step reads as a hang: the user has just signed on
    // Ethereum and is expecting a Bitcoin prompt next.
    render(<EthConfirmationDetail confirmations={1} required={8} />);
    expect(
      screen.getByText(COPY.deposit.ethConfirmation.rationale),
    ).toBeInTheDocument();
  });

  it("renders without a transaction hash, as the resume path supplies none", () => {
    render(<EthConfirmationDetail confirmations={2} required={8} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 8")).toBeInTheDocument();
  });
});
