import { useCallback, useState } from "react";

import { useBTCWallet } from "@/context/wallet";
import { logger } from "@/infrastructure";
import { buildAndBroadcastRefundTransaction } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";

export interface UseRefundStateProps {
  activity: VaultActivity;
  onSuccess: () => void;
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
  onSuccess,
}: UseRefundStateProps): UseRefundStateResult {
  const { provider: btcWalletProvider } = useBTCWallet();
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

    setRefunding(true);
    setError(null);

    try {
      const txId = await buildAndBroadcastRefundTransaction({
        vaultId: activity.txHash,
        btcWalletProvider,
      });
      setRefundTxId(txId);
      setRefunding(false);
      onSuccess();
    } catch (err) {
      logger.error(err instanceof Error ? err : new Error(String(err)), {
        data: { context: "Refund failed", vaultId: activity.txHash },
      });
      setError(
        err instanceof Error ? err.message : "Refund transaction failed",
      );
      setRefunding(false);
    }
  }, [activity, btcWalletProvider, onSuccess]);

  return { refunding, refundTxId, error, handleRefund };
}
