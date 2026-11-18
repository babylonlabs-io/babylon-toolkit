import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readDepositorAllowed } from "@/clients/eth-contract/allow-list-policy";

import { RECORDED_DEPOSITOR } from "../../../e2e/fixtures/replay/contracts";
import { useWaitlist } from "../useWaitlist";

const ADAPTER = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

const state = vi.hoisted(() => ({
  confirmed: true,
  ethConnected: true,
  ethAddress: "",
  pickerVisible: false,
  answers: {} as Record<string, boolean>,
  open: vi.fn(),
}));

vi.mock("@babylonlabs-io/wallet-connector/btc-eth", () => ({
  useWalletConnect: () => ({ connected: state.confirmed, open: state.open }),
  useWidgetState: () => ({
    visible: state.pickerVisible,
    chains: {},
    selectedWallets: {},
  }),
  useChainConnector: () => null,
  useBTCWallet: () => ({ connected: false }),
  useETHWallet: () => ({
    connected: state.ethConnected,
    address: state.ethAddress,
  }),
}));

vi.mock("@/context/wallet", async () => {
  const { useETHWallet } = await import(
    "@babylonlabs-io/wallet-connector/btc-eth"
  );
  const { useConnection } = await import("@/context/wallet/useConnection");
  return { useETHWallet, useConnection };
});

vi.mock("@/applications/aave/context", () => ({
  useAaveConfig: () => ({ config: { adapterAddress: ADAPTER } }),
}));

vi.mock("@/clients/eth-contract/allow-list-policy", () => ({
  readDepositorAllowed: vi.fn(),
}));

function renderWaitlist(depositOpen = false, committedShow: boolean[] = []) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ depositOpen }: { depositOpen: boolean }) => {
      const waitlist = useWaitlist(depositOpen);
      useEffect(() => {
        committedShow.push(waitlist.show);
      });
      return waitlist;
    },
    { wrapper, initialProps: { depositOpen } },
  );
}

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

describe("useWaitlist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.confirmed = true;
    state.ethConnected = true;
    state.ethAddress = RECORDED_DEPOSITOR.ETH_ADDRESS;
    state.pickerVisible = false;
    state.answers = { [RECORDED_DEPOSITOR.ETH_ADDRESS]: false };
    vi.mocked(readDepositorAllowed).mockImplementation(({ depositor }) =>
      depositor in state.answers
        ? Promise.resolve(state.answers[depositor])
        : new Promise<boolean>(() => {}),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows for a connected wallet the allow-list rejects", async () => {
    const { result } = renderWaitlist();
    await settle();

    expect(result.current.show).toBe(true);
    expect(result.current.address).toBe(RECORDED_DEPOSITOR.ETH_ADDRESS);
  });

  it("stays hidden for a wallet the allow-list accepts", async () => {
    state.answers = { [RECORDED_DEPOSITOR.ETH_ADDRESS]: true };

    const { result } = renderWaitlist();
    await settle();

    expect(result.current.show).toBe(false);
  });

  it("stays hidden while the allow-list read loads", async () => {
    state.answers = {};

    const { result } = renderWaitlist();
    await settle();

    expect(result.current.show).toBe(false);
  });

  it("stays hidden when the allow-list read fails", async () => {
    vi.mocked(readDepositorAllowed).mockRejectedValue(new Error("rpc down"));

    const { result } = renderWaitlist();
    await settle();

    expect(result.current.show).toBe(false);
  });

  it("stays hidden and reads nothing without a confirmed session", async () => {
    state.confirmed = false;

    const { result } = renderWaitlist();
    await settle();

    expect(result.current.show).toBe(false);
    expect(readDepositorAllowed).not.toHaveBeenCalled();
  });

  it("stays hidden while the wallet picker is open", async () => {
    state.pickerVisible = true;

    const { result } = renderWaitlist();
    await settle();

    expect(result.current.show).toBe(false);
  });

  it("stays hidden while the deposit dialog is open and shows once it closes", async () => {
    const { result, rerender } = renderWaitlist(true);
    await settle();
    expect(result.current.show).toBe(false);

    rerender({ depositOpen: false });
    expect(result.current.show).toBe(true);
  });

  it("reads the list once for the connected address on the Aave adapter, without polling", async () => {
    renderWaitlist();
    await settle();

    await act(() => vi.advanceTimersByTimeAsync(120_000));

    expect(readDepositorAllowed).toHaveBeenCalledTimes(1);
    expect(readDepositorAllowed).toHaveBeenCalledWith({
      applicationEntryPoint: ADAPTER,
      depositor: RECORDED_DEPOSITOR.ETH_ADDRESS,
    });
  });

  it("hides after dismissal", async () => {
    const { result } = renderWaitlist();
    await settle();

    act(() => result.current.dismiss());

    expect(result.current.show).toBe(false);
  });

  it("checks the new address when a dismissed session switches wallet, and shows once that address is rejected", async () => {
    state.answers = { ...state.answers, [OTHER_ADDRESS]: false };
    const { result, rerender } = renderWaitlist();
    await settle();
    act(() => result.current.dismiss());

    state.ethAddress = OTHER_ADDRESS;
    rerender({ depositOpen: false });
    expect(result.current.show).toBe(false);

    await settle();
    expect(result.current.show).toBe(true);
    expect(result.current.address).toBe(OTHER_ADDRESS);
    expect(readDepositorAllowed).toHaveBeenLastCalledWith({
      applicationEntryPoint: ADAPTER,
      depositor: OTHER_ADDRESS,
    });
  });

  it("shows again when a dismissed session disconnects and reconnects the same address", async () => {
    const { result, rerender } = renderWaitlist();
    await settle();
    act(() => result.current.dismiss());

    state.confirmed = false;
    rerender({ depositOpen: false });
    await settle();
    expect(result.current.show).toBe(false);

    state.confirmed = true;
    rerender({ depositOpen: false });
    await settle();
    expect(result.current.show).toBe(true);
    expect(result.current.address).toBe(RECORDED_DEPOSITOR.ETH_ADDRESS);
  });

  it("re-reads the list when the same wallet reconnects, so a newly approved wallet sees no notice", async () => {
    const { result, rerender } = renderWaitlist();
    await settle();
    expect(result.current.show).toBe(true);

    state.confirmed = false;
    rerender({ depositOpen: false });
    await settle();
    state.answers = { [RECORDED_DEPOSITOR.ETH_ADDRESS]: true };
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    state.confirmed = true;
    rerender({ depositOpen: false });
    await settle();

    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);
    expect(result.current.show).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);
  });

  it("never commits the cached denial for a newly approved wallet that reconnects", async () => {
    const committedShow: boolean[] = [];
    const { rerender } = renderWaitlist(false, committedShow);
    await settle();
    state.confirmed = false;
    rerender({ depositOpen: false });
    await settle();
    state.answers = { [RECORDED_DEPOSITOR.ETH_ADDRESS]: true };
    committedShow.length = 0;

    state.confirmed = true;
    rerender({ depositOpen: false });
    await settle();

    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);
    expect(committedShow).not.toContain(true);
  });

  it("shows a still-denied reconnecting wallet only after its fresh read answers", async () => {
    const committedShow: boolean[] = [];
    const { result, rerender } = renderWaitlist(false, committedShow);
    await settle();
    state.confirmed = false;
    rerender({ depositOpen: false });
    await settle();
    let answer: (allowed: boolean) => void = () => {};
    vi.mocked(readDepositorAllowed).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    committedShow.length = 0;

    state.confirmed = true;
    rerender({ depositOpen: false });
    await settle();
    expect(committedShow).not.toContain(true);

    await act(async () => answer(false));
    await settle();
    expect(result.current.show).toBe(true);
  });
});
