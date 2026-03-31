import { useCallback, useState } from "react";

import { useChainConnector } from "@/context/wallet";
import { logger } from "@/infrastructure";
import { buildAndBroadcastRefundTransaction } from "@/services/vault/vaultRefundService";
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
  /** Handler to initiate refund */
  handleRefund: () => Promise<void>;
}

export function useRefundState({
  activity,
}: UseRefundStateProps): UseRefundStateResult {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const [refunding, setRefunding] = useState(false);
  const [refundTxId, setRefundTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRefund = useCallback(async () => {
    if (!btcWalletProvider) {
      setError("BTC wallet not connected");
      return;
    }
    if (!activity.txHash) {
      setError("Missing vault transaction hash");
      return;
    }
    if (!activity.depositorBtcPubkey) {
      setError("Missing depositor BTC public key");
      return;
    }

    setRefunding(true);
    setError(null);

    try {
      const txId = await buildAndBroadcastRefundTransaction({
        vaultId: activity.txHash,
        btcWalletProvider,
        depositorBtcPubkey: activity.depositorBtcPubkey,
      });
      setRefundTxId(txId);
      setRefunding(false);
      // onSuccess() is intentionally NOT called here.
      // The success screen displays the txId and lets the user close the dialog.
      // onSuccess() is called from ResumeRefundContent's onClose so the parent
      // refetches activities only after the user has seen the confirmation.
    } catch (err) {
      logger.error(err instanceof Error ? err : new Error(String(err)), {
        data: { context: "Refund failed", vaultId: activity.txHash },
      });
      setError(
        err instanceof Error ? err.message : "Refund transaction failed",
      );
      setRefunding(false);
    }
  }, [activity, btcWalletProvider]);

  return { refunding, refundTxId, error, handleRefund };
}
