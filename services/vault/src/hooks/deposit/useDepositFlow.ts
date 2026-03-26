/**
 * Main deposit flow orchestration hook
 *
 * This hook orchestrates the complete deposit flow by calling pure step functions
 * and managing React state between steps.
 *
 * Flow steps:
 * 1. Build & fund Pre-PegIn + PegIn transactions (preparePegin)
 * 2. Derive Lamport keypair + compute keccak256 hash
 * 3. Sign PoP + submit ETH transaction with Lamport PK hash (registerPeginAndWait)
 * 4. Sign & broadcast Pre-PegIn transaction to Bitcoin
 * 5. Submit Lamport PK to VP, poll for readiness, sign payout transactions
 * 6. Download vault artifacts
 * 7. Wait for contract verification, then activate vault (reveal HTLC secret on Ethereum)
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useVaults } from "@/hooks/useVaults";
import { logger } from "@/infrastructure";
import { deriveLamportPkHash, linkPeginToMnemonic } from "@/services/lamport";
import { collectReservedUtxoRefs } from "@/services/vault";
import { signDepositorGraph } from "@/services/vault/depositorGraphSigningService";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";
import {
  signPayoutTransactions,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { getPendingPegins } from "@/storage/peginStorage";
import { hashSecret } from "@/utils/secretUtils";

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
  /** Mempool fee rate in sat/vB for UTXO selection and funding */
  mempoolFeeRate: number;
  btcWalletProvider: BitcoinWallet | null;
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
  /** Raw HTLC secret hex (no 0x prefix) — generated in the secret modal step.
   *  This secret is used as the HTLC preimage and its SHA-256 hash becomes
   *  the on-chain hashlock. Must match what was shown to the user so the
   *  resume flow can recover the vault. */
  htlcSecretHex: string;
  /** SHA-256 hash of the depositor's secret for the new peg-in flow */
  depositorSecretHash?: Hex;
}

export interface ArtifactDownloadInfo {
  providerAddress: string;
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
    mempoolFeeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    getMnemonic,
    mnemonicId,
    htlcSecretHex: providedHtlcSecretHex,
    depositorSecretHash,
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
    timelockRefund,
    latestUniversalChallengers,
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

        if (!btcAddress || !depositorEthAddress || !btcWalletProvider) {
          throw new Error("BTC or ETH wallet not connected");
        }
        const confirmedBtcWallet = btcWalletProvider;

        // Step 1: Get ETH wallet client
        setCurrentStep(DepositFlowStep.SIGN_POP);
        const walletClient = await getEthWalletClient(depositorEthAddress);

        // Compute reserved UTXOs from cached vaults + localStorage
        const pendingPegins = getPendingPegins(depositorEthAddress);
        const reservedUtxoRefs = collectReservedUtxoRefs({
          vaults: vaults ?? [],
          pendingPegins,
        });

        // Step 2a: Build Pre-PegIn HTLC, fund it, and sign PegIn input
        // Use the secret shown to the user in the secret modal — the on-chain
        // hashlock must match so the user can activate via the resume flow.
        const htlcSecretHex = providedHtlcSecretHex;
        const hashH = hashSecret(htlcSecretHex).slice(2); // strip 0x prefix

        const prepared = await preparePegin({
          btcWalletProvider: confirmedBtcWallet,
          walletClient,
          amount,
          protocolFeeRate: config.offchainParams.feeRate,
          mempoolFeeRate,
          btcAddress,
          selectedProviders,
          vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          timelockPegin,
          timelockRefund,
          hashH,
          councilQuorum: config.offchainParams.councilQuorum,
          councilSize: config.offchainParams.securityCouncilKeys.length,
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
        // Pass both pre-pegin (for DA) and pegin tx (for vault ID computation)
        const registration = await registerPeginAndWait({
          btcWalletProvider: confirmedBtcWallet,
          walletClient,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          peginTxHex: prepared.peginTxHex,
          fundedPrePeginTxHex: prepared.fundedPrePeginTxHex,
          hashlock: ensureHexPrefix(hashH),
          vaultProviderAddress: selectedProviders[0],
          onPopSigned: () => setCurrentStep(DepositFlowStep.SUBMIT_PEGIN),
          depositorPayoutBtcAddress: btcAddress,
          depositorLamportPkHash: lamportPkHash,
          depositorSecretHash,
        });

        // Save to localStorage — store the pre-pegin tx hex for broadcasting later
        savePendingPegin({
          depositorEthAddress,
          btcTxid: registration.btcTxid,
          amount,
          selectedProviders,
          applicationController: selectedApplication,
          unsignedTxHex: prepared.fundedPrePeginTxHex,
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

        const provider = findProvider(selectedProviders[0] as Hex);
        if (!provider) {
          throw new Error("Vault provider not found");
        }

        // ================================================================
        // Step 3: Broadcast Pre-PegIn to Bitcoin
        // Per spec, broadcast happens right after ETH submission so the VP
        // can monitor the Pre-PegIn on-chain before BaBe setup.
        // ================================================================

        setCurrentStep(DepositFlowStep.BROADCAST_PRE_PEGIN);

        await broadcastBtcTransaction(
          {
            btcTxid: registration.btcTxid,
            depositorBtcPubkey: prepared.depositorBtcPubkey,
            btcWalletProvider: confirmedBtcWallet,
            fundedPrePeginTxHex: prepared.fundedPrePeginTxHex,
          },
          depositorEthAddress,
        );

        // ================================================================
        // Step 4: Submit Lamport PK to vault provider via RPC
        // ================================================================

        setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        try {
          await submitLamportPublicKey({
            btcTxid: registration.btcTxid,
            depositorBtcPubkey: prepared.depositorBtcPubkey,
            appContractAddress: selectedApplication,
            providerAddress: provider.id,
            getMnemonic,
            signal,
          });
        } catch (err) {
          // Re-throw abort errors so they're suppressed by the outer catch
          if (signal.aborted) throw err;
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: {
              context: "Lamport key submission failed (deposit is recoverable)",
            },
          });
        }

        // ================================================================
        // Step 4 (cont): Poll and sign payout transactions
        // VP waits for Pre-PegIn BTC confirmation before being ready.
        // ================================================================

        const {
          context,
          vaultProviderAddress,
          preparedTransactions,
          depositorGraph,
        } = await pollAndPreparePayoutSigning({
          btcTxid: registration.btcTxid,
          btcTxHex: prepared.peginTxHex,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          providerAddress: provider.id,
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
          confirmedBtcWallet,
          context,
          preparedTransactions,
          setPayoutSigningProgress,
        );

        // Sign depositor graph (depositor-as-claimer flow)
        // PSBTs are pre-built by the VP with all taproot metadata embedded.
        const depositorClaimerPresignatures = await signDepositorGraph({
          depositorGraph,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          btcWallet: confirmedBtcWallet,
        });

        await submitPayoutSignatures(
          vaultProviderAddress,
          registration.btcTxid,
          prepared.depositorBtcPubkey,
          signatures,
          depositorEthAddress,
          depositorClaimerPresignatures,
        );
        setPayoutSigningProgress(null);

        // ================================================================
        // Step 5: Download vault artifacts
        // ================================================================

        setCurrentStep(DepositFlowStep.ARTIFACT_DOWNLOAD);
        setArtifactDownloadInfo({
          providerAddress: provider.id,
          peginTxid: registration.btcTxid,
          depositorPk: prepared.depositorBtcPubkey,
        });
        await new Promise<void>((resolve) => {
          artifactResolverRef.current = resolve;
        });

        // ================================================================
        // Step 6: Activate vault — wait for contract VERIFIED, then
        // reveal HTLC secret on Ethereum
        // ================================================================

        setCurrentStep(DepositFlowStep.ACTIVATE_VAULT);
        setIsWaiting(true);
        await waitForContractVerification({
          btcTxid: registration.btcTxid,
          signal,
        });
        setIsWaiting(false);

        await activateVaultWithSecret({
          vaultId: ensureHexPrefix(registration.btcTxid),
          secret: ensureHexPrefix(htlcSecretHex),
          walletClient,
        });

        // Complete
        setCurrentStep(DepositFlowStep.COMPLETED);

        return {
          btcTxid: registration.btcTxid,
          ethTxHash: registration.ethTxHash,
          depositorBtcPubkey: prepared.depositorBtcPubkey,
          htlcSecretHex,
          transactionData: {
            unsignedTxHex: prepared.fundedPrePeginTxHex,
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
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: { context: "Deposit flow error" },
          });
        }
        return null;
      } finally {
        setProcessing(false);
        setIsWaiting(false);
        abortControllerRef.current = null;
      }
    }, [
      amount,
      mempoolFeeRate,
      btcWalletProvider,
      depositorEthAddress,
      selectedApplication,
      selectedProviders,
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
      timelockPegin,
      timelockRefund,
      config,
      btcAddress,
      spendableUTXOs,
      isUTXOsLoading,
      utxoError,
      vaults,
      findProvider,
      vaultKeepers,
      latestUniversalChallengers,
      minDeposit,
      maxDeposit,
      getMnemonic,
      mnemonicId,
      providedHtlcSecretHex,
      depositorSecretHash,
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
