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

import type { ClaimerSignatures } from "../../../clients/vault-provider-rpc/types";
import { usePeginPolling } from "../../../context/deposit/PeginPollingContext";
import { useProtocolParamsContext } from "../../../context/ProtocolParamsContext";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import {
  getNextLocalStatus,
  LocalStorageStatus,
  PeginAction,
} from "../../../models/peginStateMachine";
import {
  prepareSigningContext,
  prepareTransactionsForSigning,
  signAllTransactionsBatch,
  signPayout,
  signPayoutOptimistic,
  submitSignaturesToVaultProvider,
  validatePayoutSignatureParams,
  walletSupportsBatchSigning,
  type SigningStepType,
} from "../../../services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "../../../storage/peginStorage";
import type { VaultActivity } from "../../../types/activity";
import type { ClaimerTransactions } from "../../../types/rpc";
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";

import type { SigningProgressProps } from "./SigningProgress";

export interface SigningError {
  title: string;
  message: string;
}

export interface UsePayoutSigningStateProps {
  activity: VaultActivity;
  transactions: ClaimerTransactions[] | null;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onSuccess: () => void;
}

export interface UsePayoutSigningStateResult {
  /** Whether signing is in progress */
  signing: boolean;
  /** Signing progress details */
  progress: SigningProgressProps;
  /** Error state if signing failed */
  error: SigningError | null;
  /** Whether signing completed successfully */
  isComplete: boolean;
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
}: UsePayoutSigningStateProps): UsePayoutSigningStateResult {
  const [signing, setSigning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState<SigningProgressProps>({
    completed: 0,
    total: 0,
    currentStep: null,
    currentClaimer: 0,
    totalClaimers: 0,
  });
  const [error, setError] = useState<SigningError | null>(null);

  const { findProvider, vaultKeepers } = useVaultProviders(
    activity.applicationController,
  );
  const {
    latestUniversalChallengers,
    getUniversalChallengersByVersion,
    timelockPegin,
  } = useProtocolParamsContext();
  const btcConnector = useChainConnector("BTC");
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
      universalChallengers: latestUniversalChallengers.map((uc) => ({
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
      // Uses versioned keepers and challengers based on vault's locked versions
      const { context, vaultProviderUrl } = await prepareSigningContext({
        peginTxId: activity.txHash!,
        depositorBtcPubkey: btcPublicKey,
        providers,
        timelockPegin,
        getUniversalChallengersByVersion,
      });

      // Prepare transactions for signing
      const preparedTransactions = prepareTransactionsForSigning(transactions);
      let signatures: Record<string, ClaimerSignatures> = {};

      // Check if wallet supports batch signing
      const canBatchSign = walletSupportsBatchSigning(btcWalletProvider);

      if (canBatchSign) {
        // BATCH SIGNING: Sign all PSBTs with single wallet popup
        setProgress({
          completed: 0,
          total: totalSteps,
          currentStep: "payout_optimistic", // Show as signing in progress
          currentClaimer: 1,
          totalClaimers,
        });

        // Sign all at once
        signatures = await signAllTransactionsBatch(
          btcWalletProvider,
          context,
          preparedTransactions,
        );

        // Update progress to complete
        setProgress({
          completed: totalSteps,
          total: totalSteps,
          currentStep: null,
          currentClaimer: totalClaimers,
          totalClaimers,
        });
      } else {
        // SEQUENTIAL SIGNING: Sign each transaction one by one
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

      // Success - show completion state and notify parent
      setSigning(false);
      setIsComplete(true);
      onSuccess();
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
    latestUniversalChallengers,
    getUniversalChallengersByVersion,
    timelockPegin,
    btcConnector?.connectedWallet?.provider,
    btcPublicKey,
    depositorEthAddress,
    setOptimisticStatus,
    onSuccess,
  ]);

  return {
    signing,
    progress,
    error,
    isComplete,
    handleSign,
  };
}
