import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { useETHWallet } from "@/context/wallet";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { buildAndBroadcastRefundTransaction } from "@/services/vault/vaultRefundService";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";

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
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;
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

  // Synchronous reentrancy guard. `refunding` updates async; rapid double-
  // confirms before the next render could both pass the state check and
  // race two wallet prompts.
  const inFlightRef = useRef(false);
  // Abort the in-flight refund if the hook unmounts (e.g. user closes the
  // modal mid-wallet-prompt) so we don't broadcast/resolve against an
  // unmounted component. Defer the abort one tick so React StrictMode's
  // mount→cleanup→remount doesn't kill the controller we just created.
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
      if (inFlightRef.current || refunding) return;
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
        if (!ethAddress) {
          // The refund flow needs the depositor's EOA to enumerate
          // sibling vaults (batched Pre-PegIn refunds). Without it we
          // can't reconstruct the full HTLC vector even for single-vault
          // refunds, so fail closed.
          setError("ETH wallet not connected");
          return;
        }
        if (!Number.isFinite(feeRate) || feeRate <= 0) {
          setError("Fee rate must be a positive number");
          return;
        }

        setRefunding(true);
        setError(null);

        abortRef.current?.abort();
        abortRef.current = new AbortController();

        try {
          // The wallet may have locked since the refund modal opened;
          // `getPublicKeyHex()` below is cached and would not reveal it. Probe
          // with a round-trip first so a locked wallet fails fast with an
          // actionable error instead of a silent no-op at signing time.
          await verifyBtcWalletLiveness(
            btcWalletProvider,
            connectedBtcAddress,
            {
              probeConnection: shouldProbeWalletLiveness(
                btcConnector?.connectedWallet?.id,
              ),
            },
          );

          // Fetch the pubkey live from the wallet (not from storage). The
          // wallet's signPsbt signInputs[].publicKey requires the wallet's
          // native format (typically compressed 33-byte sec1), and the
          // stored activity holds the canonical x-only form used for
          // on-chain/indexer identification.
          const depositorBtcPubkey = await btcWalletProvider.getPublicKeyHex();
          const txId = await buildAndBroadcastRefundTransaction({
            vaultId,
            depositorAddress: ethAddress as Address,
            btcWalletProvider,
            depositorBtcPubkey,
            feeRate,
            signal: abortRef.current.signal,
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
          if (err instanceof Error && err.name === "AbortError") {
            setRefunding(false);
            return;
          }
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: { context: "Refund failed", vaultId },
          });
          const message =
            err instanceof Error ? err.message : "Refund transaction failed";
          setError(
            message.includes("non-BIP68-final")
              ? "The Bitcoin timelock has not expired yet. Your refund will be claimable once enough blocks have been mined since the deposit transaction. Please try again later."
              : message,
          );
          setRefunding(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [
      refunding,
      vaultId,
      btcWalletProvider,
      connectedBtcAddress,
      btcConnector?.connectedWallet?.id,
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
