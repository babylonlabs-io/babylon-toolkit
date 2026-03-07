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

import { computeMinClaimValue } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useVaults } from "@/hooks/useVaults";
import { deriveLamportPkHash, linkPeginToMnemonic } from "@/services/lamport";
import { collectReservedUtxoRefs } from "@/services/vault";
import { prepareAndSignDepositorGraph } from "@/services/vault/depositorGraphSigningService";
import {
  signPayoutTransactions,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { getPendingPegins } from "@/storage/peginStorage";

import {
  broadcastBtcTransaction,
  DepositFlowStep,
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
import { useBtcWalletState } from "./useBtcWalletState";
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
  /** Callback to retrieve the decrypted mnemonic for Lamport PK derivation
   *  and submission to the vault provider. */
  getMnemonic: () => Promise<string>;
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
  currentStep: DepositFlowStep;
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
  const [currentStep, setCurrentStep] = useState<DepositFlowStep>(
    DepositFlowStep.SIGN_POP,
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

  // Abort on real unmount (route change, browser back) but survive StrictMode
  // double-mount. StrictMode re-runs the effect synchronously in the same task,
  // so the microtask fires after remount has set mountedRef back to true.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current) {
          abort();
        }
      });
    };
  }, [abort]);

  // Hooks
  const { btcAddress, spendableUTXOs, isUTXOsLoading, utxoError } =
    useBtcWalletState();
  const { data: vaults } = useVaults(depositorEthAddress);
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);
  const {
    config,
    minDeposit,
    maxDeposit,
    timelockPegin,
    latestUniversalChallengers,
    getOffchainParamsByVersion,
  } = useProtocolParamsContext();

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

        // After validation, these are guaranteed to be defined
        if (!btcAddress || !depositorEthAddress) {
          throw new Error("BTC or ETH wallet not connected");
        }

        // Step 1: Get ETH wallet client
        setCurrentStep(DepositFlowStep.SIGN_POP);
        const walletClient = await getEthWalletClient(depositorEthAddress);

        // Compute reserved UTXOs from cached vaults + localStorage
        const pendingPegins = getPendingPegins(depositorEthAddress);
        const reservedUtxoRefs = collectReservedUtxoRefs({
          vaults: vaults ?? [],
          pendingPegins,
        });

        // Compute depositorClaimValue with actual VK count. The context value
        // uses 0 local challengers (floor for UI estimation); the VP validates
        // with vault_keepers.len(), so we must match that here.
        const depositorClaimValue = await computeMinClaimValue(
          vaultKeeperBtcPubkeys.length,
          universalChallengerBtcPubkeys.length,
          config.offchainParams.babeInstancesToFinalize,
          config.offchainParams.councilQuorum,
          config.offchainParams.securityCouncilKeys.length,
          config.offchainParams.feeRate,
        );

        // Step 2a: Build and fund the BTC transaction (no on-chain submission yet)
        const prepared = await preparePegin({
          btcWalletProvider,
          walletClient,
          amount,
          feeRate,
          btcAddress,
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
        const mnemonic = await getMnemonic();

        const lamportPkHash = await deriveLamportPkHash(
          mnemonic,
          prepared.btcTxid,
          prepared.depositorBtcPubkey,
          selectedApplication,
        );

        // Step 2b: Register pegin on-chain (PoP + ETH tx)
        const registration = await registerPeginAndWait({
          btcWalletProvider,
          walletClient,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          fundedTxHex: prepared.btcTxHex,
          vaultProviderAddress: selectedProviders[0],
          onPopSigned: () => setCurrentStep(DepositFlowStep.SUBMIT_PEGIN),
          depositorPayoutBtcAddress: btcAddress,
          depositorLamportPkHash: lamportPkHash,
        });

        // Save to localStorage
        savePendingPegin({
          depositorEthAddress,
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
            registration.btcTxid,
            mnemonicId,
            depositorEthAddress,
          );
        }

        // Move to next step after persisting pegin + mnemonic link,
        // so a page refresh won't lose the association.
        setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        const provider = findProvider(selectedProviders[0] as Hex);
        if (!provider?.url) {
          throw new Error("Vault provider not found or has no RPC URL");
        }

        // Step 2.5: Submit full Lamport PK to vault provider via RPC
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
        }

        // Step 3: Poll and sign payout transactions
        // (step already set above, isWaiting already true)

        const {
          context,
          vaultProviderUrl,
          preparedTransactions,
          depositorGraph,
        } = await pollAndPreparePayoutSigning({
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

        const signatures = await signPayoutTransactions(
          btcWalletProvider,
          context,
          preparedTransactions,
          setPayoutSigningProgress,
        );

        // Sign depositor graph (depositor-as-claimer flow)
        // Use version-resolved values from context so that the UC/keeper
        // set matches the vault's locked versions.
        const depositorClaimerPresignatures =
          await prepareAndSignDepositorGraph({
            depositorGraph,
            depositorBtcPubkey: prepared.depositorBtcPubkey,
            btcWallet: btcWalletProvider,
            vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
            vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
            universalChallengerBtcPubkeys:
              context.universalChallengerBtcPubkeys,
            timelockPegin,
            getOffchainParamsByVersion,
          });

        await submitPayoutSignatures(
          vaultProviderUrl,
          registration.btcTxid,
          prepared.depositorBtcPubkey,
          signatures,
          depositorEthAddress,
          depositorClaimerPresignatures,
        );
        setPayoutSigningProgress(null);

        setCurrentStep(DepositFlowStep.ARTIFACT_DOWNLOAD);
        setArtifactDownloadInfo({
          providerUrl: provider.url,
          peginTxid: registration.btcTxid,
          depositorPk: prepared.depositorBtcPubkey,
        });
        await new Promise<void>((resolve) => {
          artifactResolverRef.current = resolve;
        });

        setCurrentStep(DepositFlowStep.BROADCAST_BTC);
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
          depositorEthAddress,
        );

        // Complete
        setCurrentStep(DepositFlowStep.COMPLETED);

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
      config,
      btcAddress,
      spendableUTXOs,
      isUTXOsLoading,
      utxoError,
      vaults,
      findProvider,
      vaultKeepers,
      latestUniversalChallengers,
      getOffchainParamsByVersion,
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
