/**
 * Hook for managing payout signing state and logic.
 *
 * Delegates all signing, VP polling, and submission to the SDK via
 * `signAndSubmitPayouts` (the shared deposit-flow adapter). This hook owns
 * only the React state, guard checks, and optimistic localStorage updates.
 */

import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import { usePeginPolling } from "../../../context/deposit/PeginPollingContext";
import { signAndSubmitPayouts } from "../../../hooks/deposit/depositFlowSteps/payoutSigning";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import { LocalStorageStatus } from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import { btcAddressToScriptPubKeyHex } from "../../../utils/btc";
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";

import type { SigningProgressProps } from "./SigningProgress";

export interface SigningError {
  title: string;
  message: string;
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
  progress: SigningProgressProps;
  /** Error state if signing failed */
  error: SigningError | null;
  /** Whether signing completed successfully */
  isComplete: boolean;
  /** Handler to initiate signing */
  handleSign: () => Promise<void>;
}

export function usePayoutSigningState({
  activity,
  btcPublicKey,
  depositorEthAddress,
  onSuccess,
}: UsePayoutSigningStateProps): UsePayoutSigningStateResult {
  const [signing, setSigning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState<SigningProgressProps>({
    completed: 0,
    totalClaimers: 0,
  });
  const [error, setError] = useState<SigningError | null>(null);

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

  const handleSign = useCallback(async () => {
    if (inFlightRef.current || signing) return;
    inFlightRef.current = true;

    // Single outer try/finally so the reentrancy lock is always cleared —
    // including on synchronous throws from the guards (e.g.
    // `btcAddressToScriptPubKeyHex` rejects a wallet on the wrong BTC
    // network). Without this, a guard throw would leave `inFlightRef`
    // stuck at true and lock out every subsequent `handleSign()` until the
    // component remounts.
    try {
      if (!activity.depositorPayoutBtcAddress) {
        setError({
          title: "Missing Payout Address",
          message:
            "Depositor payout address not available. Please wait for indexer sync and try again.",
        });
        return;
      }

      // Security: the indexer-sourced payout scriptPubKey must match the
      // connected wallet. A compromised indexer could otherwise trick signing
      // over an attacker-chosen payout address.
      const connectedBtcAddress =
        btcConnector?.connectedWallet?.account?.address;
      if (connectedBtcAddress) {
        let walletScriptPubKey: string;
        try {
          walletScriptPubKey = btcAddressToScriptPubKeyHex(connectedBtcAddress);
        } catch {
          setError({
            title: "Wallet Address Error",
            message:
              "Could not read your Bitcoin wallet address. Please reconnect the wallet and make sure it is on the correct Bitcoin network.",
          });
          return;
        }
        if (walletScriptPubKey !== activity.depositorPayoutBtcAddress) {
          setError({
            title: "Payout Address Mismatch",
            message:
              "The payout address from the indexer does not match your connected wallet. " +
              "This may indicate a data integrity issue. Please verify your wallet connection.",
          });
          return;
        }
      }

      const vaultProviderAddress = activity.providers[0]?.id as Hex;
      const provider = findProvider(vaultProviderAddress);
      if (!provider) {
        setError({
          title: "Provider Not Found",
          message: "Vault provider not found.",
        });
        return;
      }

      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        setError({
          title: "Wallet Not Connected",
          message: "BTC wallet not connected.",
        });
        return;
      }

      setSigning(true);
      setError(null);
      // Reset progress; the SDK emits (completed, total) once it knows the
      // real claimer count after polling the VP.
      setProgress({ completed: 0, totalClaimers: 0 });

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        await signAndSubmitPayouts({
          vaultId: activity.id,
          peginTxHash: activity.peginTxHash!,
          depositorBtcPubkey: btcPublicKey,
          providerBtcPubKey: provider.btcPubKey,
          registeredPayoutScriptPubKey: activity.depositorPayoutBtcAddress,
          btcWallet: btcWalletProvider,
          depositorEthAddress,
          signal: abortRef.current.signal,
          onProgress: (next) => {
            if (next === null) return;
            setProgress(next);
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
        if (err instanceof Error && err.name === "AbortError") {
          setSigning(false);
          return;
        }
        setError(formatPayoutSignatureError(err));
        setSigning(false);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [
    signing,
    activity.providers,
    activity.peginTxHash,
    activity.id,
    activity.depositorPayoutBtcAddress,
    findProvider,
    btcConnector?.connectedWallet?.account?.address,
    btcConnector?.connectedWallet?.provider,
    btcPublicKey,
    depositorEthAddress,
    setOptimisticStatus,
    onSuccess,
  ]);

  return { signing, progress, error, isComplete, handleSign };
}
