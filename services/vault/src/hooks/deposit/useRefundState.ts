import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { useETHWallet } from "@/context/wallet";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { buildAndBroadcastRefundTransaction } from "@/services/vault/vaultRefundService";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";

export interface UseRefundStateProps {
  activity: VaultActivity;
}

export interface UseRefundStateResult {
  /** Whether a refund broadcast is in progress */
  refunding: boolean;
  /** Broadcasted refund transaction ID on success */
  refundTxId: string | null;
  /** Error message if refund failed */
  error: string | null;
  /**
   * Handler to initiate refund at the given sat/vB fee rate. The caller
   * (Review card) owns the rate — the user edits it before clicking Confirm.
   */
  handleRefund: (feeRate: number) => Promise<void>;
}

/** Stable empty array to avoid re-render cascades in usePeginStorage. */
const EMPTY_CONFIRMED: VaultActivity[] = [];

export function useRefundState({
  activity,
}: UseRefundStateProps): UseRefundStateResult {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const { address: ethAddress } = useETHWallet();
  const { setOptimisticStatus } = usePeginPolling();
  const { pendingPegins, addPendingPegin, updatePendingPeginStatus } =
    usePeginStorage({
      ethAddress: ethAddress ?? "",
      confirmedPegins: EMPTY_CONFIRMED,
    });

  const [refunding, setRefunding] = useState(false);
  const [refundTxId, setRefundTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Destructure stable primitives to avoid re-creating handleRefund on every render
  const {
    id: vaultId,
    peginTxHash,
    unsignedPrePeginTx,
    collateral,
    providers,
    applicationEntryPoint,
  } = activity;

  const handleRefund = useCallback(
    async (feeRate: number) => {
      if (!btcWalletProvider) {
        setError("BTC wallet not connected");
        return;
      }
      if (!vaultId) {
        setError("Missing vault ID");
        return;
      }
      if (!Number.isFinite(feeRate) || feeRate <= 0) {
        setError("Fee rate must be a positive number");
        return;
      }

      setRefunding(true);
      setError(null);

      try {
        // Fetch the pubkey live from the wallet (not from storage). The
        // wallet's signPsbt signInputs[].publicKey requires the wallet's
        // native format (typically compressed 33-byte sec1), and the
        // stored activity holds the canonical x-only form used for
        // on-chain/indexer identification.
        const depositorBtcPubkey = await btcWalletProvider.getPublicKeyHex();
        const txId = await buildAndBroadcastRefundTransaction({
          vaultId,
          btcWalletProvider,
          depositorBtcPubkey,
          feeRate,
        });
        setRefundTxId(txId);
        setRefunding(false);

        // Mark the vault as refund-broadcast so the Refund button hides and
        // the status flips to "Refunding" until the indexer detects the HTLC
        // spend and the contract transitions to DEPOSITOR_WITHDRAWN.
        //
        // In-memory optimistic update covers the current session immediately;
        // localStorage persistence covers page reloads during the BTC
        // confirmation + indexer-ingestion window. We persist only when the
        // activity carries a peginTxHash + unsignedPrePeginTx (the storage
        // validator rejects entries missing either) — without those we keep
        // the optimistic-only behaviour rather than fabricating fields.
        //
        // Known limitation: if the broadcast tx is evicted from the mempool
        // (rare: low-fee + high pressure) the marker stays set indefinitely
        // because nothing on-chain will trigger the cleanup. Re-broadcast
        // / RBF / fee-bump UX is intentionally deferred — the indexer-side
        // refund-detection work would obviate it.
        setOptimisticStatus(vaultId, LocalStorageStatus.REFUND_BROADCAST);

        if (ethAddress && peginTxHash && unsignedPrePeginTx) {
          const existing = pendingPegins.find((p) => p.id === vaultId);
          if (existing) {
            updatePendingPeginStatus(
              vaultId,
              LocalStorageStatus.REFUND_BROADCAST,
            );
          } else {
            addPendingPegin({
              id: vaultId,
              peginTxHash,
              unsignedTxHex: unsignedPrePeginTx,
              amount: collateral.amount,
              providerIds: providers.map((p) => p.id),
              applicationEntryPoint,
              depositorBtcPubkey,
              status: LocalStorageStatus.REFUND_BROADCAST,
            });
          }
        }

        // onSuccess() is intentionally NOT called here. The success screen
        // displays the txId and the consumer (RefundModal) calls onSuccess()
        // from its onClose handler so the parent refetches activities only
        // after the user has acknowledged the result.
      } catch (err) {
        logger.error(err instanceof Error ? err : new Error(String(err)), {
          data: { context: "Refund failed", vaultId },
        });
        const message =
          err instanceof Error ? err.message : "Refund transaction failed";
        setError(
          message.includes("non-BIP68-final")
            ? "The Bitcoin timelock has not expired yet. Your refund will be available once enough blocks have been mined since the deposit transaction. Please try again later."
            : message,
        );
        setRefunding(false);
      }
    },
    [
      vaultId,
      btcWalletProvider,
      ethAddress,
      peginTxHash,
      unsignedPrePeginTx,
      collateral.amount,
      providers,
      applicationEntryPoint,
      pendingPegins,
      setOptimisticStatus,
      addPendingPegin,
      updatePendingPeginStatus,
    ],
  );

  return { refunding, refundTxId, error, handleRefund };
}
