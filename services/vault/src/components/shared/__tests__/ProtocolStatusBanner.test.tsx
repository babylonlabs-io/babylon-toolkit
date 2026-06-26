import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  isProtocolFrozen: false,
  isProtocolPaused: false,
  protocolStatusMessage: undefined as string | undefined,
}));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

import { ProtocolStatusBanner } from "../ProtocolStatusBanner";

beforeEach(() => {
  featureFlagsMock.isProtocolFrozen = false;
  featureFlagsMock.isProtocolPaused = false;
  featureFlagsMock.protocolStatusMessage = undefined;
});

describe("ProtocolStatusBanner", () => {
  it("renders nothing when no status flag is set", () => {
    const { container } = render(<ProtocolStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the frozen card with a Learn more link when frozen", () => {
    featureFlagsMock.isProtocolFrozen = true;

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is frozen")).toBeInTheDocument();
    expect(
      screen.getByText(/New deposits and borrows are disabled/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
  });

  it("shows the paused card when paused", () => {
    featureFlagsMock.isProtocolPaused = true;

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is paused")).toBeInTheDocument();
    expect(
      screen.getByText(/Debt continues accruing interest/),
    ).toBeInTheDocument();
    // The `halted` variant is assertive: it must expose role="alert" (vs the
    // frozen `paused` variant's role="status").
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows the paused card when both flags are set (pause wins)", () => {
    featureFlagsMock.isProtocolFrozen = true;
    featureFlagsMock.isProtocolPaused = true;

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is paused")).toBeInTheDocument();
    expect(screen.queryByText("Protocol is frozen")).not.toBeInTheDocument();
  });

  it("overrides the body with NEXT_PUBLIC_PROTOCOL_STATUS_MESSAGE when set", () => {
    featureFlagsMock.isProtocolFrozen = true;
    featureFlagsMock.protocolStatusMessage = "Maintenance until 14:00 UTC.";

    render(<ProtocolStatusBanner />);

    expect(
      screen.getByText(/Maintenance until 14:00 UTC\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/New deposits and borrows are disabled/),
    ).not.toBeInTheDocument();
    // The Learn more link still renders alongside the custom message.
    expect(
      screen.getByRole("link", { name: "Learn more" }),
    ).toBeInTheDocument();
  });
});
