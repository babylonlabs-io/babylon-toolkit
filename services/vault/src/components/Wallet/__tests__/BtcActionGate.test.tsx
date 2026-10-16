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
  useWidgetState: () => ({ visible: false }),
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

  it("names the operation and mounts nothing when a ready wallet was not asked to start", () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    const { getByText, getByTestId, queryByTestId } = render(
      <BtcActionGate
        onClose={vi.fn()}
        autoStart={false}
        start={{ heading: "Do the thing", body: "It does it.", button: "Go" }}
      >
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByText("Do the thing")).toBeInTheDocument();
    expect(getByText("It does it.")).toBeInTheDocument();
    expect(getByTestId("btc-action-start")).toHaveTextContent("Go");
    expect(getByTestId("btc-action-cancel")).toBeInTheDocument();
    expect(queryByTestId("btc-action-retry")).not.toBeInTheDocument();
    expect(queryByTestId("gated-child")).not.toBeInTheDocument();
  });

  it("mounts the children when the named start button is clicked", () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    const { getByTestId } = render(
      <BtcActionGate
        onClose={vi.fn()}
        autoStart={false}
        start={{ heading: "Do the thing", body: "It does it.", button: "Go" }}
      >
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    fireEvent.click(getByTestId("btc-action-start"));

    expect(getByTestId("gated-child")).toBeInTheDocument();
  });

  it("keeps the generic Retry screen when no start copy is given", () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    const { getByText, getByTestId, queryByTestId } = render(
      <BtcActionGate onClose={vi.fn()} autoStart={false}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByText(COPY.wallet.btcAction.heading)).toBeInTheDocument();
    expect(getByTestId("btc-action-retry")).toBeInTheDocument();
    expect(queryByTestId("btc-action-start")).not.toBeInTheDocument();
    expect(queryByTestId("gated-child")).not.toBeInTheDocument();
  });

  it("lands on the named start card after an unlock when the flow was not asked to start", async () => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    wallet.state.locked = true;
    const start = {
      heading: "Do the thing",
      body: "It does it.",
      button: "Go",
    };
    const { getByTestId, getByText, queryByTestId, rerender } = render(
      <BtcActionGate onClose={vi.fn()} autoStart={false} start={start}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    await act(async () => {
      fireEvent.click(getByTestId("btc-action-unlock"));
    });
    wallet.state.locked = false;
    rerender(
      <BtcActionGate onClose={vi.fn()} autoStart={false} start={start}>
        <div data-testid="gated-child" />
      </BtcActionGate>,
    );

    expect(getByText("Do the thing")).toBeInTheDocument();
    expect(getByTestId("btc-action-start")).toBeInTheDocument();
    expect(queryByTestId("gated-child")).not.toBeInTheDocument();
  });
});
