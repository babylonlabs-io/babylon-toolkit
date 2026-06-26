import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  isProtocolSoftPaused: false,
  isProtocolFullyPaused: false,
  pauseBannerMessage: undefined as string | undefined,
}));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

import { ProtocolPauseBanner } from "../ProtocolPauseBanner";

beforeEach(() => {
  featureFlagsMock.isProtocolSoftPaused = false;
  featureFlagsMock.isProtocolFullyPaused = false;
  featureFlagsMock.pauseBannerMessage = undefined;
});

describe("ProtocolPauseBanner", () => {
  it("renders nothing when no pause flag is set", () => {
    const { container } = render(<ProtocolPauseBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the soft-paused card with a Learn more link when soft-paused", () => {
    featureFlagsMock.isProtocolSoftPaused = true;

    render(<ProtocolPauseBanner />);

    expect(screen.getByText("Protocol is soft-paused")).toBeInTheDocument();
    expect(
      screen.getByText(/New deposits and borrows are disabled/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
  });

  it("shows the fully-paused card when fully paused", () => {
    featureFlagsMock.isProtocolFullyPaused = true;

    render(<ProtocolPauseBanner />);

    expect(screen.getByText("Protocol is fully paused")).toBeInTheDocument();
    expect(
      screen.getByText(/Debt continues accruing interest/),
    ).toBeInTheDocument();
  });

  it("shows the fully-paused card when both flags are set (hard wins)", () => {
    featureFlagsMock.isProtocolSoftPaused = true;
    featureFlagsMock.isProtocolFullyPaused = true;

    render(<ProtocolPauseBanner />);

    expect(screen.getByText("Protocol is fully paused")).toBeInTheDocument();
    expect(
      screen.queryByText("Protocol is soft-paused"),
    ).not.toBeInTheDocument();
  });

  it("overrides the body with NEXT_PUBLIC_PAUSE_BANNER_MESSAGE when set", () => {
    featureFlagsMock.isProtocolSoftPaused = true;
    featureFlagsMock.pauseBannerMessage = "Maintenance until 14:00 UTC.";

    render(<ProtocolPauseBanner />);

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
