/** Manage payout signing state and guards around the SDK flow. */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  forwardDepositApproval,
  isDepositTermsRejectedError,
  stripHexPrefix,
  supportsDepositApproval,
  type DepositTerms,
  type DepositTermsApprover,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import { COPY } from "@/copy";
import { useBtcAction } from "@/hooks/useBtcAction";
import {
  captureFunnelFailure,
  shortId,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import { usePeginPolling } from "../../../context/deposit/PeginPollingContext";
import { signAndSubmitPayouts } from "../../../hooks/deposit/depositFlowSteps/payoutSigning";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import { LocalStorageStatus } from "../../../models/peginStateMachine";
import { fetchVaultPayoutScriptPubKey } from "../../../services/vault/fetchVaults";
import {
  assertPresignTargetSignable,
  rebuildDepositTerms,
} from "../../../services/vault/rebuildDepositTerms";
import { resolveFundedTxFeeAndUtxos } from "../../../services/vault/resolveFundedTxFee";
import type { VaultActivity } from "../../../types/activity";
import {
  btcAddressToScriptPubKeyHex,
  BtcWalletLivenessError,
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "../../../utils/btc";
import { supportsCancelSigning } from "../../../utils/cancelSigning";
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";
import { isVaultLifecycleStateError } from "../../../utils/errors/vaultLifecycleStateError";
import { observeSigningProgress } from "../../../utils/signingProgress";

export interface SigningError {
  title: string;
  message: string;
  /** Raw error for the "copy details" action; only the generic fallback sets it. */
  diagnostics?: string;
}

export interface UsePayoutSigningStateProps {
  activity: VaultActivity;
  btcPublicKey: string;
  walletKeyReady?: boolean;
  depositorEthAddress: Hex;
  onSuccess: () => void;
}

export interface UsePayoutSigningStateResult {
  /** Whether signing is in progress */
  signing: boolean;
  /** Signing progress details */
  progress: PayoutSigningProgress;
  /** Error state if signing failed */
  error: SigningError | null;
  /** Hide retry for a lifecycle refusal or rejected deposit terms. */
  errorTerminal: boolean;
  /** Whether signing completed successfully */
  isComplete: boolean;
  /** Handler to initiate signing */
  handleSign: () => Promise<void>;
  /** True while the original provider can cancel a PSBT signing call. */
  canCancel: boolean;
  /** True from {@link handleCancel} until the in-flight sign settles. */
  cancelRequested: boolean;
  /** Stop polling and request device cancellation. Wait for the call to settle. */
  handleCancel: () => void;
}

function normalizeScriptPubKeyHex(scriptPubKey: string): string {
  return stripHexPrefix(scriptPubKey).toLowerCase();
}

export function usePayoutSigningState({
  activity,
  btcPublicKey,
  walletKeyReady = true,
  depositorEthAddress,
  onSuccess,
}: UsePayoutSigningStateProps): UsePayoutSigningStateResult {
  const [signing, setSigning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState<PayoutSigningProgress>({
    phase: "auth",
    completed: 0,
    total: 0,
  });
  const [error, setError] = useState<SigningError | null>(null);
  const [errorTerminal, setErrorTerminal] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  // Device cancellation applies only to signPsbt and signPsbts.
  const [deviceWindowActive, setDeviceWindowActive] = useState(false);
  // Async settle paths need the current cancellation request.
  const cancelRequestedRef = useRef(false);

  const { findProvider } = useVaultProviders(activity.applicationEntryPoint);
  const { connected, requireBtcWallet } = useBtcAction();
  const btcConnector = useChainConnector("BTC");
  const { setOptimisticStatus } = usePeginPolling();

  // Delay unmount cancellation so the StrictMode remount can keep its attempt.
  const abortRef = useRef<AbortController | null>(null);
  const pendingAbortRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingAbortRef.current !== null) {
      clearTimeout(pendingAbortRef.current);
      pendingAbortRef.current = null;
    }
    return () => {
      pendingAbortRef.current = setTimeout(() => {
        abortRef.current?.abort();
        pendingAbortRef.current = null;
      }, 0);
    };
  }, []);

  // Block a second call before React commits the signing state.
  const inFlightRef = useRef(false);

  // Cancel the original provider if the connected wallet changes.
  const signingProviderRef = useRef<unknown>(null);

  const walletSession = JSON.stringify([
    connected,
    walletKeyReady,
    btcPublicKey,
    depositorEthAddress,
    btcConnector?.connectedWallet?.id,
    btcConnector?.connectedWallet?.account?.address,
  ]);
  const signingSessionRef = useRef<string | null>(null);
  const claimersDoneRef = useRef(false);

  const handleSign = useCallback(async () => {
    if (inFlightRef.current || signing) return;
    // A new attempt must allow a retry after a recoverable guard error.
    setErrorTerminal(false);
    if (!requireBtcWallet() || !walletKeyReady || !btcPublicKey) {
      setError(COPY.deposit.payoutSigningGuards.walletNotConnected);
      return;
    }
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    signingProviderRef.current = btcConnector?.connectedWallet?.provider;
    signingSessionRef.current = walletSession;
    setSigning(true);
    setError(null);

    // Release the lock on guard failures as well as SDK failures.
    try {
      // Local storage can lack the payout address. Fetch it by vault ID.
      let registeredPayoutScriptPubKey = activity.depositorPayoutBtcAddress;
      if (!registeredPayoutScriptPubKey) {
        const backfilled = await fetchVaultPayoutScriptPubKey(
          activity.id,
        ).catch(() => null);
        if (controller.signal.aborted) return;
        registeredPayoutScriptPubKey = backfilled ?? undefined;
      }
      if (!registeredPayoutScriptPubKey) {
        setError(COPY.deposit.payoutSigningGuards.missingPayoutAddress);
        return;
      }

      // Reject an indexer payout address that does not match the wallet.
      const connectedBtcAddress =
        btcConnector?.connectedWallet?.account?.address;
      if (!connectedBtcAddress) {
        setError(COPY.deposit.payoutSigningGuards.walletAddressUnavailable);
        return;
      }

      let walletScriptPubKey: string;
      try {
        walletScriptPubKey = btcAddressToScriptPubKeyHex(connectedBtcAddress);
      } catch {
        setError(COPY.deposit.payoutSigningGuards.walletAddressError);
        return;
      }
      if (
        normalizeScriptPubKeyHex(walletScriptPubKey) !==
        normalizeScriptPubKeyHex(registeredPayoutScriptPubKey)
      ) {
        setError(COPY.deposit.payoutSigningGuards.payoutAddressMismatch);
        return;
      }

      // Require an assigned provider before lookup.
      const vaultProviderAddress = activity.providers[0]?.id;
      if (!vaultProviderAddress) {
        setError(COPY.deposit.payoutSigningGuards.providerNotAssigned);
        return;
      }
      const provider = findProvider(vaultProviderAddress);
      if (!provider) {
        setError(COPY.deposit.payoutSigningGuards.providerNotFound);
        return;
      }

      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        setError(COPY.deposit.payoutSigningGuards.walletNotConnected);
        return;
      }

      // The SDK needs this transaction ID to poll the VP.
      if (!activity.peginTxHash) {
        setError(COPY.deposit.payoutSigningGuards.missingPeginTransaction);
        return;
      }

      // VP authentication and deposit terms need the funded Pre-PegIn hex.
      if (!activity.unsignedPrePeginTx) {
        setError(COPY.deposit.payoutSigningGuards.missingPrePeginTransaction);
        return;
      }
      const wallet = btcWalletProvider as BitcoinWallet;

      // Check for a locked or disconnected wallet before signing.
      try {
        await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
          probeConnection: shouldProbeWalletLiveness(
            btcConnector?.connectedWallet?.id,
          ),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError({
          title: COPY.wallet.liveness.errorTitle,
          message:
            err instanceof BtcWalletLivenessError
              ? err.message
              : COPY.wallet.liveness.unresponsive,
        });
        return;
      }

      if (controller.signal.aborted) return;
      // Authentication comes before the payout signing rounds.
      setProgress({ phase: "auth", completed: 0, total: 0 });
      claimersDoneRef.current = false;

      // Check cancellation around each PSBT call, including sequential calls.
      const withDeviceWindow = async <T>(run: () => Promise<T>): Promise<T> => {
        controller.signal.throwIfAborted();
        setDeviceWindowActive(true);
        try {
          const result = await run();
          controller.signal.throwIfAborted();
          return result;
        } finally {
          setDeviceWindowActive(false);
        }
      };

      const graphProgressWallet: BitcoinWallet & Partial<DepositTermsApprover> =
        {
          ...wallet,
          deriveContextHash: async (appName, context) => {
            controller.signal.throwIfAborted();
            setProgress({ phase: "auth", completed: 0, total: 0 });
            try {
              const hash = await wallet.deriveContextHash(appName, context);
              controller.signal.throwIfAborted();
              return hash;
            } finally {
              setProgress({ phase: "claimers", completed: 0, total: 0 });
            }
          },
          signPsbt: async (hex, opts) => {
            // Snapshot: the ref flips only from the SDK's onProgress, after this call returns.
            const isGraph = claimersDoneRef.current;
            if (isGraph) {
              setProgress({ phase: "graph", completed: 0, total: 1 });
            }
            const signed = await withDeviceWindow(() =>
              wallet.signPsbt(hex, opts),
            );
            if (isGraph) {
              setProgress({ phase: "graph", completed: 1, total: 1 });
            }
            return signed;
          },
          ...(wallet.signPsbts
            ? {
                signPsbts: async (hexes, opts) => {
                  // Snapshot: the ref flips only from the SDK's onProgress, after this call returns.
                  const phase = claimersDoneRef.current ? "graph" : "claimers";
                  if (phase === "graph") {
                    setProgress({ phase, completed: 0, total: hexes.length });
                  }
                  // Per-ceremony ticks from hardware providers; a no-op elsewhere.
                  const stopObserving = observeSigningProgress(wallet, (tick) =>
                    setProgress({ phase, ...tick }),
                  );
                  try {
                    const signed = await withDeviceWindow(() =>
                      wallet.signPsbts!(hexes, opts),
                    );
                    if (phase === "graph") {
                      setProgress({
                        phase,
                        completed: hexes.length,
                        total: hexes.length,
                      });
                    }
                    return signed;
                  } finally {
                    stopObserving();
                  }
                },
              }
            : {}),
          // Object spread drops prototype methods — see forwardDepositApproval.
          ...forwardDepositApproval(wallet),
          ...(supportsDepositApproval(wallet)
            ? {
                approveDepositTerms: async (terms: DepositTerms) => {
                  controller.signal.throwIfAborted();
                  await wallet.approveDepositTerms(terms);
                  controller.signal.throwIfAborted();
                },
              }
            : {}),
        };

      try {
        // Approval (intent) wallets have nothing in memory to approve on
        // resume — rebuild the terms from chain + WASM, never browser storage.
        let depositTerms: DepositTerms | undefined;
        if (supportsDepositApproval(wallet)) {
          const onChainVault = await getVaultFromChain(activity.id);
          // Cheap, decisive gates first: a stalled/ack-expired deposit must
          // surface its refund copy even if a mempool prevout read fails.
          await assertPresignTargetSignable(activity.id, onChainVault);
          const { fundedTxFee } = await resolveFundedTxFeeAndUtxos(
            activity.unsignedPrePeginTx,
          );
          depositTerms = await rebuildDepositTerms({
            vaultId: activity.id,
            target: onChainVault,
            fundedPrePeginTxHex: activity.unsignedPrePeginTx,
            connectedDepositorAddress: depositorEthAddress,
            depositorBtcPubkey: btcPublicKey,
            fundedTxFee,
            lifecycle: "presign",
          });
        }

        controller.signal.throwIfAborted();
        await signAndSubmitPayouts({
          vaultId: activity.id,
          peginTxHash: activity.peginTxHash,
          depositorBtcPubkey: btcPublicKey,
          providerBtcPubKey: provider.btcPubKey,
          registeredPayoutScriptPubKey,
          btcWallet: graphProgressWallet,
          depositorEthAddress,
          unsignedPrePeginTxHex: activity.unsignedPrePeginTx,
          // Spread keeps the software-wallet params identical to before —
          // no `depositTerms` key at all rather than an explicit undefined.
          ...(depositTerms ? { depositTerms } : {}),
          signal: controller.signal,
          onProgress: (next) => {
            if (next === null || controller.signal.aborted) return;
            setProgress(next);
            claimersDoneRef.current =
              next.total > 0 && next.completed >= next.total;
          },
        });

        if (controller.signal.aborted) return;
        // Show the stored signing status before the next poll.
        setOptimisticStatus(activity.id, LocalStorageStatus.PAYOUT_SIGNED);

        setIsComplete(true);
        onSuccess();
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        )
          return;
        // A stalled deposit refusal is expected. Do not report a signing failure.
        const presignRefusal =
          isVaultLifecycleStateError(err) && err.stage === "presign";
        if (!presignRefusal) {
          // Critical-path #3 presign failure on the resume path — previously
          // only surfaced to UI state, invisible to Sentry.
          captureFunnelFailure(
            TELEMETRY_STAGE.ACTIVATION_PAYOUTS,
            err,
            activity.id,
            {
              tags: { providerId: shortId(vaultProviderAddress) },
            },
          );
        }
        // A lifecycle refusal or rejected deposit terms cannot succeed on retry.
        setErrorTerminal(presignRefusal || isDepositTermsRejectedError(err));
        setError(formatPayoutSignatureError(err));
      }
    } finally {
      inFlightRef.current = false;
      setSigning(false);
      signingProviderRef.current = null;
      signingSessionRef.current = null;
      // Clear the request after every settle path.
      cancelRequestedRef.current = false;
      setCancelRequested(false);
    }
  }, [
    requireBtcWallet,
    signing,
    activity.providers,
    activity.peginTxHash,
    activity.id,
    activity.depositorPayoutBtcAddress,
    activity.unsignedPrePeginTx,
    findProvider,
    btcConnector?.connectedWallet?.account?.address,
    btcConnector?.connectedWallet?.provider,
    btcConnector?.connectedWallet?.id,
    btcPublicKey,
    walletKeyReady,
    walletSession,
    depositorEthAddress,
    setOptimisticStatus,
    onSuccess,
  ]);

  // Show device cancellation only while the original provider can act on it.
  const canCancel =
    signing &&
    deviceWindowActive &&
    supportsCancelSigning(signingProviderRef.current);

  const handleCancel = useCallback(() => {
    // Keep cancellation bound to the provider that started the attempt.
    const provider = signingProviderRef.current;
    if (!inFlightRef.current || cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setCancelRequested(true);
    // Stop VP polling now. The device call can remain pending.
    abortRef.current?.abort();
    if (supportsCancelSigning(provider)) provider.cancelSigning();
  }, []);

  useEffect(() => {
    if (
      inFlightRef.current &&
      (signingSessionRef.current !== walletSession ||
        signingProviderRef.current !== btcConnector?.connectedWallet?.provider)
    ) {
      setError(COPY.deposit.payoutSigningGuards.walletNotConnected);
      handleCancel();
    }
  }, [walletSession, btcConnector?.connectedWallet?.provider, handleCancel]);

  return {
    signing,
    progress,
    error,
    errorTerminal,
    isComplete,
    handleSign,
    canCancel,
    cancelRequested,
    handleCancel,
  };
}
