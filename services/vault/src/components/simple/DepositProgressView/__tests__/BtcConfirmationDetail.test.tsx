import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BtcConfirmationDetail } from "../BtcConfirmationDetail";

const TXID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const baseProps = {
  prePeginTxid: TXID,
};

describe("BtcConfirmationDetail", () => {
  it("links the Pre-PegIn txid to the Bitcoin explorer", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={0}
        requiredDepth={6}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining(TXID),
    );
  });

  it("shows the estimate with the BTC blocks left", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={3}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("~30 min (3 BTC blocks)")).toBeInTheDocument();
  });

  it("shows the full estimate before any confirmation lands", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={0}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("~60 min (6 BTC blocks)")).toBeInTheDocument();
  });

  it("uses the singular when one BTC block is left", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={5}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("~10 min (1 BTC block)")).toBeInTheDocument();
  });

  it("shows provider payout-prep status once the required depth is reached", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={6}
        requiredDepth={6}
      />,
    );
    expect(
      screen.getByText(
        "Waiting for vault provider to prepare claim and payout transactions...",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Status/)).toBeInTheDocument();
    expect(screen.queryByText(/block/)).not.toBeInTheDocument();
  });

  it("shows provider payout-prep status when confirmations overshoot the depth", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={8}
        requiredDepth={6}
      />,
    );
    expect(
      screen.getByText(
        "Waiting for vault provider to prepare claim and payout transactions...",
      ),
    ).toBeInTheDocument();
  });

  it("shows no estimate until the first confirmation reading arrives", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={null}
        requiredDepth={6}
      />,
    );
    expect(screen.queryByText(/block/)).not.toBeInTheDocument();
    expect(screen.queryByText("Finalizing...")).not.toBeInTheDocument();
  });
});
