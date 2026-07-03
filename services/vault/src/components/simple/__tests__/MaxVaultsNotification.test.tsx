import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseVaultCountCap = vi.fn();
vi.mock("@/hooks/useVaultCountCap", () => ({
  useVaultCountCap: (...args: unknown[]) => mockUseVaultCountCap(...args),
}));

import { MaxVaultsNotification } from "../MaxVaultsNotification";

beforeEach(() => vi.clearAllMocks());

describe("MaxVaultsNotification", () => {
  it("renders the cap warning when the position is at the cap", () => {
    mockUseVaultCountCap.mockReturnValue({
      isAtCap: true,
      maxVaults: 10,
      currentCount: 10,
      capUnavailable: false,
    });

    render(<MaxVaultsNotification connectedAddress="0xuser" />);

    expect(screen.getByText("Maximum BTC Vaults reached")).toBeInTheDocument();
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
});
