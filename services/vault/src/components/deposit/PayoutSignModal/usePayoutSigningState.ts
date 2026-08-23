/**
 * Hook for managing payout signing state and logic.
 *
 * Delegates all signing, VP polling, and submission to the SDK via
 * `signAndSubmitPayouts` (the shared deposit-flow adapter). This hook owns
 * only the React state, guard checks, and optimistic localStorage updates.
 */

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
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";
import { isUserCancellation } from "../../../utils/errors/userCancellation";
import { isVaultLifecycleStateError } from "../../../utils/errors/vaultLifecycleStateError";

export interface SigningError {
  title: string;
  message: string;
  /** Raw error for the "copy details" action; only the generic fallback sets it. */
  diagnostics?: string;
}

export interface UsePayoutSigningStateProps {
  activity: VaultActivity;
  btcPublicKey: string;
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
  /**
   * True when `error` is a refusal retrying cannot change (presign lifecycle
   * refusal, device rejected the deposit terms) — callers hide the retry CTA.
   */
  errorTerminal: boolean;
  /** Whether signing completed successfully */
  isComplete: boolean;
  /** Handler to initiate signing */
  handleSign: () => Promise<void>;
  /**
   * True while the in-flight sign can be cancelled: signing is active AND the
   * provider that started the sign exposes `cancelSigning` (only the Ledger
   * provider does — always capability-probed, never assumed).
   */
  canCancel: boolean;
  /** True from {@link handleCancel} until the in-flight sign settles. */
  cancelRequested: boolean;
  /**
   * Requests cancellation of the in-flight sign. This does NOT settle it:
   * the provider aborts at its next device exchange boundary, which may be
   * only after the user finishes or rejects on the physical device.
   */
  handleCancel: () => void;
}

function normalizeScriptPubKeyHex(scriptPubKey: string): string {
  return stripHexPrefix(scriptPubKey).toLowerCase();
}

export function usePayoutSigningState({
  activity,
  btcPublicKey,
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
  // Ref mirror so the settle paths inside handleSign read the live value —
  // the state itself is stale inside the long-lived async closure.
  const cancelRequestedRef = useRef(false);

  const { findProvider } = useVaultProviders(activity.applicationEntryPoint);
  const btcConnector = useChainConnector("BTC");
  const { setOptimisticStatus } = usePeginPolling();

  // Abort signing if the hook unmounts (e.g. user closes the modal) so we
  // don't call setState on an unmounted component and stop the polling loop.
  //
  // Dev quirk: React StrictMode runs effects mount→cleanup→remount on the
  // first commit. A direct `() => abort()` cleanup would kill the in-flight
  // controller that `useRunOnce(handleSign)` just created during the first
  // mount. We defer the abort to the next tick so the strict-mode remount
  // can cancel it; a real unmount has no follow-up remount, so the scheduled
  // abort fires normally.
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

  // Synchronous reentrancy guard. The `signing` state is async (batched by
  // React), so two back-to-back calls before the next render could both see
  // `signing === false`. Flip the ref before the first await, clear it in
  // `finally`, and always check this before the state.
  const inFlightRef = useRef(false);

  // Provider that STARTED the in-flight sign. Cancellation binds to it so a
  // wallet swapped in mid-prompt cannot orphan the original ceremony.
  const signingProviderRef = useRef<unknown>(null);

  const claimersDoneRef = useRef(false);

  const handleSign = useCallback(async () => {
    if (inFlightRef.current || signing) return;
    inFlightRef.current = true;
    // A new attempt starts non-terminal: a guard error after a terminal
    // refusal is a fresh, recoverable error and must get its Retry back.
    setErrorTerminal(false);

    // Single outer try/finally so the reentrancy lock is always cleared —
    // including on synchronous throws from the guards (e.g.
    // `btcAddressToScriptPubKeyHex` rejects a wallet on the wrong BTC
    // network). Without this, a guard throw would leave `inFlightRef`
    // stuck at true and lock out every subsequent `handleSign()` until the
    // component remounts.
    try {
      // The merged activity falls back to its localStorage-only shape when
      // the indexer's paginated vault list misses this vault; that shape
      // never carries the payout address (an indexer-only field). Backfill
      // with a direct by-id lookup before refusing to sign. The lookup
      // projects only the payout field so an unrelated null on the row
      // cannot fail the fetch while the address itself is available.
      let registeredPayoutScriptPubKey = activity.depositorPayoutBtcAddress;
      if (!registeredPayoutScriptPubKey) {
        const backfilled = await fetchVaultPayoutScriptPubKey(
          activity.id,
        ).catch(() => null);
        registeredPayoutScriptPubKey = backfilled ?? undefined;
      }
      if (!registeredPayoutScriptPubKey) {
        setError(COPY.deposit.payoutSigningGuards.missingPayoutAddress);
        return;
      }

      // Security: the indexer-sourced payout scriptPubKey must match the
      // connected wallet. A compromised indexer could otherwise trick signing
      // over an attacker-chosen payout address. Mandatory — never skip this
      // guard if the wallet address can't be read; reject upfront instead.
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

      // Guard `providers[0]` explicitly rather than casting a possibly-undefined
      // value — that would hide the "no provider assigned" case and leak
      // `undefined` into `findProvider`.
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

      // `peginTxHash` is optional on `VaultActivity`, but payout signing
      // cannot proceed without it — the SDK keys the VP poll by this txid.
      // Guard explicitly instead of relying on a non-null assertion below.
      if (!activity.peginTxHash) {
        setError(COPY.deposit.payoutSigningGuards.missingPeginTransaction);
        return;
      }

      // Every wallet needs the funded Pre-PegIn hex on this path: the cold VP
      // auth path hashes it and parses funding outpoints from it, and approval
      // wallets also rebuild deposit terms from it. A localStorage-only merged
      // activity shape can lack it — guard once, for all wallets, like the
      // WOTS and activation resume paths do.
      if (!activity.unsignedPrePeginTx) {
        setError(COPY.deposit.payoutSigningGuards.missingPrePeginTransaction);
        return;
      }
      const wallet = btcWalletProvider as BitcoinWallet;

      // The wallet may have locked/disconnected since the modal opened. Probe
      // it before signing so a locked wallet surfaces an actionable error
      // instead of a silent no-op (modal opens, no signing popup appears).
      try {
        await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
          probeConnection: shouldProbeWalletLiveness(
            btcConnector?.connectedWallet?.id,
          ),
        });
      } catch (err) {
        setError({
          title: COPY.wallet.liveness.errorTitle,
          message:
            err instanceof BtcWalletLivenessError
              ? err.message
              : COPY.wallet.liveness.unresponsive,
        });
        return;
      }

      signingProviderRef.current = btcWalletProvider;
      setSigning(true);
      setError(null);
      // Start on the auth-anchor step — the first thing the flow does is
      // authenticate with the VP (deriveContextHash). The wrapper below moves
      // to the claimer and depositor-graph rounds as they happen.
      setProgress({ phase: "auth", completed: 0, total: 0 });
      claimersDoneRef.current = false;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const graphProgressWallet: BitcoinWallet & Partial<DepositTermsApprover> =
        {
          ...wallet,
          deriveContextHash: async (appName, context) => {
            setProgress({ phase: "auth", completed: 0, total: 0 });
            try {
              return await wallet.deriveContextHash(appName, context);
            } finally {
              setProgress({ phase: "claimers", completed: 0, total: 0 });
            }
          },
          signPsbt: async (hex, opts) => {
            if (claimersDoneRef.current) {
              setProgress({ phase: "graph", completed: 0, total: 1 });
            }
            try {
              return await wallet.signPsbt(hex, opts);
            } finally {
              if (claimersDoneRef.current) {
                setProgress({ phase: "graph", completed: 1, total: 1 });
              }
            }
          },
          ...(wallet.signPsbts
            ? {
                signPsbts: async (hexes, opts) => {
                  if (claimersDoneRef.current) {
                    setProgress({
                      phase: "graph",
                      completed: 0,
                      total: hexes.length,
                    });
                  }
                  try {
                    return await wallet.signPsbts!(hexes, opts);
                  } finally {
                    if (claimersDoneRef.current) {
                      setProgress({
                        phase: "graph",
                        completed: hexes.length,
                        total: hexes.length,
                      });
                    }
                  }
                },
              }
            : {}),
          // Object spread drops prototype methods — see forwardDepositApproval.
          ...forwardDepositApproval(wallet),
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
          // Last cancellation point before wallet/device interaction — the
          // rebuild's chain reads leave a window where the modal may close.
          if (abortRef.current.signal.aborted) {
            setSigning(false);
            return;
          }
        }

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
          signal: abortRef.current.signal,
          onProgress: (next) => {
            if (next === null) return;
            setProgress(next);
            claimersDoneRef.current =
              next.total > 0 && next.completed >= next.total;
          },
        });

        // localStorage is written by signAndSubmitPayouts; mirror it
        // optimistically so the polling query picks up PAYOUT_SIGNED before
        // the next poll cycle.
        setOptimisticStatus(activity.id, LocalStorageStatus.PAYOUT_SIGNED);

        setSigning(false);
        setIsComplete(true);
        onSuccess();
      } catch (err) {
        // Read before the finally consumes it: was this settle preceded by
        // the user's own cancel request?
        const selfCancelRequested = cancelRequestedRef.current;
        if (err instanceof Error && err.name === "AbortError") {
          setSigning(false);
          return;
        }
        // A self-requested cancel settling as the wallet's user-cancel
        // rejection is not an error — return to the pre-sign idle state.
        if (selfCancelRequested && isUserCancellation(err)) {
          setSigning(false);
          return;
        }
        // A presign lifecycle refusal (ack window elapsed, target already
        // past PENDING) is the routine outcome for a stalled deposit — and
        // the resume modal auto-fires this handler on mount — so it is not a
        // payout-signing failure and must not inflate the funnel-stage alert.
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
        // Decide terminality from the typed error BEFORE formatting flattens
        // it to copy: a lifecycle refusal or a device envelope rejection can
        // never succeed on retry.
        setErrorTerminal(presignRefusal || isDepositTermsRejectedError(err));
        setError(formatPayoutSignatureError(err));
        setSigning(false);
      }
    } finally {
      inFlightRef.current = false;
      signingProviderRef.current = null;
      // Every settle path (success, any error, guard return) consumes a
      // pending cancel request so the modal can't wedge on a disabled button.
      cancelRequestedRef.current = false;
      setCancelRequested(false);
    }
  }, [
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
    depositorEthAddress,
    setOptimisticStatus,
    onSuccess,
  ]);

  // Capability probe: only the Ledger vault provider exposes cancelSigning.
  // Reads the provider that started the sign, not the live connector — a
  // wallet swapped in mid-prompt must not retarget the affordance. The ref is
  // only ever set/cleared together with the `signing` state, so this render
  // read stays in sync.
  const signingProvider = signingProviderRef.current as {
    cancelSigning?: unknown;
  } | null;
  const canCancel =
    signing && typeof signingProvider?.cancelSigning === "function";

  const handleCancel = useCallback(() => {
    // Cancel the ceremony on the provider that started it — never the
    // connector's current provider.
    const provider = signingProviderRef.current as {
      cancelSigning?: () => void;
    } | null;
    if (!inFlightRef.current || cancelRequestedRef.current) return;
    if (typeof provider?.cancelSigning !== "function") return;
    cancelRequestedRef.current = true;
    setCancelRequested(true);
    // A REQUEST, not a settle: the provider aborts at its next device
    // exchange boundary, so the sign promise stays pending until the user
    // acts on the device. Abort our own signal too so VP polling stops now.
    provider.cancelSigning();
    abortRef.current?.abort();
  }, []);

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
