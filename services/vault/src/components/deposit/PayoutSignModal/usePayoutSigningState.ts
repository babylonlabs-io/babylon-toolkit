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
  signPayout,
  signPayoutOptimistic,
  submitSignaturesToVaultProvider,
  validatePayoutSignatureParams,
  type SigningStepType,
} from "../../../services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "../../../storage/peginStorage";
import type { VaultActivity } from "../../../types/activity";
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";

import type { SigningProgressProps } from "./SigningProgress";

export interface SigningError {
  title: string;
  message: string;
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
  /** Signing progress details */
  progress: SigningProgressProps;
  /** Error state if signing failed */
  error: SigningError | null;
  /** Handler to initiate signing */
  handleSign: () => Promise<void>;
}

/** Number of signing steps per claimer (PayoutOptimistic + Payout) */
const STEPS_PER_CLAIMER = 2;

export function usePayoutSigningState({
  activity,
  transactions,
  btcPublicKey,
  depositorEthAddress,
  onSuccess,
  onClose,
}: UsePayoutSigningStateProps): UsePayoutSigningStateResult {
  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState<SigningProgressProps>({
    completed: 0,
    total: 0,
    currentStep: null,
    currentClaimer: 0,
    totalClaimers: 0,
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

    const totalClaimers = transactions.length;
    const totalSteps = totalClaimers * STEPS_PER_CLAIMER;

    setProgress({
      completed: 0,
      total: totalSteps,
      currentStep: null,
      currentClaimer: 0,
      totalClaimers,
    });

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

      // Track completed steps across all claimers
      let completedSteps = 0;

      // Helper to update progress
      const updateProgress = (
        step: SigningStepType | null,
        claimerIndex: number,
      ) => {
        setProgress({
          completed: completedSteps,
          total: totalSteps,
          currentStep: step,
          currentClaimer: claimerIndex,
          totalClaimers,
        });
      };

      // Sign each claimer's transactions with detailed progress tracking
      for (let i = 0; i < preparedTransactions.length; i++) {
        const tx = preparedTransactions[i];
        const claimerIndex = i + 1; // 1-based for display

        // Sign PayoutOptimistic
        updateProgress("payout_optimistic", claimerIndex);
        const payoutOptimisticSig = await signPayoutOptimistic(
          btcWalletProvider,
          context,
          tx,
        );
        completedSteps++;

        // Sign Payout
        updateProgress("payout", claimerIndex);
        const payoutSig = await signPayout(btcWalletProvider, context, tx);
        completedSteps++;

        signatures[tx.claimerPubkeyXOnly] = {
          payout_optimistic_signature: payoutOptimisticSig,
          payout_signature: payoutSig,
        };

        updateProgress(null, claimerIndex);
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
