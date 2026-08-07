import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  noticeBannerMessage: undefined as string | undefined,
  // The god-mode override the banner reads is itself gated on this flag.
  isGodModePanelEnabled: true,
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

import { setDebugProtocolStatusOverride } from "@/dev/debugPositionStore";

import { ProtocolStatusBanner } from "../ProtocolStatusBanner";

beforeEach(() => {
  featureFlagsMock.noticeBannerMessage = undefined;
  featureFlagsMock.isGodModePanelEnabled = true;
  gateMock.value = { protocol: null, aave: null };
  setDebugProtocolStatusOverride(null);
});

describe("ProtocolStatusBanner", () => {
  it("renders nothing when no scope has a status", () => {
    const { container } = render(<ProtocolStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the soft-paused card (non-assertive) for a frozen scope", () => {
    gateMock.value = { protocol: "frozen", aave: null };

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is soft-paused")).toBeInTheDocument();
    expect(
      screen.getByText(/repay, withdraw, and activation/),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Protocol is frozen")).not.toBeInTheDocument();
  });

  it("renders the fully-paused card (assertive) for a paused scope", () => {
    gateMock.value = { protocol: "paused", aave: null };

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is fully paused")).toBeInTheDocument();
    expect(
      screen.getByText(/Debt continues accruing interest/),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("summarizes the most severe scope (pause wins over a concurrent freeze)", () => {
    gateMock.value = { protocol: "frozen", aave: "paused" };

    render(<ProtocolStatusBanner />);

    expect(screen.getByText("Protocol is fully paused")).toBeInTheDocument();
    expect(
      screen.queryByText("Protocol is soft-paused"),
    ).not.toBeInTheDocument();
  });

  it("lets NEXT_PUBLIC_NOTICE_BANNER_MESSAGE override the v3 body", () => {
    gateMock.value = { protocol: "frozen", aave: null };
    featureFlagsMock.noticeBannerMessage = "Maintenance until 14:00 UTC.";

    render(<ProtocolStatusBanner />);

    expect(
      screen.getByText(/Maintenance until 14:00 UTC\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/temporarily restricted/),
    ).not.toBeInTheDocument();
  });

  it("forces each paused card from the god-mode override while the gate is healthy", () => {
    setDebugProtocolStatusOverride("frozen");
    const soft = render(<ProtocolStatusBanner />);
    expect(screen.getByText("Protocol is soft-paused")).toBeInTheDocument();
    soft.unmount();

    setDebugProtocolStatusOverride("paused");
    render(<ProtocolStatusBanner />);
    expect(screen.getByText("Protocol is fully paused")).toBeInTheDocument();
  });

  it("falls back to the live gate once the override is released", () => {
    setDebugProtocolStatusOverride("paused");
    setDebugProtocolStatusOverride(null);

    const { container } = render(<ProtocolStatusBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
