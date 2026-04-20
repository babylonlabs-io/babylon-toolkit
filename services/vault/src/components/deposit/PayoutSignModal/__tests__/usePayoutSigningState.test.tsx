import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageStatus } from "../../../../models/peginStateMachine";
import { usePayoutSigningState } from "../usePayoutSigningState";

// Mock the SDK adapter the hook delegates to. We don't care here whether the
// SDK actually polls / signs — only that the hook wires it up and respects
// the contract (no double-invocation, abort handling, error mapping, etc.).
const mockSignAndSubmitPayouts = vi.fn();
vi.mock("../../../../hooks/deposit/depositFlowSteps/payoutSigning", () => ({
  signAndSubmitPayouts: (...args: unknown[]) =>
    mockSignAndSubmitPayouts(...args),
}));

const mockSetOptimisticStatus = vi.fn();
vi.mock("../../../../context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({
    setOptimisticStatus: mockSetOptimisticStatus,
  }),
}));

const mockFindProvider = vi.fn();
vi.mock("../../../../hooks/deposit/useVaultProviders", () => ({
  useVaultProviders: () => ({ findProvider: mockFindProvider }),
}));

let mockBtcConnector: {
  connectedWallet?: {
    account?: { address: string };
    provider?: unknown;
  };
} | null = null;
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: vi.fn(() => mockBtcConnector),
}));

const mockBtcAddressToScriptPubKeyHex = vi.fn();
vi.mock("../../../../utils/btc", () => ({
  btcAddressToScriptPubKeyHex: (addr: string) =>
    mockBtcAddressToScriptPubKeyHex(addr),
}));

vi.mock("../../../../utils/errors/formatting", () => ({
  formatPayoutSignatureError: (err: unknown) => ({
    title: "Sign Error",
    message: err instanceof Error ? err.message : String(err),
  }),
}));

const ACTIVITY = {
  id: "0xvault" as Hex,
  peginTxHash: "0xpegin" as Hex,
  applicationEntryPoint: "0xapp",
  depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
  providers: [{ id: "0xprovider" as Hex }],
};
const PROVIDER = { btcPubKey: "0xvpkey" };
const BTC_WALLET = { signPsbt: vi.fn() };
const onSuccess = vi.fn();

function setupHappyPath() {
  mockFindProvider.mockReturnValue(PROVIDER);
  mockBtcConnector = {
    connectedWallet: {
      account: { address: "tb1test" },
      provider: BTC_WALLET,
    },
  };
  mockBtcAddressToScriptPubKeyHex.mockReturnValue(
    ACTIVITY.depositorPayoutBtcAddress,
  );
}

function renderHookWithProps(
  overrides: Partial<Parameters<typeof usePayoutSigningState>[0]> = {},
) {
  return renderHook(() =>
    usePayoutSigningState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activity: ACTIVITY as any,
      btcPublicKey: "0xbtcpub",
      depositorEthAddress: "0xeth" as Hex,
      onSuccess,
      ...overrides,
    }),
  );
}

describe("usePayoutSigningState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBtcConnector = null;
    setupHappyPath();
    mockSignAndSubmitPayouts.mockResolvedValue(undefined);
  });

  describe("happy path", () => {
    it("calls signAndSubmitPayouts, marks complete, fires onSuccess and optimistic update", async () => {
      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      const call = mockSignAndSubmitPayouts.mock.calls[0][0];
      expect(call.vaultId).toBe(ACTIVITY.id);
      expect(call.peginTxHash).toBe(ACTIVITY.peginTxHash);
      expect(call.providerBtcPubKey).toBe(PROVIDER.btcPubKey);
      expect(call.btcWallet).toBe(BTC_WALLET);
      expect(call.signal).toBeInstanceOf(AbortSignal);

      expect(result.current.isComplete).toBe(true);
      expect(result.current.signing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(mockSetOptimisticStatus).toHaveBeenCalledWith(
        ACTIVITY.id,
        LocalStorageStatus.PAYOUT_SIGNED,
      );
    });

    it("propagates onProgress updates from the SDK", async () => {
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          onProgress,
        }: {
          onProgress: (
            p: { completed: number; totalClaimers: number } | null,
          ) => void;
        }) => {
          onProgress({ completed: 1, totalClaimers: 3 });
          onProgress({ completed: 2, totalClaimers: 3 });
          onProgress({ completed: 3, totalClaimers: 3 });
          // Final null sentinel from SDK should not overwrite progress.
          onProgress(null);
        },
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.progress).toEqual({
        completed: 3,
        totalClaimers: 3,
      });
    });
  });

  describe("guards", () => {
    it("errors when depositorPayoutBtcAddress is missing", async () => {
      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, depositorPayoutBtcAddress: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Missing Payout Address");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when wallet scriptPubKey doesn't match indexer payout address", async () => {
      mockBtcAddressToScriptPubKeyHex.mockReturnValue("0xdifferent");

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Payout Address Mismatch");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when vault provider is not found", async () => {
      mockFindProvider.mockReturnValue(undefined);

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Provider Not Found");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when BTC wallet is not connected", async () => {
      mockBtcConnector = {
        connectedWallet: { account: { address: "tb1test" } },
      };

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Wallet Not Connected");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("clears the in-flight ref on guard failure so the SAME hook instance can retry", async () => {
      // The bug we're protecting against: an early-return guard path that
      // forgets to clear `inFlightRef`. That would lock the SAME hook
      // instance out of all future handleSign() calls forever.
      // We must therefore exercise both calls on a single rendered hook,
      // not two separate instances.
      type Props = Parameters<typeof usePayoutSigningState>[0];
      const badActivity = {
        ...ACTIVITY,
        depositorPayoutBtcAddress: undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const { result, rerender } = renderHook(
        (props: Props) => usePayoutSigningState(props),
        {
          initialProps: {
            activity: badActivity,
            btcPublicKey: "0xbtcpub",
            depositorEthAddress: "0xeth" as Hex,
            onSuccess,
          },
        },
      );

      // First handleSign → missing payout address guard fires.
      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.error?.title).toBe("Missing Payout Address");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();

      // Re-render the SAME hook with a fixed activity — second handleSign
      // on the same instance must reach the SDK call. If `inFlightRef`
      // wasn't cleared on the guard path, this assertion would fail.
      rerender({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: ACTIVITY as any,
        btcPublicKey: "0xbtcpub",
        depositorEthAddress: "0xeth" as Hex,
        onSuccess,
      });
      await act(async () => {
        await result.current.handleSign();
      });
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      expect(result.current.isComplete).toBe(true);
    });
  });

  describe("reentrancy guard", () => {
    it("ignores a second handleSign call while signing is in flight", async () => {
      // Make the SDK call deliberately slow so two calls overlap.
      let resolveSdk: () => void;
      mockSignAndSubmitPayouts.mockImplementation(
        () => new Promise<void>((resolve) => (resolveSdk = resolve)),
      );

      const { result } = renderHookWithProps();

      // Fire two back-to-back invocations BEFORE awaiting either.
      const calls = await act(async () => {
        const first = result.current.handleSign();
        const second = result.current.handleSign();
        return [first, second];
      });

      // SDK should have been called exactly once.
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();

      // Resolve the slow SDK call so both promises settle.
      await act(async () => {
        resolveSdk!();
        await Promise.all(calls);
      });

      expect(result.current.isComplete).toBe(true);
    });
  });

  describe("error handling", () => {
    it("maps thrown errors via formatPayoutSignatureError", async () => {
      mockSignAndSubmitPayouts.mockRejectedValueOnce(
        new Error("VP unreachable"),
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error).toEqual({
        title: "Sign Error",
        message: "VP unreachable",
      });
      expect(result.current.signing).toBe(false);
      expect(result.current.isComplete).toBe(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockSetOptimisticStatus).not.toHaveBeenCalled();
    });

    it("treats AbortError as a silent end-of-flow (no error state)", async () => {
      const abortErr = new Error("aborted");
      abortErr.name = "AbortError";
      mockSignAndSubmitPayouts.mockRejectedValueOnce(abortErr);

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.signing).toBe(false);
      expect(result.current.isComplete).toBe(false);
    });
  });

  describe("unmount cleanup", () => {
    it("does not abort the in-flight signal under React StrictMode's simulated unmount", async () => {
      // Regression: StrictMode runs effects mount→cleanup→remount on the
      // first commit. A direct abort-on-cleanup would kill the controller
      // that handleSign just created, causing "Polling aborted" to surface
      // in dev as a spurious failure on the very first sign attempt.
      let observedSignal: AbortSignal | undefined;
      let resolveSdk: (() => void) | undefined;
      mockSignAndSubmitPayouts.mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<void>((resolve) => {
            observedSignal = signal;
            resolveSdk = resolve;
          }),
      );

      const { result } = renderHook(
        () =>
          usePayoutSigningState({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activity: ACTIVITY as any,
            btcPublicKey: "0xbtcpub",
            depositorEthAddress: "0xeth" as Hex,
            onSuccess,
          }),
        { wrapper: StrictMode },
      );

      act(() => {
        void result.current.handleSign();
      });
      await waitFor(() => expect(mockSignAndSubmitPayouts).toHaveBeenCalled());

      // Give setTimeout(0) a chance to fire if the deferred-abort guard is
      // broken. The signal must still be live after StrictMode's simulated
      // unmount/remount cycle.
      await new Promise((r) => setTimeout(r, 10));
      expect(observedSignal?.aborted).toBe(false);

      // Let the SDK resolve so the hook's try/finally cleans up.
      await act(async () => {
        resolveSdk!();
      });
    });

    it("aborts the in-flight signal when the hook unmounts", async () => {
      let observedSignal: AbortSignal | undefined;
      mockSignAndSubmitPayouts.mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<void>((_resolve, reject) => {
            observedSignal = signal;
            signal.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            });
          }),
      );

      const { result, unmount } = renderHookWithProps();

      // Kick off signing without awaiting it.
      act(() => {
        void result.current.handleSign();
      });
      await waitFor(() => expect(mockSignAndSubmitPayouts).toHaveBeenCalled());

      // Unmount mid-flight. The cleanup defers the abort to the next tick
      // so that React StrictMode's simulated unmount doesn't kill work that
      // the immediate remount will keep running.
      unmount();
      await waitFor(() => expect(observedSignal?.aborted).toBe(true));
    });
  });
});
