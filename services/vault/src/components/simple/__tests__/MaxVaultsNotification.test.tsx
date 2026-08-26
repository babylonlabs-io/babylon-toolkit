import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseVaultCountCap = vi.fn();
vi.mock("@/hooks/useVaultCountCap", () => ({
  useVaultCountCap: (...args: unknown[]) => mockUseVaultCountCap(...args),
}));

const featureFlagsMock = vi.hoisted(() => ({
  isGodModePanelEnabled: true,
}));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

import { setMaxVaultsOverride } from "@/overrides/protocolStatus";

import { MaxVaultsNotification } from "../MaxVaultsNotification";

const FORCED_MAX_VAULTS = 10;

const BELOW_CAP = {
  isAtCap: false,
  maxVaults: 10,
  currentCount: 3,
  capUnavailable: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  setMaxVaultsOverride(null);
});

describe("MaxVaultsNotification", () => {
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
      screen.getByText(/maximum number of BTCVaults \(10\)/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the card from the god-mode override while below the live cap", () => {
    mockUseVaultCountCap.mockReturnValue(BELOW_CAP);

    setMaxVaultsOverride(FORCED_MAX_VAULTS);
    render(<MaxVaultsNotification connectedAddress="0xuser" />);

    expect(screen.getByTestId("max-vaults-notification")).toHaveAttribute(
      "data-tone",
      "too-many",
    );
    expect(
      screen.getByText(
        new RegExp(`maximum number of BTCVaults \\(${FORCED_MAX_VAULTS}\\)`),
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing once the god-mode override is released", () => {
    mockUseVaultCountCap.mockReturnValue(BELOW_CAP);

    setMaxVaultsOverride(FORCED_MAX_VAULTS);
    setMaxVaultsOverride(null);
    const { container } = render(
      <MaxVaultsNotification connectedAddress="0xuser" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
