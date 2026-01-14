/**
 * Hook for managing payout signing state and logic
 *
 * Separates business logic from UI:
 * - State management (signing, progress, error)
 * - Validation and signing orchestration
 * - LocalStorage and optimistic updates
 */

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
import {
  prepareSigningContext,
  prepareTransactionsForSigning,
  signSingleClaimerTransactions,
  submitSignaturesToVaultProvider,
  validatePayoutSignatureParams,
} from "../../../services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "../../../storage/peginStorage";
import type { VaultActivity } from "../../../types/activity";
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";

export interface SigningError {
  title: string;
  message: string;
}

export interface SigningProgress {
  signed: number;
  total: number;
}

export interface UsePayoutSigningStateProps {
  activity: VaultActivity;
  transactions: any[] | null;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onSuccess: () => void;
  onClose: () => void;
}

export interface UsePayoutSigningStateResult {
  /** Whether signing is in progress */
  signing: boolean;
  /** Signing progress (signed/total) */
  progress: SigningProgress;
  /** Error state if signing failed */
  error: SigningError | null;
  /** Handler to initiate signing */
  handleSign: () => Promise<void>;
}

export function usePayoutSigningState({
  activity,
  transactions,
  btcPublicKey,
  depositorEthAddress,
  onSuccess,
  onClose,
}: UsePayoutSigningStateProps): UsePayoutSigningStateResult {
  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState<SigningProgress>({
    signed: 0,
    total: 0,
  });
  const [error, setError] = useState<SigningError | null>(null);

  // Get providers for the activity's application
  const { findProvider, vaultKeepers, universalChallengers } =
    useVaultProviders(activity.applicationController);
  const btcConnector = useChainConnector("BTC");

  // Get optimistic update from polling context
  const { setOptimisticStatus } = usePeginPolling();

  const handleSign = useCallback(async () => {
    // Validate transactions exist
    if (!transactions || transactions.length === 0) {
      setError({
        title: "No Transactions",
        message:
          "No transactions available to sign. Please wait and try again.",
      });
      return;
    }

    // Find vault provider
    const vaultProviderAddress = activity.providers[0]?.id as Hex;
    const provider = findProvider(vaultProviderAddress);

    if (!provider) {
      setError({
        title: "Provider Not Found",
        message: "Vault provider not found.",
      });
      return;
    }

    // Check wallet connection
    const btcWalletProvider = btcConnector?.connectedWallet?.provider;
    if (!btcWalletProvider) {
      setError({
        title: "Wallet Not Connected",
        message: "BTC wallet not connected.",
      });
      return;
    }

    // Build providers object
    const providers = {
      vaultProvider: {
        address: provider.id as Hex,
        url: provider.url,
        btcPubKey: provider.btcPubKey,
      },
      vaultKeepers: vaultKeepers.map((vk) => ({ btcPubKey: vk.btcPubKey })),
      universalChallengers: universalChallengers.map((uc) => ({
        btcPubKey: uc.btcPubKey,
      })),
    };

    // Validate inputs
    try {
      validatePayoutSignatureParams({
        peginTxId: activity.txHash!,
        depositorBtcPubkey: btcPublicKey,
        claimerTransactions: transactions,
        vaultProvider: providers.vaultProvider,
        vaultKeepers: providers.vaultKeepers,
        universalChallengers: providers.universalChallengers,
      });
    } catch (err) {
      setError(formatPayoutSignatureError(err));
      return;
    }

    // Start signing
    setSigning(true);
    setError(null);
    setProgress({ signed: 0, total: transactions.length });

    try {
      // Prepare signing context (fetches vault data, resolves pubkeys)
      const { context, vaultProviderUrl } = await prepareSigningContext({
        peginTxId: activity.txHash!,
        depositorBtcPubkey: btcPublicKey,
        providers,
      });

      // Prepare transactions for signing
      const preparedTransactions = prepareTransactionsForSigning(transactions);
      const signatures: Record<
        string,
        { payout_optimistic_signature: string; payout_signature: string }
      > = {};

      // Sign each transaction with progress tracking
      for (let i = 0; i < preparedTransactions.length; i++) {
        const tx = preparedTransactions[i];
        signatures[tx.claimerPubkeyXOnly] = await signSingleClaimerTransactions(
          btcWalletProvider,
          context,
          tx,
        );
        setProgress({ signed: i + 1, total: preparedTransactions.length });
      }

      // Submit signatures to vault provider
      await submitSignaturesToVaultProvider(
        vaultProviderUrl,
        activity.txHash!,
        btcPublicKey,
        signatures,
      );

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

      // Success - notify parent and close
      setSigning(false);
      onSuccess();
      onClose();
    } catch (err) {
      setError(formatPayoutSignatureError(err));
      setSigning(false);
    }
  }, [
    transactions,
    activity.providers,
    activity.txHash,
    activity.id,
    findProvider,
    vaultKeepers,
    universalChallengers,
    btcConnector?.connectedWallet?.provider,
    btcPublicKey,
    depositorEthAddress,
    setOptimisticStatus,
    onSuccess,
    onClose,
  ]);

  return {
    signing,
    progress,
    error,
    handleSign,
  };
}
