import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BtcConfirmationDetail } from "../BtcConfirmationDetail";

const TXID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const baseProps = {
  startedAt: new Date("2026-01-01T13:44:00Z").getTime(),
  prePeginTxid: TXID,
};

describe("BtcConfirmationDetail", () => {
  it("shows when the confirmation wait started", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={0}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText(/Started at/)).toBeInTheDocument();
  });

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

  it("counts confirmations toward the required depth", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={3}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("3 of 6")).toBeInTheDocument();
  });

  it("estimates the remaining wait from the unconfirmed blocks", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={3}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("~30 min")).toBeInTheDocument();
  });

  it("estimates the full wait before any confirmation lands", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={0}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("0 of 6")).toBeInTheDocument();
    expect(screen.getByText("~60 min")).toBeInTheDocument();
  });

  it("shows a finalizing state once the required depth is reached", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={6}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("Finalizing...")).toBeInTheDocument();
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
  });

  it("clamps the displayed count when confirmations overshoot the depth", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={8}
        requiredDepth={6}
      />,
    );
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
    expect(screen.getByText("Finalizing...")).toBeInTheDocument();
  });

  it("shows no count until the first confirmation reading arrives", () => {
    render(
      <BtcConfirmationDetail
        {...baseProps}
        confirmations={null}
        requiredDepth={6}
      />,
    );
    expect(screen.queryByText(/ of 6/)).not.toBeInTheDocument();
    expect(screen.queryByText("Finalizing...")).not.toBeInTheDocument();
  });
});
