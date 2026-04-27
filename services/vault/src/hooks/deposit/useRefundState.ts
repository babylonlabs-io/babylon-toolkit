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
  refunding: boolean;
  refundTxId: string | null;
  error: string | null;
  handleRefund: (feeRate: number) => Promise<void>;
}

const EMPTY_CONFIRMED: VaultActivity[] = [];

export function useRefundState({
  activity,
}: UseRefundStateProps): UseRefundStateResult {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const { address: ethAddress } = useETHWallet();
  const { setOptimisticStatus } = usePeginPolling();
  const { pendingPegins, addPendingPegin, markRefundBroadcast } =
    usePeginStorage({
      ethAddress: ethAddress ?? "",
      confirmedPegins: EMPTY_CONFIRMED,
    });

  const [refunding, setRefunding] = useState(false);
  const [refundTxId, setRefundTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        const refundBroadcastAt = Date.now();
        setOptimisticStatus(
          vaultId,
          LocalStorageStatus.REFUND_BROADCAST,
          refundBroadcastAt,
        );

        if (ethAddress && peginTxHash && unsignedPrePeginTx) {
          const existing = pendingPegins.find((p) => p.id === vaultId);
          if (existing) {
            markRefundBroadcast(vaultId, refundBroadcastAt);
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
              refundBroadcastAt,
            });
          }
        }
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
      markRefundBroadcast,
    ],
  );

  return { refunding, refundTxId, error, handleRefund };
}
