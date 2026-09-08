import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConnection } from "@/context/wallet/useConnection";

const wallet = vi.hoisted(() => ({
  btcConnected: true,
  ethConnected: true,
  confirmed: true,
  open: vi.fn(),
  disconnect: vi.fn(),
  useUTXOs: vi.fn(() => ({ inscriptionUTXOs: [] })),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => ({
    connected: wallet.confirmed,
    open: wallet.open,
    disconnect: wallet.disconnect,
  }),
  useWidgetState: () => ({ selectedWallets: {} }),
  useChainConnector: () => null,
  useBTCWallet: () => ({
    connected: wallet.btcConnected,
    address: "",
    publicKeyNoCoord: "",
    locked: false,
  }),
  useETHWallet: () => ({ connected: wallet.ethConnected, address: "" }),
}));

vi.mock("@/context/wallet", async () => {
  const { useBTCWallet, useETHWallet } = await import(
    "@babylonlabs-io/wallet-connector"
  );
  return { useBTCWallet, useETHWallet };
});

vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => ({ isGeoBlocked: false, isLoading: false }),
}));

vi.mock("@/hooks/useBtcWalletUnlock", () => ({
  useBtcWalletUnlock: () => ({ unlock: vi.fn(), isUnlocking: false }),
}));

vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: wallet.useUTXOs,
}));

import { Connect } from "../Connect";

describe("Connect current wallet requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.btcConnected = true;
    wallet.ethConnected = true;
    wallet.confirmed = true;
  });

  it.each([
    { btcConnected: false, ethConnected: false, confirmed: false },
    { btcConnected: false, ethConnected: true, confirmed: true },
    { btcConnected: true, ethConnected: false, confirmed: true },
    { btcConnected: true, ethConnected: true, confirmed: false },
  ])("keeps the connect prompt for %j", (state) => {
    Object.assign(wallet, state);

    render(<Connect />);

    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith("", { enabled: false });
    expect(wallet.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(wallet.open).toHaveBeenCalledTimes(1);
  });

  it("shows the wallet menu only after both wallets are confirmed", () => {
    render(<Connect />);

    expect(screen.getByTestId("wallet-menu-trigger")).toBeInTheDocument();
    expect(
      screen.queryByTestId("connect-wallet-button"),
    ).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith("", { enabled: true });
  });

  it("reports a combined connection before the menu accepts confirmation", () => {
    wallet.confirmed = false;

    const { result } = renderHook(useConnection);
    render(<Connect />);

    expect(result.current.isConnected).toBe(true);
    expect(screen.getByTestId("connect-wallet-button")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
  });

  it("keeps the prompt after Bitcoin reconnects without confirmation", () => {
    const { rerender } = render(<Connect />);
    expect(screen.getByTestId("wallet-menu-trigger")).toBeInTheDocument();

    wallet.btcConnected = false;
    wallet.confirmed = false;
    rerender(<Connect />);
    expect(screen.getByTestId("connect-wallet-button")).toBeInTheDocument();

    wallet.btcConnected = true;
    rerender(<Connect />);

    expect(screen.getByTestId("connect-wallet-button")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith("", { enabled: false });
    expect(wallet.open).not.toHaveBeenCalled();
    expect(wallet.disconnect).not.toHaveBeenCalled();
  });
});
