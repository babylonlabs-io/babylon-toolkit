import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Connect } from "../Connect";

const state = vi.hoisted(() => ({
  btcConnected: false,
  btcLocked: false,
  ethConnected: true,
  sessionConfirmed: true,
  open: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  AvatarGroup: ({ children }: { children: React.ReactNode }) => children,
  BtcEthWalletMenu: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="btc-eth-wallet-menu">{trigger}</div>
  ),
  ConnectButton: ({
    onClick,
    text = "Connect",
    disabled,
    "data-testid": dataTestId = "connect-wallet-button",
  }: {
    onClick: () => void;
    text?: string;
    disabled?: boolean;
    "data-testid"?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
    >
      {text}
    </button>
  ),
  Hint: ({ children }: { children: React.ReactNode }) => children,
  WalletIcon: ({ alt }: { alt: string }) => <span>{alt}</span>,
  WalletMenu: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="eth-wallet-menu">{trigger}</div>
  ),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => ({
    connected: state.sessionConfirmed,
    open: state.open,
    disconnect: state.disconnect,
  }),
  useWidgetState: () => ({
    selectedWallets: {
      ...(state.btcConnected
        ? { BTC: { name: "Bitcoin Wallet", icon: "btc.svg" } }
        : {}),
      ...(state.ethConnected
        ? { ETH: { name: "Ethereum Wallet", icon: "eth.svg" } }
        : {}),
    },
  }),
  useChainConnector: () => null,
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({
    connected: state.btcConnected,
    address: state.btcConnected ? "bc1ptest" : "",
    publicKeyNoCoord: state.btcConnected ? "pubkey" : "",
    locked: state.btcLocked,
  }),
  useETHWallet: () => ({
    connected: state.ethConnected,
    address: state.ethConnected ? "0x1234" : undefined,
  }),
}));

vi.mock("@/context/addressScreening", () => ({
  useAddressScreening: () => ({ isBlocked: false, isLoading: false }),
}));
vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => ({ isGeoBlocked: false, isLoading: false }),
}));
vi.mock("@/hooks/useBtcWalletUnlock", () => ({
  useBtcWalletUnlock: () => ({ unlock: vi.fn(), isUnlocking: false }),
}));
vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: () => ({ inscriptionUTXOs: [] }),
}));
vi.mock("@/state/AppState", () => ({
  useAppState: () => ({
    includeOrdinals: vi.fn(),
    excludeOrdinals: vi.fn(),
    ordinalsExcluded: false,
  }),
}));

describe("Connect — optional BTC navbar state", () => {
  beforeEach(() => {
    state.btcConnected = false;
    state.btcLocked = false;
    state.ethConnected = true;
    state.sessionConfirmed = true;
    state.open.mockClear();
  });

  it("keeps the ETH wallet menu and offers a targeted BTC connection", () => {
    render(<Connect />);

    expect(screen.getByTestId("eth-wallet-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("btc-eth-wallet-menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connect BTC" }));
    expect(state.open).toHaveBeenCalledWith("BTC");
  });

  it("gives the BTC connect control an E2E hook of its own", () => {
    render(<Connect />);

    // The default `connect-wallet-button` denotes the disconnected Connect
    // control, so the real-wallet suite could not target this one without a
    // dedicated id.
    expect(screen.getByTestId("connect-btc-button")).toBeInTheDocument();
  });

  it("gives the locked-wallet unlock control an E2E hook of its own", () => {
    state.btcLocked = true;

    render(<Connect />);

    expect(screen.getByTestId("unlock-btc-wallet-button")).toBeInTheDocument();
  });

  it("uses the full BTC/ETH menu after both wallets connect", () => {
    state.btcConnected = true;

    render(<Connect />);

    expect(screen.getByTestId("btc-eth-wallet-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("eth-wallet-menu")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect BTC" }),
    ).not.toBeInTheDocument();
  });

  it("does not expose the connected menu before the ETH session is confirmed", () => {
    state.btcConnected = true;
    state.btcLocked = true;
    state.sessionConfirmed = false;

    render(<Connect />);

    expect(screen.queryByTestId("eth-wallet-menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /unlock/i }),
    ).not.toBeInTheDocument();
  });
});
