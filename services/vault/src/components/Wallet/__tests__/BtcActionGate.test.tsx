import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { BtcActionGate } from "../BtcActionGate";

const wallet = vi.hoisted(() => {
  const state = {
    connected: false,
    confirmed: false,
    loading: true,
    locked: false,
    open: vi.fn(),
    reconnect: vi.fn(),
  };
  const useBTCWallet = () => ({
    connected: state.connected,
    loading: state.loading,
    locked: state.locked,
    reconnect: state.reconnect,
  });
  return { state, useBTCWallet };
});

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: wallet.useBTCWallet,
  useWalletConnect: () => ({
    connected: wallet.state.confirmed,
    open: wallet.state.open,
  }),
  isUserRejectionMessage: () => false,
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: wallet.useBTCWallet,
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("BtcActionGate", () => {
  beforeEach(() => {
    wallet.state.connected = false;
    wallet.state.confirmed = false;
    wallet.state.loading = true;
    wallet.state.locked = false;
    wallet.state.open.mockClear();
    wallet.state.reconnect.mockReset();
    wallet.state.reconnect.mockResolvedValue(undefined);
  });

  it("shows the resolving loader and mounts nothing while the wallet is still loading", () => {
    const onClose = vi.fn();
    const { getByText, queryByText, queryByTestId, queryAllByRole } = render(
      <BtcActionGate onClose={onClose}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByText(COPY.wallet.btcAction.resolving)).toBeInTheDocument();
    expect(queryByTestId("gated-child")).not.toBeInTheDocument();
    expect(queryByText(COPY.wallet.btcAction.heading)).not.toBeInTheDocument();
    expect(queryAllByRole("button")).toHaveLength(1);
    fireEvent.click(getByText(COPY.wallet.btcAction.cancel));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the unlock button instead of the loader when the Bitcoin wallet is locked", () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    wallet.state.locked = true;
    const { getByText, getByTestId, queryByText, queryByTestId } = render(
      <BtcActionGate onClose={vi.fn()} ready={false}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByText(COPY.wallet.locked.title)).toBeInTheDocument();
    expect(getByText(COPY.wallet.locked.description)).toBeInTheDocument();
    expect(getByTestId("btc-action-unlock")).toHaveTextContent(
      COPY.wallet.locked.unlockButton,
    );
    expect(
      queryByText(COPY.wallet.btcAction.resolving),
    ).not.toBeInTheDocument();
    expect(queryByTestId("gated-child")).not.toBeInTheDocument();
  });

  it("prompts the wallet unlock when the unlock button is clicked", async () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    wallet.state.locked = true;
    const { getByTestId } = render(
      <BtcActionGate onClose={vi.fn()}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    await act(async () => {
      fireEvent.click(getByTestId("btc-action-unlock"));
    });

    expect(wallet.state.reconnect).toHaveBeenCalledOnce();
    expect(wallet.state.open).not.toHaveBeenCalled();
  });

  it("mounts the children once the wallet unlocks after the unlock click", async () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    wallet.state.locked = true;
    const { getByTestId, queryByTestId, rerender } = render(
      <BtcActionGate onClose={vi.fn()} ready={false}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    await act(async () => {
      fireEvent.click(getByTestId("btc-action-unlock"));
    });
    wallet.state.locked = false;
    rerender(
      <BtcActionGate onClose={vi.fn()} ready={true}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByTestId("gated-child")).toBeInTheDocument();
    expect(queryByTestId("btc-action-unlock")).not.toBeInTheDocument();
  });
});
