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
  signPayoutTransactions,
  submitSignaturesToVaultProvider,
  validatePayoutSignatureParams,
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

    setProgress({
      completed: 0,
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

      // Sign all payout transactions (auto-detects batch vs sequential)
      const signatures = await signPayoutTransactions(
        btcWalletProvider,
        context,
        preparedTransactions,
        setProgress,
      );

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
