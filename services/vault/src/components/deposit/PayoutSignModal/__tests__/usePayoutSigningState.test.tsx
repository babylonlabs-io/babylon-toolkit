import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageStatus } from "../../../../models/peginStateMachine";
import { VaultLifecycleStateError } from "../../../../utils/errors/vaultLifecycleStateError";
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

vi.mock("../../../../models/peginStateMachine", () => ({
  LocalStorageStatus: {
    PAYOUT_SIGNED: "payout_signed",
  },
}));

const mockFindProvider = vi.fn();
vi.mock("../../../../hooks/deposit/useVaultProviders", () => ({
  useVaultProviders: () => ({ findProvider: mockFindProvider }),
}));

const mockFetchVaultPayoutScriptPubKey = vi.fn();
vi.mock("../../../../services/vault/fetchVaults", () => ({
  fetchVaultPayoutScriptPubKey: (...args: unknown[]) =>
    mockFetchVaultPayoutScriptPubKey(...args),
}));

// Presign terms-rebuild collaborators (approval wallets only). Mocked as
// modules so the software-wallet path can assert they are never even called.
const mockGetVaultFromChain = vi.fn();
vi.mock("../../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: (...args: unknown[]) => mockGetVaultFromChain(...args),
}));

const mockResolveFundedTxFeeAndUtxos = vi.fn();
vi.mock("../../../../services/vault/resolveFundedTxFee", () => ({
  resolveFundedTxFeeAndUtxos: (...args: unknown[]) =>
    mockResolveFundedTxFeeAndUtxos(...args),
}));

const mockRebuildDepositTerms = vi.fn();
const mockAssertPresignTargetSignable = vi.fn();
vi.mock("../../../../services/vault/rebuildDepositTerms", () => ({
  assertPresignTargetSignable: (...args: unknown[]) =>
    mockAssertPresignTargetSignable(...args),
  rebuildDepositTerms: (...args: unknown[]) => mockRebuildDepositTerms(...args),
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
const mockVerifyBtcWalletLiveness = vi.fn();
vi.mock("../../../../utils/btc", () => ({
  btcAddressToScriptPubKeyHex: (addr: string) =>
    mockBtcAddressToScriptPubKeyHex(addr),
  stripHexPrefix: (hex: string) =>
    hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex,
  verifyBtcWalletLiveness: (...args: unknown[]) =>
    mockVerifyBtcWalletLiveness(...args),
  shouldProbeWalletLiveness: () => true,
  BtcWalletLivenessError: class BtcWalletLivenessError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BtcWalletLivenessError";
    }
  },
}));

// Stub only the message formatter. `classifyError` stays real so the
// user-rejection filter is exercised against genuine EIP-1193 classification
// rather than a stub that could agree with a wrong implementation.
vi.mock("../../../../utils/errors/formatting", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../utils/errors/formatting")
  >()),
  formatPayoutSignatureError: (err: unknown) => ({
    title: "Sign Error",
    message: err instanceof Error ? err.message : String(err),
  }),
}));

const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { error: mockLoggerError },
}));

const ACTIVITY = {
  id: "0xvault" as Hex,
  peginTxHash: "0xpegin" as Hex,
  applicationEntryPoint: "0xapp",
  depositorPayoutBtcAddress: "0xpayoutscript" as Hex,
  providers: [{ id: "0xprovider" as Hex }],
  unsignedPrePeginTx: "0xdeadbeef",
};
const PROVIDER = { btcPubKey: "0xvpkey" };
const BTC_WALLET = { signPsbt: vi.fn() };
const onSuccess = vi.fn();

const ON_CHAIN_VAULT = { marker: "on-chain-vault" };
const REBUILT_TERMS = { marker: "rebuilt-terms" };
const FUNDED_TX_FEE = 1234n;

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
      btcPublicKey: "0x" + "ab".repeat(32),
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
    mockVerifyBtcWalletLiveness.mockResolvedValue(undefined);
    mockFetchVaultPayoutScriptPubKey.mockResolvedValue(null);
    mockGetVaultFromChain.mockResolvedValue(ON_CHAIN_VAULT);
    // `vi.clearAllMocks` does not drain queued `*Once` implementations; reset
    // the mocks that tests arm with one-shot failures before re-installing
    // their defaults so an unconsumed queue cannot leak across tests.
    mockResolveFundedTxFeeAndUtxos.mockReset();
    mockRebuildDepositTerms.mockReset();
    mockAssertPresignTargetSignable.mockReset();
    mockResolveFundedTxFeeAndUtxos.mockResolvedValue({
      expectedUtxos: {},
      fundedTxFee: FUNDED_TX_FEE,
    });
    mockRebuildDepositTerms.mockResolvedValue(REBUILT_TERMS);
    mockAssertPresignTargetSignable.mockResolvedValue(undefined);
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
      await call.btcWallet.signPsbt("0xpsbt");
      expect(BTC_WALLET.signPsbt).toHaveBeenCalledWith("0xpsbt", undefined);
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
            p: {
              phase: "claimers" | "graph";
              completed: number;
              total: number;
            } | null,
          ) => void;
        }) => {
          onProgress({ phase: "claimers", completed: 1, total: 3 });
          onProgress({ phase: "graph", completed: 2, total: 9 });
          onProgress({ phase: "graph", completed: 9, total: 9 });
          // Final null sentinel from SDK should not overwrite progress.
          onProgress(null);
        },
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.progress).toEqual({
        phase: "graph",
        completed: 9,
        total: 9,
      });
    });
  });

  describe("failure telemetry", () => {
    it("captures a signing failure to Sentry with the activation.payouts stage and a scrubbed vaultId", async () => {
      mockSignAndSubmitPayouts.mockRejectedValueOnce(
        new Error("VP rejected the depositor graph"),
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      const [err, ctx] = mockLoggerError.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect(ctx.tags.funnelStage).toBe("activation.payouts");
      expect(ctx.tags.vaultId).toBe("0xvault");
      // Tagged, not in extra: the per-VP alert has to facet presign failures
      // by provider to tell one bad VP from a protocol-wide break.
      expect(ctx.tags.providerId).toBe("0xpr...ider");
      expect(result.current.error?.title).toBe("Sign Error");
    });

    it("does not capture a user-cancelled (AbortError) signing attempt", async () => {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      mockSignAndSubmitPayouts.mockRejectedValueOnce(abort);

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockLoggerError).not.toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it("does not capture a wallet decline, but still surfaces it to the user", async () => {
      // EIP-1193 4001 — what a wallet throws when the depositor hits Reject.
      // Routine drop-off, not a presign failure: it must not reach Sentry and
      // inflate the rate the activation.payouts tag alerts on.
      const declined = Object.assign(new Error("User rejected the request"), {
        code: 4001,
      });
      mockSignAndSubmitPayouts.mockRejectedValueOnce(declined);

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockLoggerError).not.toHaveBeenCalled();
      // Unlike AbortError (modal closed), the user is still here — show them why.
      expect(result.current.error?.title).toBe("Sign Error");
    });
  });

  describe("guards", () => {
    it("errors when depositorPayoutBtcAddress is missing and the indexer has no vault row", async () => {
      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, depositorPayoutBtcAddress: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockFetchVaultPayoutScriptPubKey).toHaveBeenCalledWith(
        ACTIVITY.id,
      );
      expect(result.current.error?.title).toBe("Missing payout address");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("backfills the payout address from the indexer when the activity lacks it", async () => {
      // Regression: a localStorage-merged activity (vault dropped from a
      // truncated indexer list page) carries no payout address. The hook
      // must fetch it by vault id and proceed instead of dead-ending on
      // "Missing payout address" while the indexer has the row.
      mockFetchVaultPayoutScriptPubKey.mockResolvedValueOnce(
        ACTIVITY.depositorPayoutBtcAddress,
      );

      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, depositorPayoutBtcAddress: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error).toBeNull();
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      expect(
        mockSignAndSubmitPayouts.mock.calls[0][0].registeredPayoutScriptPubKey,
      ).toBe(ACTIVITY.depositorPayoutBtcAddress);
    });

    it("rejects a backfilled payout address that does not match the connected wallet", async () => {
      // The backfilled address must flow through the same wallet-match
      // security guard as the activity-supplied one.
      mockFetchVaultPayoutScriptPubKey.mockResolvedValueOnce(
        "0xattackerscript",
      );

      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, depositorPayoutBtcAddress: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Payout address mismatch");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when the activity lacks a payout address and the indexer lookup throws", async () => {
      mockFetchVaultPayoutScriptPubKey.mockRejectedValueOnce(
        new Error("indexer down"),
      );

      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, depositorPayoutBtcAddress: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Missing payout address");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when wallet scriptPubKey doesn't match indexer payout address", async () => {
      mockBtcAddressToScriptPubKeyHex.mockReturnValue("0xdifferent");

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Payout address mismatch");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("accepts byte-equal payout scripts when the indexer hex uses upper or mixed case", async () => {
      mockBtcAddressToScriptPubKeyHex.mockReturnValue("0xabcdef1234");

      const { result } = renderHookWithProps({
        activity: {
          ...ACTIVITY,
          depositorPayoutBtcAddress: "0xABCdef1234" as Hex,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error).toBeNull();
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
    });

    it("rejects signing when the wallet address is unavailable instead of skipping the payout-address check", async () => {
      // Regression: previously the wallet-vs-indexer scriptPubKey comparison
      // was wrapped in `if (connectedBtcAddress)`, so a wallet with a connector
      // but no readable address would silently bypass the security guard.
      mockBtcConnector = {
        connectedWallet: { provider: BTC_WALLET },
      };

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Wallet address unavailable");
      expect(mockBtcAddressToScriptPubKeyHex).not.toHaveBeenCalled();
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when vault provider is not found", async () => {
      mockFindProvider.mockReturnValue(undefined);

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Vault provider not found");
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

      expect(result.current.error?.title).toBe("Wallet not connected");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when no vault provider is assigned to the activity", async () => {
      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, providers: [] } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Vault provider not assigned");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("errors when peginTxHash is missing from the activity", async () => {
      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, peginTxHash: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Missing peg-in transaction");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("surfaces a wallet-address error and clears the lock when btcAddressToScriptPubKeyHex throws", async () => {
      // Regression: setting `inFlightRef` before a synchronous guard that
      // can throw (e.g. wallet on wrong BTC network) would leak the lock
      // on the throw path, deadlocking every subsequent handleSign() call
      // on the same hook instance until remount.
      mockBtcAddressToScriptPubKeyHex.mockImplementationOnce(() => {
        throw new Error("invalid network prefix");
      });

      const { result } = renderHookWithProps();

      // First call: the wallet address parse throws synchronously.
      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.error?.title).toBe("Wallet address error");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();

      // Second call on the SAME hook: must reach the SDK. If the lock
      // leaked, this assertion would fail.
      await act(async () => {
        await result.current.handleSign();
      });
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      expect(result.current.isComplete).toBe(true);
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
            btcPublicKey: "0x" + "ab".repeat(32),
            depositorEthAddress: "0xeth" as Hex,
            onSuccess,
          },
        },
      );

      // First handleSign → missing payout address guard fires.
      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.error?.title).toBe("Missing payout address");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();

      // Re-render the SAME hook with a fixed activity — second handleSign
      // on the same instance must reach the SDK call. If `inFlightRef`
      // wasn't cleared on the guard path, this assertion would fail.
      rerender({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: ACTIVITY as any,
        btcPublicKey: "0x" + "ab".repeat(32),
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
            btcPublicKey: "0x" + "ab".repeat(32),
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

  describe("device-sign cancellation", () => {
    // Ledger-shaped provider: the only BTC provider exposing cancelSigning.
    // No approveDepositTerms on purpose — the cancel seam is orthogonal to
    // the approval rebuild, so these tests stay on the software-wallet path.
    function connectCancellableWallet() {
      const cancelSigning = vi.fn();
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: { signPsbt: vi.fn(), cancelSigning },
        },
      };
      return { cancelSigning };
    }

    // Holds the SDK call open so cancel/settle ordering is test-controlled.
    function armPendingSdkCall() {
      const pending: {
        resolve: () => void;
        reject: (err: unknown) => void;
        signal: AbortSignal | undefined;
      } = { resolve: () => {}, reject: () => {}, signal: undefined };
      mockSignAndSubmitPayouts.mockImplementation(
        ({ signal }: { signal: AbortSignal }) => {
          pending.signal = signal;
          return new Promise<void>((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
          });
        },
      );
      return pending;
    }

    // What the Ledger provider rejects with when a requested cancel settles
    // at the next device exchange boundary (WalletError, typed code).
    function signingCancelledError() {
      return Object.assign(
        new Error(
          "Signing cancelled after 0 of 3 PSBT(s) — the ceremony restarts from the device approval screens on retry.",
        ),
        { code: "CONNECTION_REJECTED" },
      );
    }

    it("reports canCancel false while signing when the provider lacks cancelSigning", async () => {
      // setupHappyPath connects the plain signPsbt-only software wallet.
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.signing).toBe(true));

      expect(result.current.canCancel).toBe(false);

      await act(async () => {
        pending.resolve();
        await signPromise;
      });
    });

    it("reports canCancel true only while a sign is in flight on a provider with cancelSigning", async () => {
      connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      expect(result.current.canCancel).toBe(false);

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));

      await act(async () => {
        pending.resolve();
        await signPromise;
      });
      expect(result.current.canCancel).toBe(false);
    });

    it("cancels the provider that started the sign, not a wallet swapped in mid-prompt", async () => {
      const { cancelSigning } = connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result, rerender } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));

      // Swap the connected wallet while the device prompt is still open.
      const replacementCancelSigning = vi.fn();
      mockBtcConnector!.connectedWallet!.provider = {
        signPsbt: vi.fn(),
        cancelSigning: replacementCancelSigning,
      };
      rerender();

      // The affordance tracks the running ceremony, not the live connector.
      expect(result.current.canCancel).toBe(true);

      act(() => {
        result.current.handleCancel();
      });

      expect(cancelSigning).toHaveBeenCalledTimes(1);
      expect(replacementCancelSigning).not.toHaveBeenCalled();

      await act(async () => {
        pending.reject(signingCancelledError());
        await signPromise;
      });
    });

    // Shared setup for the cancel-request tests below: start a sign on a
    // cancellable wallet, request the cancel, hand back a settle helper.
    async function startSignAndRequestCancel() {
      const { cancelSigning } = connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));

      act(() => {
        result.current.handleCancel();
      });

      const settleAsCancelRejection = async () => {
        await act(async () => {
          pending.reject(signingCancelledError());
          await signPromise;
        });
      };
      return { result, cancelSigning, pending, settleAsCancelRejection };
    }

    it("handleCancel invokes the provider's cancelSigning once", async () => {
      const { cancelSigning, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      expect(cancelSigning).toHaveBeenCalledTimes(1);

      await settleAsCancelRejection();
    });

    it("handleCancel aborts the in-flight signal so VP polling stops now", async () => {
      const { pending, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      expect(pending.signal?.aborted).toBe(true);

      await settleAsCancelRejection();
    });

    it("handleCancel sets cancelRequested", async () => {
      const { result, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      expect(result.current.cancelRequested).toBe(true);

      await settleAsCancelRejection();
    });

    it("keeps the sign pending after handleCancel — a cancel is a request, not a settle", async () => {
      const { result, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      expect(result.current.signing).toBe(true);

      await settleAsCancelRejection();
    });

    it("resets to idle with no error when a requested cancel settles as the provider's signing-cancelled rejection", async () => {
      connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));

      act(() => {
        result.current.handleCancel();
      });
      await act(async () => {
        pending.reject(signingCancelledError());
        await signPromise;
      });

      // A self-requested cancel is not an error — back to the pre-sign state.
      expect(result.current.error).toBeNull();
      expect(result.current.signing).toBe(false);
      expect(result.current.cancelRequested).toBe(false);
      expect(result.current.isComplete).toBe(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it("still surfaces a device rejection as an error when no cancel was requested", async () => {
      connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.signing).toBe(true));

      await act(async () => {
        pending.reject(signingCancelledError());
        await signPromise;
      });

      // The user rejected on the device without asking us to cancel — they
      // are still here, so show them why nothing was signed.
      expect(result.current.error?.title).toBe("Sign Error");
      expect(result.current.signing).toBe(false);
    });

    it("surfaces an unrelated failure after a requested cancel and clears cancelRequested", async () => {
      connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));

      act(() => {
        result.current.handleCancel();
      });
      await act(async () => {
        pending.reject(new Error("VP unreachable"));
        await signPromise;
      });

      expect(result.current.error).toEqual({
        title: "Sign Error",
        message: "VP unreachable",
      });
      expect(result.current.cancelRequested).toBe(false);
      expect(result.current.signing).toBe(false);
    });

    it("clears cancelRequested when the sign settles successfully after a late cancel", async () => {
      connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));

      act(() => {
        result.current.handleCancel();
      });
      await act(async () => {
        pending.resolve();
        await signPromise;
      });

      // The cancel came too late — the sign completed. The request must be
      // consumed so the modal cannot wedge on the disabled cancel button.
      expect(result.current.cancelRequested).toBe(false);
      expect(result.current.isComplete).toBe(true);
    });
  });

  describe("deposit-terms approval capability forwarding through wallet wrappers", () => {
    // A real depositor-approval wallet (e.g. Ledger) implements
    // approveDepositTerms as a class-prototype method, not an own/instance
    // property — `{...wallet}` silently drops it, so the wrapper built here
    // must forward it explicitly instead of relying on spread.
    class PrototypeApprovalBtcWallet {
      // Private so a wrong-`this` forward (e.g. an unbound method reference)
      // throws instead of silently sharing spread-copied state.
      #approvedWith: unknown[] = [];
      get approvedWith(): readonly unknown[] {
        return this.#approvedWith;
      }
      signPsbt(): Promise<string> {
        return Promise.resolve("signed");
      }
      deriveContextHash(): Promise<string> {
        return Promise.resolve("cc".repeat(32));
      }
      approveDepositTerms(terms: unknown): Promise<void> {
        this.#approvedWith.push(terms);
        return Promise.resolve();
      }
      getChangeAddress(): Promise<string> {
        return Promise.resolve("tb1pledgerchange");
      }
    }

    it("forwards a prototype-method approveDepositTerms through the payout wallet wrapper", async () => {
      const { supportsDepositApproval } = await import(
        "@babylonlabs-io/ts-sdk/tbv/core"
      );

      const underlyingWallet = new PrototypeApprovalBtcWallet();
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: underlyingWallet,
        },
      };

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      const call = mockSignAndSubmitPayouts.mock.calls[0][0];
      expect(supportsDepositApproval(call.btcWallet)).toBe(true);

      // Presence isn't enough: the forwarded method must delegate to the
      // underlying wallet with the same terms object.
      const terms = { marker: "payout-wrapper-terms" };
      await call.btcWallet.approveDepositTerms(terms);
      expect(underlyingWallet.approvedWith).toEqual([terms]);
    });
  });

  describe("presign deposit-terms rebuild (approval wallets)", () => {
    // Minimal approval-capable wallet: supportsDepositApproval only probes
    // for an approveDepositTerms function.
    function connectApprovalWallet() {
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: { signPsbt: vi.fn(), approveDepositTerms: vi.fn() },
        },
      };
    }

    it("refuses to sign when an approval wallet has no funded Pre-PegIn hex to rebuild terms from", async () => {
      connectApprovalWallet();

      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, unsignedPrePeginTx: undefined } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Missing Pre-Pegin transaction");
      expect(mockGetVaultFromChain).not.toHaveBeenCalled();
      expect(mockResolveFundedTxFeeAndUtxos).not.toHaveBeenCalled();
      expect(mockRebuildDepositTerms).not.toHaveBeenCalled();
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("refuses a software wallet without the funded Pre-PegIn hex too — the cold VP auth path needs it", async () => {
      // setupHappyPath connects the plain signPsbt-only wallet; the cross-
      // device resume's cold auth path hashes the hex and parses its funding
      // outpoints unconditionally, so the guard is not approval-only.
      const { result } = renderHookWithProps({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activity: { ...ACTIVITY, unsignedPrePeginTx: "" } as any,
      });

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.title).toBe("Missing Pre-Pegin transaction");
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
    });

    it("runs the target status/ack-window preflight BEFORE the mempool fee read, so a stalled deposit's refusal wins over a prevout read failure", async () => {
      connectApprovalWallet();
      const refusal = new VaultLifecycleStateError("ack window elapsed", {
        reason: "ack-window-elapsed",
        stage: "presign",
        role: "target",
        status: OnChainBtcVaultStatus.PENDING,
        vaultId: ACTIVITY.id,
      });
      mockAssertPresignTargetSignable.mockRejectedValueOnce(refusal);

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockAssertPresignTargetSignable).toHaveBeenCalledWith(
        ACTIVITY.id,
        ON_CHAIN_VAULT,
      );
      expect(mockResolveFundedTxFeeAndUtxos).not.toHaveBeenCalled();
      expect(mockRebuildDepositTerms).not.toHaveBeenCalled();
      expect(result.current.error?.message).toBe("ack window elapsed");
    });

    it("marks a presign lifecycle refusal terminal and keeps it out of the funnel-failure telemetry", async () => {
      connectApprovalWallet();
      mockAssertPresignTargetSignable.mockRejectedValueOnce(
        new VaultLifecycleStateError("signing is over", {
          reason: "invalid-status",
          stage: "presign",
          role: "target",
          status: OnChainBtcVaultStatus.VERIFIED,
          vaultId: ACTIVITY.id,
        }),
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.error?.message).toBe("signing is over");
      expect(result.current.errorTerminal).toBe(true);
      // Routine outcome for a stalled deposit, auto-fired on modal mount —
      // it must not inflate the activation.payouts alert.
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it("keeps a rebuild integrity failure retryable and captured", async () => {
      connectApprovalWallet();
      mockRebuildDepositTerms.mockRejectedValueOnce(
        new Error("sibling batch disagrees"),
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.errorTerminal).toBe(false);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });

    it("clears the terminal flag when a later attempt fails on a recoverable guard", async () => {
      connectApprovalWallet();
      mockAssertPresignTargetSignable.mockRejectedValueOnce(
        new VaultLifecycleStateError("signing is over", {
          reason: "invalid-status",
          stage: "presign",
          role: "target",
          status: OnChainBtcVaultStatus.VERIFIED,
          vaultId: ACTIVITY.id,
        }),
      );

      const { result, rerender } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.errorTerminal).toBe(true);

      // Wallet disconnects before the retry — a guard error, recoverable.
      // Re-render so the handler closes over the new connector state.
      mockBtcConnector = { connectedWallet: undefined };
      rerender();
      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.error?.title).toBe("Wallet address unavailable");
      expect(result.current.errorTerminal).toBe(false);
    });

    it("resets the terminal flag when a later handleSign starts", async () => {
      connectApprovalWallet();
      mockAssertPresignTargetSignable.mockRejectedValueOnce(
        new VaultLifecycleStateError("signing is over", {
          reason: "invalid-status",
          stage: "presign",
          role: "target",
          status: OnChainBtcVaultStatus.VERIFIED,
          vaultId: ACTIVITY.id,
        }),
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.errorTerminal).toBe(true);

      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.errorTerminal).toBe(false);
      expect(result.current.isComplete).toBe(true);
    });

    it("rebuilds presign terms chain-fresh and threads them into signAndSubmitPayouts", async () => {
      connectApprovalWallet();

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockGetVaultFromChain).toHaveBeenCalledWith(ACTIVITY.id);
      expect(mockAssertPresignTargetSignable).toHaveBeenCalledWith(
        ACTIVITY.id,
        ON_CHAIN_VAULT,
      );
      expect(mockResolveFundedTxFeeAndUtxos).toHaveBeenCalledWith(
        ACTIVITY.unsignedPrePeginTx,
      );
      expect(mockRebuildDepositTerms).toHaveBeenCalledWith({
        vaultId: ACTIVITY.id,
        target: ON_CHAIN_VAULT,
        fundedPrePeginTxHex: ACTIVITY.unsignedPrePeginTx,
        connectedDepositorAddress: "0xeth",
        depositorBtcPubkey: "0x" + "ab".repeat(32),
        fundedTxFee: FUNDED_TX_FEE,
        lifecycle: "presign",
      });
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      expect(mockSignAndSubmitPayouts.mock.calls[0][0].depositTerms).toBe(
        REBUILT_TERMS,
      );
      expect(result.current.isComplete).toBe(true);
    });

    it("adds no rebuild calls and no depositTerms key for software wallets", async () => {
      // setupHappyPath (beforeEach) connects the plain signPsbt-only wallet.
      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(mockGetVaultFromChain).not.toHaveBeenCalled();
      expect(mockAssertPresignTargetSignable).not.toHaveBeenCalled();
      expect(mockResolveFundedTxFeeAndUtxos).not.toHaveBeenCalled();
      expect(mockRebuildDepositTerms).not.toHaveBeenCalled();

      // Pre-change param shape, key-identical: no depositTerms key at all
      // (not even an explicit undefined).
      const call = mockSignAndSubmitPayouts.mock.calls[0][0];
      expect("depositTerms" in call).toBe(false);
      expect(Object.keys(call).sort()).toEqual(
        [
          "btcWallet",
          "depositorBtcPubkey",
          "depositorEthAddress",
          "onProgress",
          "peginTxHash",
          "providerBtcPubKey",
          "registeredPayoutScriptPubKey",
          "signal",
          "unsignedPrePeginTxHex",
          "vaultId",
        ].sort(),
      );
      expect(call.vaultId).toBe(ACTIVITY.id);
      expect(call.peginTxHash).toBe(ACTIVITY.peginTxHash);
      expect(call.depositorBtcPubkey).toBe("0x" + "ab".repeat(32));
      expect(call.providerBtcPubKey).toBe(PROVIDER.btcPubKey);
      expect(call.registeredPayoutScriptPubKey).toBe(
        ACTIVITY.depositorPayoutBtcAddress,
      );
      expect(call.depositorEthAddress).toBe("0xeth");
      expect(call.unsignedPrePeginTxHex).toBe(ACTIVITY.unsignedPrePeginTx);
      expect(result.current.isComplete).toBe(true);
    });

    it("surfaces a rebuild failure through the modal's mapped error state", async () => {
      connectApprovalWallet();
      mockRebuildDepositTerms.mockRejectedValueOnce(
        new Error("resume refused"),
      );

      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      // Mapped by formatPayoutSignatureError (stubbed above), not a guard title.
      expect(result.current.error).toEqual({
        title: "Sign Error",
        message: "resume refused",
      });
      expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
      expect(result.current.signing).toBe(false);
      expect(result.current.isComplete).toBe(false);
    });
  });
});
