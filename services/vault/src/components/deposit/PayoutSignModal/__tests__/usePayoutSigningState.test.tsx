import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { LocalStorageStatus } from "../../../../models/peginStateMachine";
import { VaultLifecycleStateError } from "../../../../utils/errors/vaultLifecycleStateError";
import { usePayoutSigningState } from "../usePayoutSigningState";

// Check the hook's SDK inputs, cancellation, and error handling.
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

// Software wallets must skip the deposit terms rebuild.
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

let mockSessionConfirmed = true;
let mockBtcConnector: {
  connectedWallet?: {
    account?: { address: string };
    provider?: unknown;
  };
} | null = null;
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: () => ({
    connected: Boolean(mockBtcConnector?.connectedWallet),
  }),
  useWalletConnect: () => ({ connected: mockSessionConfirmed, open: vi.fn() }),
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

// Keep real error classification while controlling the displayed message.
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
    mockSessionConfirmed = true;
    setupHappyPath();
    mockSignAndSubmitPayouts.mockResolvedValue(undefined);
    mockVerifyBtcWalletLiveness.mockResolvedValue(undefined);
    mockFetchVaultPayoutScriptPubKey.mockResolvedValue(null);
    mockGetVaultFromChain.mockResolvedValue(ON_CHAIN_VAULT);
    // Reset queued one-shot failures before each test.
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
      expect(result.current.signing).toBe(false);
      expect(result.current.isComplete).toBe(false);
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
      let resolveSdk: () => void;
      mockSignAndSubmitPayouts.mockImplementation(
        () => new Promise<void>((resolve) => (resolveSdk = resolve)),
      );

      const { result } = renderHookWithProps();

      const calls = await act(async () => {
        const first = result.current.handleSign();
        const second = result.current.handleSign();
        return [first, second];
      });

      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();

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
  });

  describe("unmount cleanup", () => {
    it("does not abort the in-flight signal under React StrictMode's simulated unmount", async () => {
      // The StrictMode remount must keep the current attempt.
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

      // Allow the deferred cancellation to run if the guard is broken.
      await new Promise((r) => setTimeout(r, 10));
      expect(observedSignal?.aborted).toBe(false);

      // Let the SDK resolve so the hook's try/finally cleans up.
      await act(async () => {
        resolveSdk!();
      });
    });
  });

  describe("device-sign cancellation", () => {
    // Hold the Ledger device call open until the test settles the SDK call.
    function connectCancellableWallet() {
      const cancelSigning = vi.fn();
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: {
            signPsbt: vi.fn(() => new Promise<string>(() => {})),
            cancelSigning,
          },
        },
      };
      return { cancelSigning };
    }

    // Start a wallet call and let the test control when the SDK settles.
    function armPendingSdkCall() {
      const pending: {
        resolve: () => void;
        reject: (err: unknown) => void;
        signal: AbortSignal | undefined;
      } = { resolve: () => {}, reject: () => {}, signal: undefined };
      mockSignAndSubmitPayouts.mockImplementation(
        ({
          btcWallet,
          signal,
        }: {
          btcWallet: { signPsbt: (hex: string) => Promise<string> };
          signal: AbortSignal;
        }) => {
          pending.signal = signal;
          return new Promise<void>((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
            // Settled only via `pending` — swallow the held-open device sign.
            void btcWallet.signPsbt("payout-psbt").catch(() => {});
          });
        },
      );
      return pending;
    }

    it("cancels the original device and signal when the hook unmounts", async () => {
      const { cancelSigning } = connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result, unmount } = renderHookWithProps();
      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.canCancel).toBe(true));
      unmount();
      await waitFor(() => expect(cancelSigning).toHaveBeenCalledOnce());
      expect(pending.signal?.aborted).toBe(true);
      await act(async () => {
        pending.resolve();
        await signPromise;
      });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockSetOptimisticStatus).not.toHaveBeenCalled();
    });

    // What the Ledger provider rejects with when a requested cancel settles
    // at the next device exchange boundary (WalletError, typed code).
    function signingCanceledError() {
      return Object.assign(
        new Error(
          "Signing canceled after 0 of 3 PSBT(s) — the ceremony restarts from the device approval screens on retry.",
        ),
        { code: "CONNECTION_REJECTED" },
      );
    }

    it("stops a software attempt on disconnect and waits for an explicit retry", async () => {
      mockSignAndSubmitPayouts.mockImplementation(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new Error("Polling aborted")),
            );
          }),
      );
      const { result, rerender } = renderHookWithProps();
      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() =>
        expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce(),
      );
      expect(result.current.canCancel).toBe(false);
      mockBtcConnector = null;
      rerender();
      await act(async () => {
        await signPromise;
      });
      expect(mockSignAndSubmitPayouts.mock.calls[0][0].signal.aborted).toBe(
        true,
      );
      expect(result.current.signing).toBe(false);
      expect(result.current.isComplete).toBe(false);
      expect(result.current.error).toEqual(
        COPY.deposit.payoutSigningGuards.walletNotConnected,
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockSetOptimisticStatus).not.toHaveBeenCalled();
      setupHappyPath();
      rerender();
      expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce();
      mockSignAndSubmitPayouts.mockResolvedValueOnce(undefined);
      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.isComplete).toBe(true);
    });

    it.each([
      { walletKeyReady: false },
      { btcPublicKey: PROVIDER.btcPubKey },
      { depositorEthAddress: ACTIVITY.id },
    ])(
      "stops a software attempt after an identity change: %j",
      async (change) => {
        const pending = armPendingSdkCall();
        const props = {};
        const { result, rerender } = renderHookWithProps(props);
        let signPromise!: Promise<void>;
        act(() => {
          signPromise = result.current.handleSign();
        });
        await waitFor(() =>
          expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce(),
        );
        Object.assign(props, change);
        rerender();
        expect(pending.signal?.aborted).toBe(true);
        await act(async () => {
          pending.resolve();
          await signPromise;
        });
        expect(result.current.isComplete).toBe(false);
        expect(onSuccess).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        step: "backfill",
        check: mockFetchVaultPayoutScriptPubKey,
        payout: undefined,
        livenessCalls: 0,
      },
      {
        step: "liveness",
        check: mockVerifyBtcWalletLiveness,
        payout: ACTIVITY.depositorPayoutBtcAddress,
        livenessCalls: 1,
      },
    ])(
      "stops when the wallet disconnects during $step",
      async ({ check, payout, livenessCalls }) => {
        let finishCheck!: (value?: string) => void;
        check.mockReturnValueOnce(
          new Promise<string | undefined>((resolve) => {
            finishCheck = resolve;
          }),
        );
        const { result, rerender } = renderHookWithProps({
          activity: {
            ...ACTIVITY,
            depositorPayoutBtcAddress: payout,
          } as Parameters<typeof usePayoutSigningState>[0]["activity"],
        });
        let signPromise!: Promise<void>;
        act(() => {
          signPromise = result.current.handleSign();
        });
        await waitFor(() => expect(check).toHaveBeenCalledOnce());
        mockBtcConnector = null;
        rerender();
        await act(async () => {
          finishCheck(ACTIVITY.depositorPayoutBtcAddress);
          await signPromise;
        });
        expect(mockSignAndSubmitPayouts).not.toHaveBeenCalled();
        expect(mockVerifyBtcWalletLiveness).toHaveBeenCalledTimes(
          livenessCalls,
        );
        expect(result.current.signing).toBe(false);
        expect(result.current.error).toEqual(
          COPY.deposit.payoutSigningGuards.walletNotConnected,
        );
        expect(onSuccess).not.toHaveBeenCalled();
      },
    );

    it("stops the next wallet call after a signature arrives after disconnect", async () => {
      let finishSign!: (value: string) => void;
      BTC_WALLET.signPsbt.mockReturnValueOnce(
        new Promise<string>((resolve) => {
          finishSign = resolve;
        }),
      );
      mockSignAndSubmitPayouts.mockImplementation(async ({ btcWallet }) => {
        await btcWallet.signPsbt("payout-psbt");
        await btcWallet.signPsbt("payout-psbt");
      });
      const { result, rerender } = renderHookWithProps();
      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(BTC_WALLET.signPsbt).toHaveBeenCalledOnce());
      mockBtcConnector = null;
      rerender();
      await act(async () => {
        finishSign("signed");
        await signPromise;
      });
      expect(BTC_WALLET.signPsbt).toHaveBeenCalledOnce();
      expect(result.current.isComplete).toBe(false);
      expect(result.current.error).toEqual(
        COPY.deposit.payoutSigningGuards.walletNotConnected,
      );
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

      expect(result.current.canCancel).toBe(true);
      expect(result.current.cancelRequested).toBe(true);
      expect(pending.signal?.aborted).toBe(true);
      expect(cancelSigning).toHaveBeenCalledTimes(1);
      expect(replacementCancelSigning).not.toHaveBeenCalled();

      await act(async () => {
        pending.reject(signingCanceledError());
        await signPromise;
      });
    });

    // Request cancellation while the device call is pending.
    async function startSignAndRequestCancel() {
      const { cancelSigning } = connectCancellableWallet();
      const pending = armPendingSdkCall();
      const { result } = renderHookWithProps();

      expect(result.current.canCancel).toBe(false);
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
          pending.reject(signingCanceledError());
          await signPromise;
        });
      };
      return {
        result,
        cancelSigning,
        pending,
        signPromise,
        settleAsCancelRejection,
      };
    }

    it("cancels the original provider and signal while the device call stays pending", async () => {
      const { result, cancelSigning, pending, settleAsCancelRejection } =
        await startSignAndRequestCancel();

      act(() => result.current.handleCancel());
      expect(cancelSigning).toHaveBeenCalledOnce();
      expect(pending.signal?.aborted).toBe(true);
      expect(result.current.cancelRequested).toBe(true);
      expect(result.current.signing).toBe(true);

      await settleAsCancelRejection();
    });

    it("resets to idle after the provider confirms cancellation", async () => {
      const { result, settleAsCancelRejection } =
        await startSignAndRequestCancel();
      await settleAsCancelRejection();

      expect(result.current.error).toBeNull();
      expect(result.current.canCancel).toBe(false);
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
        pending.reject(signingCanceledError());
        await signPromise;
      });

      // The user rejected on the device without asking us to cancel — they
      // are still here, so show them why nothing was signed.
      expect(result.current.error?.title).toBe("Sign Error");
      expect(result.current.signing).toBe(false);
    });

    it.each(["Polling aborted", "Request aborted"])(
      "clears a cancelled attempt after %s",
      async (message) => {
        const { result, pending, signPromise } =
          await startSignAndRequestCancel();
        await act(async () => {
          pending.reject(new Error(message));
          await signPromise;
        });

        expect(result.current.error).toBeNull();
        expect(mockLoggerError).not.toHaveBeenCalled();
        expect(result.current.cancelRequested).toBe(false);
        expect(result.current.signing).toBe(false);
      },
    );

    it("ignores a late signing result after cancellation", async () => {
      const { result, pending, signPromise } =
        await startSignAndRequestCancel();
      await act(async () => {
        pending.resolve();
        await signPromise;
      });

      expect(result.current.cancelRequested).toBe(false);
      expect(result.current.isComplete).toBe(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockSetOptimisticStatus).not.toHaveBeenCalled();
    });

    it("keeps canCancel false during a hung VP-auth (deriveContextHash) phase", async () => {
      // deriveContextHash is a real device screen, but the provider's
      // cancelSigning cannot abort it — showing the affordance there
      // would be a dead button.
      const cancelSigning = vi.fn();
      let settleAuth: (root: string) => void = () => {};
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: {
            signPsbt: vi.fn(),
            deriveContextHash: vi.fn(
              () =>
                new Promise<string>((resolve) => {
                  settleAuth = resolve;
                }),
            ),
            cancelSigning,
          },
        },
      };
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
        }: {
          btcWallet: {
            deriveContextHash: (app: string, ctx: string) => Promise<string>;
          };
        }) => {
          await btcWallet.deriveContextHash("app", "aa");
        },
      );
      const { result } = renderHookWithProps();

      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() => expect(result.current.signing).toBe(true));

      expect(result.current.canCancel).toBe(false);

      await act(async () => {
        settleAuth("cc".repeat(32));
        await signPromise;
      });
    });

    it("reports canCancel true during a hung signPsbts device window", async () => {
      const cancelSigning = vi.fn();
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: {
            signPsbt: vi.fn(),
            signPsbts: vi.fn(() => new Promise<string[]>(() => {})),
            cancelSigning,
          },
        },
      };
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
        }: {
          btcWallet: { signPsbts: (hexes: string[]) => Promise<string[]> };
        }) => {
          await btcWallet.signPsbts(["p0", "p1"]);
        },
      );
      const { result } = renderHookWithProps();

      act(() => {
        void result.current.handleSign();
      });

      await waitFor(() => expect(result.current.canCancel).toBe(true));
    });
  });

  describe("deposit-terms approval capability forwarding through wallet wrappers", () => {
    // The wallet wrapper must preserve prototype methods.
    class PrototypeApprovalBtcWallet {
      // An unbound method must fail when it accesses this private field.
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

      // Forward the same terms object to the original wallet.
      const terms = { marker: "payout-wrapper-terms" };
      await call.btcWallet.approveDepositTerms(terms);
      expect(underlyingWallet.approvedWith).toEqual([terms]);
    });
    it("blocks deposit approval after the signing session ends", async () => {
      const wallet = new PrototypeApprovalBtcWallet();
      mockBtcConnector!.connectedWallet!.provider = wallet;
      let approve!: () => Promise<void>;
      let finish!: () => void;
      mockSignAndSubmitPayouts.mockImplementation(
        ({ btcWallet, depositTerms }) => {
          approve = () => btcWallet.approveDepositTerms(depositTerms);
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      );
      const { result, rerender } = renderHookWithProps();
      let signPromise!: Promise<void>;
      act(() => {
        signPromise = result.current.handleSign();
      });
      await waitFor(() =>
        expect(mockSignAndSubmitPayouts).toHaveBeenCalledOnce(),
      );
      mockSessionConfirmed = false;
      rerender();
      await expect(approve()).rejects.toMatchObject({ name: "AbortError" });
      expect(wallet.approvedWith).toEqual([]);
      await act(async () => {
        finish();
        await signPromise;
      });
      expect(result.current.isComplete).toBe(false);
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

      mockBtcConnector = { connectedWallet: undefined };
      rerender();
      await act(async () => {
        await result.current.handleSign();
      });
      expect(result.current.error?.title).toBe("Wallet not connected");
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
        // The modal's abort signal, so closing it ends the rebuild's
        // registration-log retry backoff.
        signal: expect.any(AbortSignal),
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

  describe("per-ceremony signing progress", () => {
    // Ledger-shaped provider: signPsbts is held open and the test emits
    // ticks through the captured subscribeSigningProgress listener.
    function connectProgressWallet() {
      let listener: ((p: { completed: number; total: number }) => void) | null =
        null;
      const unsubscribe = vi.fn();
      const settle: {
        resolve: (v: string[]) => void;
        reject: (e: unknown) => void;
      } = {
        resolve: () => {},
        reject: () => {},
      };
      const signPsbts = vi.fn(
        () =>
          new Promise<string[]>((resolve, reject) => {
            settle.resolve = resolve;
            settle.reject = reject;
          }),
      );
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: {
            signPsbt: vi.fn(),
            signPsbts,
            subscribeSigningProgress: vi.fn(
              (cb: (p: { completed: number; total: number }) => void) => {
                listener = cb;
                return unsubscribe;
              },
            ),
          },
        },
      };
      const tick = (completed: number, total: number) =>
        listener?.({ completed, total });
      return { settle, tick, unsubscribe, signPsbts };
    }

    // The SDK's Phase-3 shape: announce the round, then hand the batch over.
    function armClaimerBatch(total: number) {
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
          onProgress,
        }: {
          btcWallet: { signPsbts: (hexes: string[]) => Promise<string[]> };
          onProgress: (
            p: { phase: string; completed: number; total: number } | null,
          ) => void;
        }) => {
          onProgress({ phase: "claimers", completed: 0, total });
          await btcWallet.signPsbts(
            Array.from({ length: total }, (_, i) => `payout-${i}`),
          );
          onProgress({ phase: "claimers", completed: total, total });
          onProgress(null);
        },
      );
    }

    it('renders claimer ticks from the provider as phase "claimers" while the SDK batch is in flight', async () => {
      const { settle, tick } = connectProgressWallet();
      armClaimerBatch(5);
      const { result } = renderHookWithProps();
      let done: Promise<void> = Promise.resolve();
      await act(async () => {
        done = result.current.handleSign();
      });

      await act(async () => {
        tick(2, 5);
      });

      expect(result.current.progress).toEqual({
        phase: "claimers",
        completed: 2,
        total: 5,
      });
      await act(async () => {
        settle.resolve(["a", "b", "c", "d", "e"]);
        await done;
      });
    });

    it('renders depositor-graph ticks as phase "graph" once the claimers round has completed', async () => {
      const { settle, tick } = connectProgressWallet();
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
          onProgress,
        }: {
          btcWallet: { signPsbts: (hexes: string[]) => Promise<string[]> };
          onProgress: (
            p: { phase: string; completed: number; total: number } | null,
          ) => void;
        }) => {
          // Claimers round already reported complete by the SDK → the ref flipped.
          onProgress({ phase: "claimers", completed: 3, total: 3 });
          await btcWallet.signPsbts(["payout", "nopayout-1", "nopayout-2"]);
          onProgress(null);
        },
      );
      const { result } = renderHookWithProps();
      let done: Promise<void> = Promise.resolve();
      await act(async () => {
        done = result.current.handleSign();
      });
      expect(result.current.progress).toEqual({
        phase: "graph",
        completed: 0,
        total: 3,
      });

      await act(async () => {
        tick(1, 3);
      });

      expect(result.current.progress).toEqual({
        phase: "graph",
        completed: 1,
        total: 3,
      });
      await act(async () => {
        settle.resolve(["a", "b", "c"]);
        await done;
      });
      expect(result.current.progress).toEqual({
        phase: "graph",
        completed: 3,
        total: 3,
      });
    });

    it("unsubscribes from signing progress after the batch resolves", async () => {
      const { settle, unsubscribe } = connectProgressWallet();
      armClaimerBatch(2);
      const { result } = renderHookWithProps();
      let done: Promise<void> = Promise.resolve();
      // Separate act blocks: signPsbts (and its settle.resolve reassignment)
      // only exists once handleSign's own internal awaits have run.
      await act(async () => {
        done = result.current.handleSign();
      });
      await act(async () => {
        settle.resolve(["a", "b"]);
        await done;
      });

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes from signing progress when the batch rejects", async () => {
      const { settle, unsubscribe } = connectProgressWallet();
      armClaimerBatch(2);
      const { result } = renderHookWithProps();
      let done: Promise<void> = Promise.resolve();
      await act(async () => {
        done = result.current.handleSign();
      });
      await act(async () => {
        settle.reject(new Error("device gone"));
        await done;
      });

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("a failed depositor-graph batch keeps the last tick instead of reporting the batch complete", async () => {
      const { settle, tick } = connectProgressWallet();
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
          onProgress,
        }: {
          btcWallet: { signPsbts: (hexes: string[]) => Promise<string[]> };
          onProgress: (
            p: { phase: string; completed: number; total: number } | null,
          ) => void;
        }) => {
          onProgress({ phase: "claimers", completed: 3, total: 3 });
          await btcWallet.signPsbts(["payout", "nopayout-1", "nopayout-2"]);
        },
      );
      const { result } = renderHookWithProps();
      let done: Promise<void> = Promise.resolve();
      await act(async () => {
        done = result.current.handleSign();
      });
      await act(async () => {
        tick(1, 3);
        settle.reject(new Error("device gone"));
        await done;
      });

      // Read the state the wrapper left behind, not the modal's error view.
      expect(result.current.progress).toEqual({
        phase: "graph",
        completed: 1,
        total: 3,
      });
    });

    it("a failed lone depositor-graph signPsbt keeps 0/1 instead of reporting it complete", async () => {
      // setupHappyPath's signPsbt-only wallet: an empty challenger set makes
      // the graph a single PSBT, which the SDK routes to signPsbt.
      BTC_WALLET.signPsbt.mockRejectedValueOnce(new Error("device gone"));
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
          onProgress,
        }: {
          btcWallet: { signPsbt: (hex: string) => Promise<string> };
          onProgress: (
            p: { phase: string; completed: number; total: number } | null,
          ) => void;
        }) => {
          onProgress({ phase: "claimers", completed: 3, total: 3 });
          await btcWallet.signPsbt("payout");
        },
      );
      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      expect(result.current.progress).toEqual({
        phase: "graph",
        completed: 0,
        total: 1,
      });
    });

    it("progress ticks do not flip the claimers-done ref before the SDK reports the round complete", async () => {
      // Real Phase 3 is one signPsbts call (signPayoutTransactions → signPayoutTransactionsBatch),
      // where a ref flipped inside the tick listener is invisible; the second entry is a synthetic probe.
      const { settle, tick, signPsbts } = connectProgressWallet();
      mockSignAndSubmitPayouts.mockImplementation(
        async ({
          btcWallet,
          onProgress,
        }: {
          btcWallet: { signPsbts: (hexes: string[]) => Promise<string[]> };
          onProgress: (
            p: { phase: string; completed: number; total: number } | null,
          ) => void;
        }) => {
          onProgress({ phase: "claimers", completed: 0, total: 2 });
          await btcWallet.signPsbts(["payout-0", "payout-1"]);
          // Synthetic second entry the SDK never makes, still before its own (N,N).
          await btcWallet.signPsbts(["payout-2", "payout-3"]);
          onProgress({ phase: "claimers", completed: 2, total: 2 });
          onProgress(null);
        },
      );
      const { result } = renderHookWithProps();
      let done: Promise<void> = Promise.resolve();
      await act(async () => {
        done = result.current.handleSign();
      });

      await act(async () => {
        tick(2, 2);
      });

      expect(result.current.progress).toEqual({
        phase: "claimers",
        completed: 2,
        total: 2,
      });

      await act(async () => {
        settle.resolve(["a", "b"]);
      });
      await waitFor(() => expect(signPsbts).toHaveBeenCalledTimes(2));

      // The second entry must still snapshot "claimers"; the count is the stale
      // last tick and not under test.
      expect(result.current.progress.phase).toBe("claimers");

      await act(async () => {
        settle.resolve(["c", "d"]);
        await done;
      });
    });

    it("a wallet without the affordance keeps the SDK-driven 0-to-N jump", async () => {
      const signPsbts = vi.fn().mockResolvedValue(["a", "b"]);
      mockBtcConnector = {
        connectedWallet: {
          account: { address: "tb1test" },
          provider: { signPsbt: vi.fn(), signPsbts },
        },
      };
      armClaimerBatch(2);
      const { result } = renderHookWithProps();

      await act(async () => {
        await result.current.handleSign();
      });

      // Extension-wallet path unchanged: the SDK's own (N,N) lands the counter.
      expect(signPsbts).toHaveBeenCalledTimes(1);
      expect(result.current.isComplete).toBe(true);
      expect(result.current.progress).toEqual({
        phase: "claimers",
        completed: 2,
        total: 2,
      });
    });
  });
});
