import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECORDED_DEPOSITOR } from "../../../../e2e/fixtures/replay/contracts";
import { AddressScreeningProvider } from "../../../context/addressScreening";
import { useConnection } from "../../../context/wallet/useConnection";
import { COPY } from "../../../copy";
import { setAddressScreeningResult } from "../../../storage/addressScreeningStorage";
import { Connect } from "../Connect";

const wallet = vi.hoisted(() => ({
  btcConnected: true,
  ethConnected: true,
  confirmed: true,
  btcLocked: false,
  btcAddress: "",
  ethAddress: "",
  isGeoBlocked: false,
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
    address: wallet.btcAddress,
    publicKeyNoCoord: "",
    locked: wallet.btcLocked,
  }),
  useETHWallet: () => ({
    connected: wallet.ethConnected,
    address: wallet.ethAddress,
  }),
}));

vi.mock("@/context/wallet", async () => {
  const { useBTCWallet, useETHWallet } = await import(
    "@babylonlabs-io/wallet-connector"
  );
  const { useConnection } = await import("@/context/wallet/useConnection");
  return { useBTCWallet, useETHWallet, useConnection };
});

vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => ({
    isGeoBlocked: wallet.isGeoBlocked,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useBtcWalletUnlock", () => ({
  useBtcWalletUnlock: () => ({ unlock: vi.fn(), isUnlocking: false }),
}));

vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: wallet.useUTXOs,
}));

describe("Connect current wallet requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.btcConnected = true;
    wallet.ethConnected = true;
    wallet.confirmed = true;
    wallet.btcLocked = false;
    wallet.btcAddress = RECORDED_DEPOSITOR.BTC_ADDRESS;
    wallet.ethAddress = RECORDED_DEPOSITOR.ETH_ADDRESS;
    wallet.isGeoBlocked = false;
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("keeps the connect prompt when both wallets are missing", () => {
    wallet.btcConnected = false;
    wallet.ethConnected = false;
    wallet.confirmed = false;

    render(<Connect />);

    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });
    expect(wallet.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(wallet.open).toHaveBeenCalledTimes(1);
  });

  it("keeps the connect prompt when Bitcoin is missing", () => {
    wallet.btcConnected = false;
    wallet.ethConnected = true;
    wallet.confirmed = true;

    render(<Connect />);

    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });
    expect(wallet.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(wallet.open).toHaveBeenCalledTimes(1);
  });

  it("keeps the connect prompt when Ethereum is missing", () => {
    wallet.btcConnected = true;
    wallet.ethConnected = false;
    wallet.confirmed = true;

    render(<Connect />);

    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(wallet.btcAddress, {
      enabled: false,
    });
    expect(wallet.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(wallet.open).toHaveBeenCalledTimes(1);
  });

  it("keeps the connect prompt before wallet confirmation", () => {
    wallet.btcConnected = true;
    wallet.ethConnected = true;
    wallet.confirmed = false;

    render(<Connect />);

    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(wallet.btcAddress, {
      enabled: false,
    });
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
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(wallet.btcAddress, {
      enabled: true,
    });
  });

  it("keeps the page and menu disconnected before confirmation", () => {
    wallet.confirmed = false;

    const { result } = renderHook(useConnection);
    render(<Connect />);

    expect(result.current.isConnected).toBe(false);
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
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(wallet.btcAddress, {
      enabled: false,
    });
    expect(wallet.open).not.toHaveBeenCalled();
    expect(wallet.disconnect).not.toHaveBeenCalled();
  });

  it("shows only Ethereum without Bitcoin queries when the flag is on", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.btcConnected = false;

    const { result } = renderHook(useConnection);
    render(<Connect />);
    fireEvent.click(screen.getByTestId("wallet-menu-trigger"));

    expect(result.current.isConnected).toBe(true);
    expect(screen.getByText("Ethereum Wallet")).toBeInTheDocument();
    expect(screen.queryByText("Bitcoin Wallet")).not.toBeInTheDocument();
    expect(screen.queryByText("Bitcoin Public Key")).not.toBeInTheDocument();
    expect(screen.queryByText("Using Inscriptions")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Wallets" }));
    expect(wallet.disconnect).toHaveBeenCalledExactlyOnceWith();
  });

  it("still requires consent for Ethereum when the flag is on", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.btcConnected = false;
    wallet.confirmed = false;

    const { result } = renderHook(useConnection);
    render(<Connect />);

    expect(result.current.isConnected).toBe(false);
    expect(screen.getByTestId("connect-wallet-button")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });
  });

  it("keeps the Ethereum menu when optional Bitcoin locks", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.btcLocked = true;

    render(<Connect />);

    expect(screen.getByTestId("wallet-menu-trigger")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.wallet.locked.unlockButton }),
    ).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });
  });

  it("keeps the unlock prompt when the flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "false");
    wallet.btcLocked = true;

    render(<Connect />);

    expect(
      screen.getByRole("button", { name: COPY.wallet.locked.unlockButton }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
  });

  it("keeps the location restriction for Ethereum-only sessions", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.btcConnected = false;
    wallet.isGeoBlocked = true;

    render(<Connect />);

    expect(screen.getByTestId("connect-wallet-button")).toBeDisabled();
    expect(screen.queryByTestId("wallet-menu-trigger")).not.toBeInTheDocument();
    expect(wallet.useUTXOs).toHaveBeenLastCalledWith(undefined, {
      enabled: false,
    });
  });

  it("keeps address screening and lets blocked sessions disconnect", async () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    wallet.btcConnected = false;
    wallet.btcAddress = "";
    wallet.confirmed = false;
    setAddressScreeningResult(wallet.ethAddress, true);

    const { rerender } = render(
      <AddressScreeningProvider>
        <Connect />
      </AddressScreeningProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("connect-wallet-button")).toBeDisabled(),
    );

    wallet.confirmed = true;
    rerender(
      <AddressScreeningProvider>
        <Connect />
      </AddressScreeningProvider>,
    );
    fireEvent.click(screen.getByTestId("wallet-menu-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Wallets" }));

    expect(wallet.disconnect).toHaveBeenCalledExactlyOnceWith();
  });
});
