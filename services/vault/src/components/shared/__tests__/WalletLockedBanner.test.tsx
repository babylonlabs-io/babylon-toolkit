import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { WalletLockedBanner } from "../WalletLockedBanner";

const reconnect = vi.fn();

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ reconnect }),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  isUserRejectionMessage: () => false,
}));

describe("WalletLockedBanner", () => {
  beforeEach(() => {
    reconnect.mockReset();
    reconnect.mockResolvedValue(undefined);
  });

  it("shows the locked message and unlock button when visible", () => {
    render(<WalletLockedBanner visible />);

    expect(screen.getByText(COPY.wallet.locked.title)).toBeInTheDocument();
    expect(
      screen.getByText(COPY.wallet.locked.description),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.wallet.locked.unlockButton }),
    ).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<WalletLockedBanner visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("calls reconnect when the unlock button is clicked", () => {
    render(<WalletLockedBanner visible />);

    fireEvent.click(
      screen.getByRole("button", { name: COPY.wallet.locked.unlockButton }),
    );

    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
