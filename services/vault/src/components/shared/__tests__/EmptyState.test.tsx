import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Wallet", () => ({
  Connect: () => <button type="button">Connect</button>,
}));

// Import after mocks
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("invokes onAction with no arguments when the action button is clicked", () => {
    // Callers pass handlers with optional parameters (e.g.
    // `openDeposit(initialAmountBtc?: string)`). Forwarding the click event
    // would put a MouseEvent in that parameter and crash downstream consumers.
    const onAction = vi.fn();

    render(
      <EmptyState
        avatarUrl="/images/btc.svg"
        avatarAlt="BTC"
        title="No active loans"
        isConnected
        actionLabel="Deposit"
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith();
  });

  it("renders the connected action button as the brand orange (secondary) CTA", () => {
    // core-ui `contained secondary` (`bg-secondary-main`) is the brand orange
    // used by the ConnectButton; `primary` is the blue. The Deposit CTA must be
    // orange, matching the v3 design.
    render(
      <EmptyState
        avatarUrl="/images/btc.svg"
        avatarAlt="BTC"
        title="No active loans"
        isConnected
        actionLabel="Deposit"
        onAction={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Deposit" });
    expect(button.className).toContain("bbn-btn-secondary");
    expect(button.className).not.toContain("bbn-btn-primary");
  });

  it("renders the shared document illustration when no avatar is given", () => {
    // Every v3 empty state (vaults / loans / activity) uses the same Figma
    // illustration; only the v2 reserve-detail prompt passes an avatar.
    const { container, rerender } = render(
      <EmptyState title="No active loans" isConnected />,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(
      <EmptyState avatarUrl="/images/btc.svg" title="Connect" isConnected />,
    );

    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders no illustration for the compact variant", () => {
    // The compact surfaces (reserve-detail prompt, overview liquidation panel)
    // sit inside their own chrome and predate the v3 illustration — the v3
    // default must not leak into them.
    const { container } = render(
      <EmptyState
        variant="compact"
        title="No collateral"
        description="Deposit first"
        isConnected
      />,
    );

    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("Deposit first").className).toContain("text-sm");
  });

  it("renders the connect prompt instead of the action button when disconnected", () => {
    const onAction = vi.fn();

    render(
      <EmptyState
        avatarUrl="/images/btc.svg"
        avatarAlt="BTC"
        title="No active loans"
        isConnected={false}
        actionLabel="Deposit"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deposit" }),
    ).not.toBeInTheDocument();
  });
});
