/**
 * Main deposit flow orchestration hook
 *
 * This hook orchestrates the complete deposit flow by calling pure step functions
 * and managing React state between steps.
 *
 * Flow steps:
 * 1. Build & fund BTC transaction (preparePegin)
 * 2. Derive Lamport keypair + compute keccak256 hash (if depositor-as-claimer)
 * 3. Sign PoP + submit ETH transaction with Lamport PK hash (registerPeginAndWait)
 * 4. Submit full Lamport PK to vault provider via RPC (if depositor-as-claimer)
 * 5. Sign Payout Transactions (after polling for readiness)
 * 6. Download vault artifacts (if depositor-as-claimer)
 * 7. Sign & Broadcast BTC Transaction
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import type { ClaimerSignatures } from "@/clients/vault-provider-rpc/types";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useUTXOs } from "@/hooks/useUTXOs";
import { useVaults } from "@/hooks/useVaults";
import { deriveLamportPkHash, linkPeginToMnemonic } from "@/services/lamport";
import { collectReservedUtxoRefs } from "@/services/vault";
import {
  signPayoutTransactions,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { getPendingPegins } from "@/storage/peginStorage";
import { stripHexPrefix } from "@/utils/btc";

import {
  broadcastBtcTransaction,
  DepositStep,
  getEthWalletClient,
  pollAndPreparePayoutSigning,
  preparePegin,
  registerPeginAndWait,
  savePendingPegin,
  submitLamportPublicKey,
  submitPayoutSignatures,
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
  /** Callback to retrieve the decrypted mnemonic. When present, enables
   *  Lamport PK derivation and submission to the vault provider. */
  getMnemonic?: () => Promise<string>;
  /** UUID of the stored mnemonic, used to record the peg-in → mnemonic
   *  mapping so the resume flow can look up the correct mnemonic. */
  mnemonicId?: string;
}

export interface ArtifactDownloadInfo {
  providerUrl: string;
  peginTxid: string;
  depositorPk: string;
}

export interface UseDepositFlowReturn {
  executeDepositFlow: () => Promise<DepositFlowResult | null>;
  abort: () => void;
  currentStep: DepositStep;
  processing: boolean;
  error: string | null;
  isWaiting: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  artifactDownloadInfo: ArtifactDownloadInfo | null;
  continueAfterArtifactDownload: () => void;
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
    getMnemonic,
    mnemonicId,
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
  const [artifactDownloadInfo, setArtifactDownloadInfo] =
    useState<ArtifactDownloadInfo | null>(null);

  const artifactResolverRef = useRef<(() => void) | null>(null);

  const continueAfterArtifactDownload = useCallback(() => {
    setArtifactDownloadInfo(null);
    artifactResolverRef.current?.();
    artifactResolverRef.current = null;
  }, []);

  // Abort controller for cancelling the flow
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    artifactResolverRef.current?.();
    artifactResolverRef.current = null;
  }, []);

  // Abort any running flow on unmount so async work doesn't leak
  useEffect(() => {
    return () => abort();
  }, [abort]);

  // Hooks
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;
  const {
    spendableUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);
  const { data: vaults } = useVaults(depositorEthAddress);
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);
  const {
    minDeposit,
    maxDeposit,
    timelockPegin,
    depositorClaimValue,
    latestUniversalChallengers,
  } = useProtocolParamsContext();

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
      // Create a new AbortController for this flow execution
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        setProcessing(true);
        setError(null);

        // Step 0: Validate inputs
        validateDepositInputs({
          btcAddress,
          depositorEthAddress,
          amount,
          selectedProviders,
          confirmedUTXOs: spendableUTXOs,
          isUTXOsLoading,
          utxoError,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          minDeposit,
          maxDeposit,
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

        // Step 2a: Build and fund the BTC transaction (no on-chain submission yet)
        const prepared = await preparePegin({
          btcWalletProvider,
          walletClient,
          amount,
          feeRate,
          btcAddress: btcAddress!,
          selectedProviders,
          vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          timelockPegin,
          depositorClaimValue,
          confirmedUTXOs: spendableUTXOs!,
          reservedUtxoRefs,
        });

        // Step 2a.5: Derive Lamport keypair and compute PK hash (before ETH tx)
        if (!getMnemonic) {
          throw new Error(
            "Lamport mnemonic is required for deposit. Please complete the mnemonic step first.",
          );
        }
        const mnemonic = await getMnemonic();

        // DEBUG: Log derivation inputs for the initial deposit flow
        console.log("[Lamport DEBUG] === deriveLamportPkHash (initial deposit) ===");
        console.log("[Lamport DEBUG] Inputs:", {
          peginTxid: stripHexPrefix(prepared.btcTxid),
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          appContractAddress: selectedApplication,
        });

        const lamportPkHash = await deriveLamportPkHash(
          mnemonic,
          stripHexPrefix(prepared.btcTxid),
          prepared.depositorBtcPubkey,
          selectedApplication,
        );
        console.log("[Lamport DEBUG] Committed lamportPkHash:", lamportPkHash);

        // Step 2b: Register pegin on-chain (PoP + ETH tx)
        const registration = await registerPeginAndWait({
          btcWalletProvider,
          walletClient,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          fundedTxHex: prepared.btcTxHex,
          vaultProviderAddress: selectedProviders[0],
          onPopSigned: () => setCurrentStep(DepositStep.SUBMIT_PEGIN),
          depositorLamportPkHash: lamportPkHash,
        });

        // Save to localStorage
        savePendingPegin({
          depositorEthAddress: depositorEthAddress!,
          btcTxid: registration.btcTxid,
          ethTxHash: registration.ethTxHash,
          amount,
          selectedProviders,
          applicationController: selectedApplication,
          unsignedTxHex: prepared.btcTxHex,
          selectedUTXOs: prepared.selectedUTXOs,
        });

        if (mnemonicId && depositorEthAddress) {
          linkPeginToMnemonic(
            stripHexPrefix(registration.btcTxid),
            mnemonicId,
            depositorEthAddress,
          );
        }

        const provider = getSelectedVaultProvider();
        if (!provider.url) {
          throw new Error("Vault provider has no RPC URL");
        }

        // Step 2.5: Submit full Lamport PK to vault provider via RPC
        setIsWaiting(true);
        try {
          await submitLamportPublicKey({
            btcTxid: registration.btcTxid,
            depositorBtcPubkey: prepared.depositorBtcPubkey,
            appContractAddress: selectedApplication,
            providerUrl: provider.url,
            getMnemonic,
            signal,
          });
        } catch (err) {
          // Re-throw abort errors so they're suppressed by the outer catch
          if (signal.aborted) throw err;
          // ETH tx already succeeded — deposit is recoverable via resume flow
          console.error(
            "Lamport key submission failed (deposit is recoverable):",
            err,
          );
        } finally {
          setIsWaiting(false);
        }

        // Step 3: Poll and sign payout transactions
        setCurrentStep(DepositStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        const { context, vaultProviderUrl, preparedTransactions } =
          await pollAndPreparePayoutSigning({
          btcTxid: registration.btcTxid,
          btcTxHex: prepared.btcTxHex,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          providerUrl: provider.url,
          providerBtcPubKey: provider.btcPubKey,
          vaultKeepers: vaultKeepers.map((vk) => ({
            btcPubKey: vk.btcPubKey,
          })),
          universalChallengers: latestUniversalChallengers.map((uc) => ({
            btcPubKey: uc.btcPubKey,
          })),
          timelockPegin,
          signal,
        });

        setIsWaiting(false);

        const signatures = await signPayoutTransactionsWithProgress(
          btcWalletProvider,
          context,
          preparedTransactions,
          setPayoutSigningProgress,
        );

        await submitPayoutSignatures(
          vaultProviderUrl,
          registration.btcTxid,
          prepared.depositorBtcPubkey,
          signatures,
          depositorEthAddress!,
        );
        setPayoutSigningProgress(null);

        setCurrentStep(DepositStep.ARTIFACT_DOWNLOAD);
        setArtifactDownloadInfo({
          providerUrl: provider.url,
          peginTxid: registration.btcTxid,
          depositorPk: prepared.depositorBtcPubkey,
        });
        await new Promise<void>((resolve) => {
          artifactResolverRef.current = resolve;
        });

        setCurrentStep(DepositStep.BROADCAST_BTC);
        setIsWaiting(true);
        await waitForContractVerification({
          btcTxid: registration.btcTxid,
          signal,
        });
        setIsWaiting(false);

        await broadcastBtcTransaction(
          {
            btcTxid: registration.btcTxid,
            depositorBtcPubkey: prepared.depositorBtcPubkey,
            btcWalletProvider,
          },
          depositorEthAddress!,
        );

        // Complete
        setCurrentStep(DepositStep.COMPLETED);

        return {
          btcTxid: registration.btcTxid,
          ethTxHash: registration.ethTxHash,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          transactionData: {
            unsignedTxHex: prepared.btcTxHex,
            selectedUTXOs: prepared.selectedUTXOs,
            fee: prepared.fee,
          },
        };
      } catch (err) {
        // Don't show error if flow was aborted (user intentionally closed modal)
        if (!signal.aborted) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Deposit flow error:", err);
        }
        return null;
      } finally {
        setProcessing(false);
        setIsWaiting(false);
        abortControllerRef.current = null;
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
      timelockPegin,
      depositorClaimValue,
      btcAddress,
      spendableUTXOs,
      isUTXOsLoading,
      utxoError,
      vaults,
      getSelectedVaultProvider,
      vaultKeepers,
      latestUniversalChallengers,
      minDeposit,
      maxDeposit,
      getMnemonic,
      mnemonicId,
    ]);

  return {
    executeDepositFlow,
    abort,
    currentStep,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  };
}

/**
 * Sign payout transactions with progress tracking.
 * This function stays in the hook file since it needs to update React state.
 */
async function signPayoutTransactionsWithProgress(
  btcWalletProvider: BitcoinWallet,
  context: Parameters<typeof signPayoutTransactions>[1],
  preparedTransactions: Parameters<typeof signPayoutTransactions>[2],
  setProgress: (progress: PayoutSigningProgress | null) => void,
): Promise<Record<string, ClaimerSignatures>> {
  return signPayoutTransactions(
    btcWalletProvider,
    context,
    preparedTransactions,
    setProgress,
  );
}

