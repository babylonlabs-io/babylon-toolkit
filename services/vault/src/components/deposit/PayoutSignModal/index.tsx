/**
 * PayoutSignModal
 *
 * Standalone modal for signing payout transactions.
 * Opens when user clicks "Sign" button from deposits table.
 *
 * This is Step 3 isolated - assumes Steps 1 & 2 already completed.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Hex } from "viem";

import { usePeginPolling } from "../../../context/deposit/PeginPollingContext";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import {
  getNextLocalStatus,
  LocalStorageStatus,
  PeginAction,
} from "../../../models/peginStateMachine";
import { signAndSubmitPayoutSignatures } from "../../../services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "../../../storage/peginStorage";
import type { VaultActivity } from "../../../types/activity";

interface PayoutSignModalProps {
  /** Modal open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** The deposit/activity to sign payouts for */
  activity: VaultActivity;
  /** Claim and payout transactions from polling */
  transactions: any[] | null;
  /** Depositor's BTC public key (x-only, 32 bytes without 0x prefix) */
  btcPublicKey: string;
  /** Depositor's ETH address */
  depositorEthAddress: Hex;
  /** Success callback - refetch activities */
  onSuccess: () => void;
}

/**
 * Modal for signing payout transactions (Step 3 only)
 *
 * Assumes proof of possession and ETH submission already complete.
 * Only handles payout signature signing and submission.
 */
export function PayoutSignModal({
  open,
  onClose,
  activity,
  transactions,
  btcPublicKey,
  depositorEthAddress,
  onSuccess,
}: PayoutSignModalProps) {
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use applicationController from activity to fetch the correct providers
  const { findProvider, liquidators } = useVaultProviders(
    activity.applicationController,
  );
  const btcConnector = useChainConnector("BTC");

  // Get optimistic update from polling context
  const { setOptimisticStatus } = usePeginPolling();

  const handleSign = useCallback(async () => {
    if (!transactions || transactions.length === 0) {
      setError("No transactions available to sign");
      return;
    }

    setSigning(true);
    setError(null);

    try {
      // Note: Currently only single vault provider per deposit is supported
      const vaultProviderAddress = activity.providers[0]?.id as Hex;
      const provider = findProvider(vaultProviderAddress);

      if (!provider) {
        throw new Error("Vault provider not found");
      }

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error("BTC wallet not connected");
      }

      // Sign and submit payout signatures
      await signAndSubmitPayoutSignatures({
        peginTxId: activity.txHash!,
        depositorBtcPubkey: btcPublicKey,
        claimerTransactions: transactions,
        providers: {
          vaultProvider: {
            address: provider.id as Hex,
            url: provider.url,
            btcPubKey: provider.btcPubKey,
          },
          liquidators,
        },
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      // Update localStorage status using state machine
      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
      if (nextStatus && activity.txHash) {
        updatePendingPeginStatus(
          depositorEthAddress,
          activity.txHash,
          nextStatus,
        );

        // Optimistically update UI immediately (before refetch completes)
        setOptimisticStatus(activity.id, LocalStorageStatus.PAYOUT_SIGNED);
      }

      // Success - refetch and close
      setSigning(false);
      onSuccess();
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to sign payout transactions";
      setError(errorMessage);
      setSigning(false);
    }
  }, [
    transactions,
    activity.providers,
    activity.txHash,
    activity.id,
    findProvider,
    liquidators,
    btcConnector?.connectedWallet?.provider,
    btcPublicKey,
    onSuccess,
    onClose,
    depositorEthAddress,
    setOptimisticStatus,
  ]);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Sign Payout Transactions"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Your vault providers have prepared the payout transactions. Please
          sign to complete your deposit.
        </Text>

        {/* Error Display */}
        {error && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
              Error: {error}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={signing}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={signing ? undefined : handleSign}
        >
          {signing ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Retry"
          ) : (
            "Sign Payout Transactions"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
