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

import type { DepositorGraphTransactions } from "../../../clients/vault-provider-rpc/types";
import { usePeginPolling } from "../../../context/deposit/PeginPollingContext";
import { useProtocolParamsContext } from "../../../context/ProtocolParamsContext";
import { useVaultProviders } from "../../../hooks/deposit/useVaultProviders";
import {
  getNextLocalStatus,
  LocalStorageStatus,
  PeginAction,
} from "../../../models/peginStateMachine";
import { signDepositorGraph } from "../../../services/vault/depositorGraphSigningService";
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
import { btcAddressToScriptPubKeyHex } from "../../../utils/btc";
import { formatPayoutSignatureError } from "../../../utils/errors/formatting";

import type { SigningProgressProps } from "./SigningProgress";

export interface SigningError {
  title: string;
  message: string;
}

export interface UsePayoutSigningStateProps {
  activity: VaultActivity;
  transactions: ClaimerTransactions[] | null;
  /** Depositor graph transactions (depositor-as-claimer flow) */
  depositorGraph: DepositorGraphTransactions;
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
  depositorGraph,
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
    activity.applicationEntryPoint,
  );
  const { latestUniversalChallengers, getUniversalChallengersByVersion } =
    useProtocolParamsContext();
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

    // Validate payout address exists (required for payout output validation)
    if (!activity.depositorPayoutBtcAddress) {
      setError({
        title: "Missing Payout Address",
        message:
          "Depositor payout address not available. Please wait for indexer sync and try again.",
      });
      return;
    }

    // Security: verify indexer-sourced scriptPubKey matches the connected wallet.
    // A compromised indexer could return a different depositorPayoutBtcAddress,
    // causing the validation to check against an attacker's address.
    const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;
    if (connectedBtcAddress) {
      const walletScriptPubKey =
        btcAddressToScriptPubKeyHex(connectedBtcAddress);
      if (walletScriptPubKey !== activity.depositorPayoutBtcAddress) {
        setError({
          title: "Payout Address Mismatch",
          message:
            "The payout address from the indexer does not match your connected wallet. " +
            "This may indicate a data integrity issue. Please verify your wallet connection.",
        });
        return;
      }
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
        vaultId: activity.id,
        depositorBtcPubkey: btcPublicKey,
        claimerTransactions: transactions,
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
      const { context, vaultProviderAddress } = await prepareSigningContext({
        vaultId: activity.id,
        depositorBtcPubkey: btcPublicKey,
        providers,
        getUniversalChallengersByVersion,
        registeredPayoutScriptPubKey: activity.depositorPayoutBtcAddress,
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

      // Sign depositor graph (depositor-as-claimer flow)
      // PSBTs are pre-built by the VP with all taproot metadata embedded.
      const depositorClaimerPresignatures = await signDepositorGraph({
        depositorGraph,
        depositorBtcPubkey: btcPublicKey,
        btcWallet: btcWalletProvider,
      });

      // Submit signatures to vault provider (VP RPC uses peginTxHash)
      await submitSignaturesToVaultProvider(
        vaultProviderAddress,
        activity.peginTxHash!,
        btcPublicKey,
        signatures,
        depositorClaimerPresignatures,
      );

      // Update localStorage status using state machine (storage uses vaultId)
      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
      if (nextStatus) {
        updatePendingPeginStatus(depositorEthAddress, activity.id, nextStatus);

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
    depositorGraph,
    activity.providers,
    activity.peginTxHash,
    activity.id,
    activity.depositorPayoutBtcAddress,
    findProvider,
    vaultKeepers,
    latestUniversalChallengers,
    getUniversalChallengersByVersion,
    btcConnector?.connectedWallet?.account?.address,
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
