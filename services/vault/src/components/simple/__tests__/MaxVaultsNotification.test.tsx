import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseVaultCountCap = vi.fn();
vi.mock("@/hooks/useVaultCountCap", () => ({
  useVaultCountCap: (...args: unknown[]) => mockUseVaultCountCap(...args),
}));

const featureFlagsMock = vi.hoisted(() => ({
  isV3UiEnabled: false,
  isGodModePanelEnabled: true,
}));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

import {
  DEBUG_FORCED_MAX_VAULTS,
  setDebugMaxVaultsOverride,
} from "@/dev/debugPositionStore";

import { MaxVaultsNotification } from "../MaxVaultsNotification";

const BELOW_CAP = {
  isAtCap: false,
  maxVaults: 10,
  currentCount: 3,
  capUnavailable: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagsMock.isV3UiEnabled = false;
  setDebugMaxVaultsOverride(null);
});

describe("MaxVaultsNotification", () => {
  it("renders the cap warning when the position is at the cap", () => {
    mockUseVaultCountCap.mockReturnValue({
      isAtCap: true,
      maxVaults: 10,
      currentCount: 10,
      capUnavailable: false,
    });

    render(<MaxVaultsNotification connectedAddress="0xuser" />);

    expect(screen.getByText("Maximum vaults reached")).toBeInTheDocument();
    expect(
      screen.getByText(/maximum number of BTC Vaults \(10\)/),
    ).toBeInTheDocument();
  });

  it("renders nothing below the cap", () => {
    mockUseVaultCountCap.mockReturnValue({
      isAtCap: false,
      maxVaults: 10,
      currentCount: 3,
      capUnavailable: false,
    });

    const { container } = render(
      <MaxVaultsNotification connectedAddress="0xuser" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the cap is unknown", () => {
    mockUseVaultCountCap.mockReturnValue({
      isAtCap: false,
      maxVaults: null,
      currentCount: 0,
      capUnavailable: false,
    });

    const { container } = render(
      <MaxVaultsNotification connectedAddress="0xuser" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the v2 card (no v3 tone) while the v3 flag is off", () => {
    mockUseVaultCountCap.mockReturnValue({
      isAtCap: true,
      maxVaults: 10,
      currentCount: 10,
      capUnavailable: false,
    });

    const { container } = render(
      <MaxVaultsNotification connectedAddress="0xuser" />,
    );

    expect(container.querySelector("[data-tone]")).toBeNull();
  });
});

describe("MaxVaultsNotification v3", () => {
  beforeEach(() => {
    featureFlagsMock.isV3UiEnabled = true;
  });

  it("renders the too-many tone card with no actions and no close control", () => {
    mockUseVaultCountCap.mockReturnValue({
      isAtCap: true,
      maxVaults: 10,
      currentCount: 10,
      capUnavailable: false,
    });

    render(<MaxVaultsNotification connectedAddress="0xuser" />);

    // Figma §9: informational — accent + icon chip only, no buttons, no X.
    expect(screen.getByTestId("max-vaults-notification")).toHaveAttribute(
      "data-tone",
      "too-many",
    );
    expect(screen.getByText("Maximum vaults reached")).toBeInTheDocument();
    expect(
      screen.getByText(/maximum number of BTC Vaults \(10\)/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the card from the god-mode override while below the live cap", () => {
    mockUseVaultCountCap.mockReturnValue(BELOW_CAP);

    setDebugMaxVaultsOverride(DEBUG_FORCED_MAX_VAULTS);
    render(<MaxVaultsNotification connectedAddress="0xuser" />);

    expect(screen.getByTestId("max-vaults-notification")).toHaveAttribute(
      "data-tone",
      "too-many",
    );
    expect(
      screen.getByText(
        new RegExp(
          `maximum number of BTC Vaults \\(${DEBUG_FORCED_MAX_VAULTS}\\)`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing once the god-mode override is released", () => {
    mockUseVaultCountCap.mockReturnValue(BELOW_CAP);

    setDebugMaxVaultsOverride(DEBUG_FORCED_MAX_VAULTS);
    setDebugMaxVaultsOverride(null);
    const { container } = render(
      <MaxVaultsNotification connectedAddress="0xuser" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
