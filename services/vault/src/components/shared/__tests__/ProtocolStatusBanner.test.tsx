import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  protocolStatusMessage: undefined as string | undefined,
}));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

// The banner derives its status from the composed gate state, so drive the gate
// directly here (overriding the unblocked default from the global test setup).
const gateMock = vi.hoisted(() => ({
  value: { protocol: null, aave: null } as {
    protocol: string | null;
    aave: string | null;
  },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

import { ProtocolStatusBanner } from "../ProtocolStatusBanner";

beforeEach(() => {
  featureFlagsMock.protocolStatusMessage = undefined;
  gateMock.value = { protocol: null, aave: null };
});

describe("ProtocolStatusBanner", () => {
  it("renders nothing when no scope has a status", () => {
    const { container } = render(<ProtocolStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the frozen card with a Learn more link when a scope is frozen", () => {
    gateMock.value = { protocol: "frozen", aave: null };

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is frozen")).toBeInTheDocument();
    expect(
      screen.getByText(/New deposits and borrows are disabled/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
  });

  it("shows the paused card when a scope is paused", () => {
    gateMock.value = { protocol: "paused", aave: null };

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is paused")).toBeInTheDocument();
    expect(
      screen.getByText(/Debt continues accruing interest/),
    ).toBeInTheDocument();
    // The `halted` variant is assertive: it must expose role="alert" (vs the
    // frozen `paused` variant's role="status").
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("summarizes the most severe scope (pause wins over a concurrent freeze)", () => {
    gateMock.value = { protocol: "frozen", aave: "paused" };

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is paused")).toBeInTheDocument();
    expect(screen.queryByText("Protocol is frozen")).not.toBeInTheDocument();
  });

  it("overrides the body with NEXT_PUBLIC_PROTOCOL_STATUS_MESSAGE when set", () => {
    gateMock.value = { protocol: "frozen", aave: null };
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
