import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import { logger } from "@/infrastructure";
import {
  ReclaimAlreadySettledError,
  buildAndBroadcastReclaimTransaction,
} from "@/services/vault/vaultReclaimService";
import type { VaultActivity } from "@/types/activity";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";

export interface UseReclaimStateProps {
  activity: VaultActivity;
}

export interface UseReclaimStateResult {
  reclaiming: boolean;
  reclaimTxId: string | null;
  /** True when the reserve turned out to be already spent. */
  alreadySettled: boolean;
  error: string | null;
  handleReclaim: (feeRate: number) => Promise<void>;
}

/**
 * Execution machinery for the reclaim. Sibling of `useRefundState`, minus its
 * local-storage bookkeeping: the vault is already terminal by the time a
 * reclaim is offered, so its storage entry has been cleared and there is
 * nothing to mark. The row disappears on the next poll once the sweep lands.
 */
export function useReclaimState({
  activity,
}: UseReclaimStateProps): UseReclaimStateResult {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimTxId, setReclaimTxId] = useState<string | null>(null);
  const [alreadySettled, setAlreadySettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous reentrancy guard: `reclaiming` updates async, so rapid
  // double-confirms before the next render could race two wallet prompts.
  const inFlightRef = useRef(false);
  // Abort an in-flight reclaim on unmount (the user closing the modal
  // mid-prompt). Deferred one tick so StrictMode's mount→cleanup→remount
  // doesn't kill the controller we just created.
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

  const { id: vaultId } = activity;

  const handleReclaim = useCallback(
    async (feeRate: number) => {
      if (inFlightRef.current || reclaiming) return;
      inFlightRef.current = true;

      try {
        if (!btcWalletProvider || !connectedBtcAddress) {
          setError("BTC wallet not connected");
          return;
        }
        if (!vaultId) {
          setError("Missing BTC Vault ID");
          return;
        }
        if (!Number.isFinite(feeRate) || feeRate <= 0) {
          setError("Fee rate must be a positive number");
          return;
        }

        setReclaiming(true);
        setError(null);

        abortRef.current?.abort();
        abortRef.current = new AbortController();

        try {
          await verifyBtcWalletLiveness(
            btcWalletProvider,
            connectedBtcAddress,
            {
              probeConnection: shouldProbeWalletLiveness(
                btcConnector?.connectedWallet?.id,
              ),
            },
          );

          // The wallet's live key, not the indexer's copy: the SDK re-derives
          // the claim script from this and aborts if it does not match the
          // reserve's scriptPubKey, which is what proves this wallet can spend.
          const depositorBtcPubkey = await btcWalletProvider.getPublicKeyHex();

          const txId = await buildAndBroadcastReclaimTransaction({
            vaultId: vaultId as Hex,
            depositorBtcPubkey,
            feeRate,
            signPsbt: (psbtHex, opts) =>
              btcWalletProvider.signPsbt(psbtHex, opts),
            signal: abortRef.current.signal,
          });
          setReclaimTxId(txId);
          setReclaiming(false);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            setReclaiming(false);
            return;
          }
          if (err instanceof ReclaimAlreadySettledError) {
            // Someone else already swept it — usually this depositor on
            // another device. Their money is where they wanted it, so this is
            // a terminal success state, not a failure.
            setAlreadySettled(true);
            setReclaiming(false);
            return;
          }
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: { context: "Reclaim failed", vaultId },
          });
          setError(
            err instanceof Error ? err.message : "Reclaim transaction failed",
          );
          setReclaiming(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [
      reclaiming,
      vaultId,
      btcWalletProvider,
      connectedBtcAddress,
      btcConnector?.connectedWallet?.id,
    ],
  );

  return { reclaiming, reclaimTxId, alreadySettled, error, handleReclaim };
}
