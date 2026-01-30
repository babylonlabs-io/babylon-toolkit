/**
 * Main deposit flow orchestration hook
 *
 * This hook orchestrates the complete deposit flow by calling pure step functions
 * and managing React state between steps.
 *
 * Flow steps:
 * 1. Sign Proof of Possession (PoP)
 * 2. Sign & Submit Ethereum Transaction
 * 3. Sign Payout Transactions (after polling for readiness)
 * 4. Sign & Broadcast BTC Transaction
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useUTXOs } from "@/hooks/useUTXOs";
import { useVaults } from "@/hooks/useVaults";
import { collectReservedUtxoRefs } from "@/services/vault";
import {
  signPayout,
  signPayoutOptimistic,
  type PayoutSigningProgress,
  type SigningStepType,
} from "@/services/vault/vaultPayoutSignatureService";
import { getPendingPegins } from "@/storage/peginStorage";

import {
  broadcastBtcTransaction,
  DepositStep,
  getEthWalletClient,
  pollAndPreparePayoutSigning,
  savePendingPegin,
  submitPayoutSignatures,
  submitPeginAndWait,
  validateDepositInputs,
  waitForContractVerification,
  type DepositFlowResult,
} from "./depositFlowSteps";
import { useVaultProviders } from "./useVaultProviders";

export interface UseDepositFlowParams {
  amount: bigint;
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
}

export interface UseDepositFlowReturn {
  /** Execute the deposit flow. Returns result on success, null on error. */
  executeDepositFlow: () => Promise<DepositFlowResult | null>;
  currentStep: DepositStep;
  processing: boolean;
  error: string | null;
  isWaiting: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
}

export function useDepositFlow(
  params: UseDepositFlowParams,
): UseDepositFlowReturn {
  const {
    amount,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  // State
  const [currentStep, setCurrentStep] = useState<DepositStep>(
    DepositStep.SIGN_POP,
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [payoutSigningProgress, setPayoutSigningProgress] =
    useState<PayoutSigningProgress | null>(null);

  // Hooks
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;
  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);
  const { data: vaults } = useVaults(depositorEthAddress);
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);
  const { minDeposit, latestUniversalChallengers } = useProtocolParamsContext();

  const getSelectedVaultProvider = useCallback(() => {
    if (!selectedProviders || selectedProviders.length === 0) {
      throw new Error("No vault provider selected");
    }
    const provider = findProvider(selectedProviders[0] as Hex);
    if (!provider) {
      throw new Error("Vault provider not found");
    }
    return provider;
  }, [findProvider, selectedProviders]);

  const executeDepositFlow =
    useCallback(async (): Promise<DepositFlowResult | null> => {
      try {
        setProcessing(true);
        setError(null);

        // Step 0: Validate inputs
        validateDepositInputs({
          btcAddress,
          depositorEthAddress,
          amount,
          selectedProviders,
          confirmedUTXOs,
          isUTXOsLoading,
          utxoError,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          minDeposit,
        });

        // Step 1: Get ETH wallet client
        setCurrentStep(DepositStep.SIGN_POP);
        const walletClient = await getEthWalletClient(depositorEthAddress!);

        // Compute reserved UTXOs from cached vaults + localStorage
        const pendingPegins = getPendingPegins(depositorEthAddress!);
        const reservedUtxoRefs = collectReservedUtxoRefs({
          vaults: vaults ?? [],
          pendingPegins,
        });

        // Step 1-2: Submit pegin request and wait for ETH confirmation
        const peginResult = await submitPeginAndWait({
          btcWalletProvider,
          walletClient,
          amount,
          feeRate,
          btcAddress: btcAddress!,
          selectedProviders,
          vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          confirmedUTXOs: confirmedUTXOs!,
          reservedUtxoRefs,
          onPopSigned: () => setCurrentStep(DepositStep.SUBMIT_PEGIN),
        });

        // Save to localStorage
        savePendingPegin({
          depositorEthAddress: depositorEthAddress!,
          btcTxid: peginResult.btcTxid,
          ethTxHash: peginResult.ethTxHash,
          amount,
          selectedProviders,
          applicationController: selectedApplication,
          unsignedTxHex: peginResult.btcTxHex,
          selectedUTXOs: peginResult.selectedUTXOs,
        });

        // Step 3: Poll and sign payout transactions
        setCurrentStep(DepositStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        const provider = getSelectedVaultProvider();
        if (!provider.url) {
          throw new Error("Vault provider has no RPC URL");
        }

        const { context, vaultProviderUrl, preparedTransactions } =
          await pollAndPreparePayoutSigning({
            btcTxid: peginResult.btcTxid,
            btcTxHex: peginResult.btcTxHex,
            depositorBtcPubkey: peginResult.depositorBtcPubkey,
            providerUrl: provider.url,
            providerBtcPubKey: provider.btcPubKey,
            vaultKeepers: vaultKeepers.map((vk) => ({
              btcPubKey: vk.btcPubKey,
            })),
            universalChallengers: latestUniversalChallengers.map((uc) => ({
              btcPubKey: uc.btcPubKey,
            })),
          });

        setIsWaiting(false);

        // Sign with progress tracking (loop stays in hook for state updates)
        const signatures = await signPayoutTransactionsWithProgress(
          btcWalletProvider,
          context,
          preparedTransactions,
          setPayoutSigningProgress,
        );

        // Submit signatures
        await submitPayoutSignatures(
          vaultProviderUrl,
          peginResult.btcTxid,
          peginResult.depositorBtcPubkey,
          signatures,
          depositorEthAddress!,
        );
        setPayoutSigningProgress(null);

        // Step 4a: Wait for verification
        setCurrentStep(DepositStep.BROADCAST_BTC);
        setIsWaiting(true);
        await waitForContractVerification({ btcTxid: peginResult.btcTxid });
        setIsWaiting(false);

        // Step 4b: Broadcast BTC transaction
        await broadcastBtcTransaction(
          {
            btcTxid: peginResult.btcTxid,
            depositorBtcPubkey: peginResult.depositorBtcPubkey,
            btcWalletProvider,
          },
          depositorEthAddress!,
        );

        // Complete
        setCurrentStep(DepositStep.COMPLETED);

        return {
          btcTxid: peginResult.btcTxid,
          ethTxHash: peginResult.ethTxHash,
          depositorBtcPubkey: peginResult.depositorBtcPubkey,
          transactionData: {
            unsignedTxHex: peginResult.btcTxHex,
            selectedUTXOs: peginResult.selectedUTXOs,
            fee: peginResult.fee,
          },
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Deposit flow error:", err);
        // Keep currentStep where error occurred - UI can show error at that step
        return null;
      } finally {
        setProcessing(false);
        setIsWaiting(false);
      }
    }, [
      amount,
      feeRate,
      btcWalletProvider,
      depositorEthAddress,
      selectedApplication,
      selectedProviders,
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
      btcAddress,
      confirmedUTXOs,
      isUTXOsLoading,
      utxoError,
      vaults,
      getSelectedVaultProvider,
      vaultKeepers,
      latestUniversalChallengers,
      minDeposit,
    ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
  };
}

/**
 * Sign payout transactions with progress tracking.
 * This function stays in the hook file since it needs to update React state.
 */
async function signPayoutTransactionsWithProgress(
  btcWalletProvider: BitcoinWallet,
  context: Parameters<typeof signPayoutOptimistic>[1],
  preparedTransactions: Parameters<typeof signPayoutOptimistic>[2][],
  setProgress: (progress: PayoutSigningProgress | null) => void,
): Promise<
  Record<
    string,
    { payout_optimistic_signature: string; payout_signature: string }
  >
> {
  const totalClaimers = preparedTransactions.length;
  const totalSteps = totalClaimers * 2;
  let completedSteps = 0;

  const signatures: Record<
    string,
    { payout_optimistic_signature: string; payout_signature: string }
  > = {};

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

  for (let i = 0; i < preparedTransactions.length; i++) {
    const tx = preparedTransactions[i];
    const claimerIndex = i + 1;

    updateProgress("payout_optimistic", claimerIndex);
    const payoutOptimisticSig = await signPayoutOptimistic(
      btcWalletProvider,
      context,
      tx,
    );
    completedSteps++;

    updateProgress("payout", claimerIndex);
    const payoutSig = await signPayout(btcWalletProvider, context, tx);
    completedSteps++;

    signatures[tx.claimerPubkeyXOnly] = {
      payout_optimistic_signature: payoutOptimisticSig,
      payout_signature: payoutSig,
    };

    updateProgress(null, claimerIndex);
  }

  return signatures;
}
