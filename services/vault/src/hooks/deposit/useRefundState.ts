import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";

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

  // Destructure stable primitives to avoid re-creating handleRefund on every render
  const { id: vaultId } = activity;

  const handleRefund = useCallback(async () => {
    if (!btcWalletProvider) {
      setError("BTC wallet not connected");
      return;
    }
    if (!vaultId) {
      setError("Missing vault ID");
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
      });
      setRefundTxId(txId);
      setRefunding(false);
      // onSuccess() is intentionally NOT called here.
      // The success screen displays the txId and lets the user close the dialog.
      // onSuccess() is called from ResumeRefundContent's onClose so the parent
      // refetches activities only after the user has seen the confirmation.
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
  }, [vaultId, btcWalletProvider]);

  return { refunding, refundTxId, error, handleRefund };
}
