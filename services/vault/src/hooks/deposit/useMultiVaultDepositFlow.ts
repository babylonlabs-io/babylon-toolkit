/**
 * Multi-Vault Deposit Flow Hook
 *
 * Orchestrates the batch-first deposit flow. A single vault is just a batch of 1.
 * Creates ONE Pre-PegIn BTC transaction with N HTLC outputs (one per vault),
 * registers each vault individually on Ethereum, then broadcasts the shared tx.
 *
 * Flow:
 * 0. Validation — check wallets, UTXOs, pubkeys, array alignment
 * 1. Get shared resources (ETH wallet client, mnemonic)
 * 2. Batch Pre-PegIn creation (one BTC tx with N HTLC outputs)
 * 3. Per-vault ETH registration (with PoP reuse)
 * 4. Broadcast Pre-PegIn transaction to Bitcoin + save to localStorage (CONFIRMING)
 * 5. Submit WOTS keys, poll VP, sign payout transactions
 * 6. Download vault artifacts (per vault, user-driven)
 * 7. Wait for contract verification, then activate vaults (reveal HTLC secret)
 *
 * ETH registration is all-or-nothing: if any vault fails, the Pre-PegIn is NOT
 * broadcast, so no BTC gets locked in unregistered HTLC outputs. Successfully
 * The on-chain registrations will expire after pegInAckTimeout. A future contract
 * update will batch all vault registrations into a single ETH call.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import { signDepositorGraph } from "@/services/vault/depositorGraphSigningService";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";
import {
  signPayoutTransactions,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { broadcastPrePeginTransaction } from "@/services/vault/vaultPeginBroadcastService";
import { preparePeginTransaction } from "@/services/vault/vaultTransactionService";
import { deriveWotsPkHash, linkPeginToMnemonic } from "@/services/wots";
import { addPendingPegin } from "@/storage/peginStorage";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { sanitizeErrorMessage } from "@/utils/errors/formatting";
import { formatBtcValue } from "@/utils/formatting";
import { hashSecret } from "@/utils/secretUtils";

import {
  DepositFlowStep,
  getEthWalletClient,
  pollAndPreparePayoutSigning,
  registerPeginAndWait,
  submitPayoutSignatures,
  submitWotsPublicKey,
  waitForContractVerification,
  type DepositUtxo,
} from "./depositFlowSteps";
import { useBtcWalletState } from "./useBtcWalletState";
import { useVaultProviders } from "./useVaultProviders";

// ============================================================================
// Types
// ============================================================================

export interface UseMultiVaultDepositFlowParams {
  /** Vault amounts in satoshis - [amount1] for single vault, [amount1, amount2] for two vaults */
  vaultAmounts: bigint[];
  /** Mempool fee rate in sat/vB for UTXO selection and funding */
  mempoolFeeRate: number;
  /** Bitcoin wallet provider */
  btcWalletProvider: BitcoinWallet | null;
  /** Depositor's Ethereum address */
  depositorEthAddress: Address | undefined;
  /** Selected application controller address */
  selectedApplication: string;
  /** Selected vault provider addresses */
  selectedProviders: string[];
  /** Vault provider BTC public key (x-only, 64 hex chars) */
  vaultProviderBtcPubkey: string;
  /** Vault keeper BTC public keys */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challenger BTC public keys */
  universalChallengerBtcPubkeys: string[];
  /** Callback to retrieve the decrypted mnemonic for WOTS PK derivation
   *  and submission to the vault provider. */
  getMnemonic: () => Promise<string>;
  /** UUID of the stored mnemonic, used to record the peg-in → mnemonic
   *  mapping so the resume flow can look up the correct mnemonic. */
  mnemonicId?: string;
  /** Per-vault raw HTLC secret hexes (no 0x prefix) — generated in the secret
   *  modal step. These are used as the HTLC preimages so the on-chain
   *  hashlocks match what was shown to the user. */
  htlcSecretHexes: string[];
  /** Per-vault SHA-256 secret hashes for the new peg-in flow (one per vault) */
  depositorSecretHashes: Hex[];
}

export interface ArtifactDownloadInfo {
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
}

export interface UseMultiVaultDepositFlowReturn {
  /** Execute the multi-vault deposit flow */
  executeMultiVaultDeposit: () => Promise<MultiVaultDepositResult | null>;
  /** Cancel the running flow (e.g. when the user closes the modal) */
  abort: () => void;
  /** Current step in the deposit flow */
  currentStep: DepositFlowStep;
  /** Current vault being processed (0 or 1), null if not processing a vault */
  currentVaultIndex: number | null;
  /** Whether the flow is currently processing */
  processing: boolean;
  /** Error message if any step failed */
  error: string | null;
  /** Whether currently waiting for external action (e.g., wallet signature) */
  isWaiting: boolean;
  /** Payout signing progress (X of Y signings) */
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Artifact download info (when set, the UI should show the download modal) */
  artifactDownloadInfo: ArtifactDownloadInfo | null;
  /** Callback to continue the flow after artifact download */
  continueAfterArtifactDownload: () => void;
}

export interface PeginCreationResult {
  /** Vault index (0 or 1) */
  vaultIndex: number;
  /** Bitcoin transaction hash */
  btcTxHash: Hex;
  /** Ethereum transaction hash */
  ethTxHash: Hex;
  /** Vault ID from contract (primary identifier) */
  vaultId: Hex;
  /** Funded Pre-PegIn tx hex — this is the tx the depositor signs and broadcasts */
  fundedPrePeginTxHex: string;
  /** PegIn tx hex — the vault transaction derived from the Pre-PegIn */
  peginTxHex: string;
  /** UTXOs used in the pegin */
  selectedUTXOs: DepositUtxo[];
  /** Transaction fee in satoshis */
  fee: bigint;
  /** Depositor's BTC public key (x-only) */
  depositorBtcPubkey: string;
  /** HTLC secret hex (no 0x prefix) — shown to the user for safekeeping */
  htlcSecretHex: string;
}

export interface MultiVaultDepositResult {
  /** Array of pegin results (one per vault) */
  pegins: PeginCreationResult[];
  /** Batch ID linking the vaults */
  batchId: string;
  /** Warning messages for background operation failures (payout signing, broadcast) */
  warnings?: string[];
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMultiVaultDepositFlow(
  params: UseMultiVaultDepositFlowParams,
): UseMultiVaultDepositFlowReturn {
  const {
    vaultAmounts,
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
    htlcSecretHexes,
    depositorSecretHashes,
  } = params;

  // State
  const [currentStep, setCurrentStep] = useState<DepositFlowStep>(
    DepositFlowStep.SIGN_POP,
  );
  const [currentVaultIndex, setCurrentVaultIndex] = useState<number | null>(
    null,
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
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);
  const { config, timelockPegin, timelockRefund, minDeposit, maxDeposit } =
    useProtocolParamsContext();

  // ============================================================================
  // Main Execution Function
  // ============================================================================

  const executeMultiVaultDeposit =
    useCallback(async (): Promise<MultiVaultDepositResult | null> => {
      // Create a new AbortController for this flow execution
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      setProcessing(true);
      setError(null);
      setCurrentStep(DepositFlowStep.SIGN_POP);

      // Track background operation failures
      const warnings: string[] = [];

      try {
        // ========================================================================
        // Step 0: Validation
        // ========================================================================

        validateMultiVaultDepositInputs({
          btcAddress,
          depositorEthAddress,
          vaultAmounts,
          selectedProviders,
          confirmedUTXOs: spendableUTXOs,
          isUTXOsLoading,
          utxoError,
          vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          minDeposit,
          maxDeposit,
          htlcSecretHexesLength: htlcSecretHexes.length,
          depositorSecretHashesLength: depositorSecretHashes.length,
        });

        // After validation, these values are guaranteed to be defined
        if (!btcAddress || !depositorEthAddress || !btcWalletProvider) {
          throw new Error("BTC or ETH wallet not connected");
        }
        const confirmedBtcAddress = btcAddress;
        const confirmedEthAddress = depositorEthAddress;
        const confirmedBtcWallet = btcWalletProvider;

        // Extract primary provider (current implementation supports single provider only)
        const primaryProvider = selectedProviders[0] as Address;

        // Generate batch ID for tracking
        const batchId = uuidv4();

        // ========================================================================
        // Step 1: Get shared resources
        // ========================================================================

        // Get ETH wallet client once (chain switch + wallet client are reusable)
        const walletClient = await getEthWalletClient(confirmedEthAddress);

        // Get mnemonic once before the loop.
        // The modal is one-time-use — calling getMnemonic() inside the loop
        // would hang on the second vault because the modal is already closed.
        const mnemonic = await getMnemonic();

        // ========================================================================
        // Step 2: Create Batch Pre-PegIn (all vaults in one BTC tx)
        // ========================================================================

        setCurrentStep(DepositFlowStep.SIGN_POP);

        // Compute hashlocks from secrets
        const hashlocks = htlcSecretHexes.map(
          (hex) => hashSecret(hex).slice(2), // strip 0x prefix
        );

        // ONE Pre-PegIn tx with N HTLC outputs (one per vault)
        const batchResult = await preparePeginTransaction(
          confirmedBtcWallet,
          walletClient,
          {
            pegInAmounts: vaultAmounts,
            protocolFeeRate: config.offchainParams.feeRate,
            mempoolFeeRate,
            changeAddress: confirmedBtcAddress,
            vaultProviderBtcPubkey,
            vaultKeeperBtcPubkeys,
            universalChallengerBtcPubkeys,
            timelockPegin,
            timelockRefund,
            hashlocks,
            councilQuorum: config.offchainParams.councilQuorum,
            councilSize: config.offchainParams.securityCouncilKeys.length,
            availableUTXOs: spendableUTXOs,
          },
        );

        // ========================================================================
        // Step 3: Register each vault on Ethereum (with PoP reuse)
        // ========================================================================

        setCurrentStep(DepositFlowStep.SUBMIT_PEGIN);

        let capturedPopSignature: Hex | undefined;

        const peginResults: PeginCreationResult[] = [];

        for (let i = 0; i < batchResult.perVault.length; i++) {
          setCurrentVaultIndex(i);

          const vault = batchResult.perVault[i];
          const htlcSecretHex = htlcSecretHexes[i];

          // Derive keypair and compute WOTS PK hash (before ETH tx)
          const wotsPkHash = await deriveWotsPkHash(
            mnemonic,
            vault.btcTxHash,
            batchResult.depositorBtcPubkey,
            selectedApplication,
          );

          const registration = await registerPeginAndWait({
            btcWalletProvider: confirmedBtcWallet,
            walletClient,
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
            peginTxHex: vault.peginTxHex,
            unsignedPrePeginTxHex: batchResult.fundedPrePeginTxHex,
            hashlock: ensureHexPrefix(hashlocks[i]),
            htlcVout: vault.htlcVout,
            vaultProviderAddress: primaryProvider,
            depositorPayoutBtcAddress: confirmedBtcAddress,
            depositorWotsPkHash: wotsPkHash,
            preSignedBtcPopSignature: capturedPopSignature,
            depositorSecretHash: depositorSecretHashes[i],
          });

          // Capture PoP signature from first vault for reuse
          capturedPopSignature ??= registration.btcPopSignature;

          const peginResult: PeginCreationResult = {
            vaultIndex: i,
            btcTxHash: vault.btcTxHash as Hex,
            ethTxHash: registration.ethTxHash,
            vaultId: registration.btcTxid as Hex,
            fundedPrePeginTxHex: batchResult.fundedPrePeginTxHex,
            peginTxHex: vault.peginTxHex,
            selectedUTXOs: batchResult.selectedUTXOs,
            fee: batchResult.fee,
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
            htlcSecretHex,
          };

          peginResults.push(peginResult);
        }

        setCurrentVaultIndex(null);

        // ========================================================================
        // Step 4: Broadcast Pre-PegIn transaction to Bitcoin
        // Broadcast immediately after ETH registration so the VP can verify
        // the Pre-PegIn inputs on the Bitcoin network when it processes the
        // Ethereum event. Nothing must throw between ETH registration and
        // this broadcast — otherwise the VP has the event but no BTC tx.
        // ========================================================================

        setCurrentStep(DepositFlowStep.BROADCAST_PRE_PEGIN);

        try {
          await broadcastPrePeginTransaction({
            unsignedTxHex: batchResult.fundedPrePeginTxHex,
            btcWalletProvider: {
              signPsbt: (psbtHex: string) =>
                confirmedBtcWallet.signPsbt(psbtHex),
            },
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to broadcast batch Pre-PegIn transaction: ${errorMsg}`,
          );
        }

        // ========================================================================
        // Step 4b: Save Pegins to Storage
        // Saved after both ETH registration and BTC broadcast succeed, so
        // localStorage never contains ghost entries for un-broadcast pegins.
        // ========================================================================

        for (const peginResult of peginResults) {
          const vaultAmount = vaultAmounts[peginResult.vaultIndex];

          if (vaultAmount === undefined) {
            logger.error(
              new Error("[Multi-Vault] Invalid vault index for vault"),
              {
                data: {
                  vaultIndex: peginResult.vaultIndex,
                  vaultId: peginResult.vaultId,
                },
              },
            );
            continue;
          }

          addPendingPegin(confirmedEthAddress, {
            id: peginResult.vaultId,
            btcTxHash: peginResult.btcTxHash,
            amount: formatBtcValue(satoshiToBtcNumber(vaultAmount)),
            providerIds: [primaryProvider],
            applicationEntryPoint: selectedApplication,
            batchId,
            batchIndex: peginResult.vaultIndex + 1,
            batchTotal: vaultAmounts.length,
            status: LocalStorageStatus.CONFIRMING,
            unsignedTxHex: peginResult.fundedPrePeginTxHex,
            selectedUTXOs: peginResult.selectedUTXOs.map((u) => ({
              txid: u.txid,
              vout: u.vout,
              value: String(u.value),
              scriptPubKey: u.scriptPubKey,
            })),
          });

          if (mnemonicId) {
            linkPeginToMnemonic(
              peginResult.vaultId,
              mnemonicId,
              confirmedEthAddress,
            );
          }
        }

        // All vaults share the same Pre-PegIn tx — if broadcast succeeded,
        // all pegins are live on Bitcoin.
        const broadcastedResults = peginResults;

        const provider = findProvider(primaryProvider as Hex);
        if (!provider) {
          throw new Error("Vault provider not found");
        }

        // ========================================================================
        // Step 5: Submit WOTS Keys + Sign Payout Transactions
        // ========================================================================

        setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        for (const result of broadcastedResults) {
          try {
            await submitWotsPublicKey({
              btcTxid: result.vaultId,
              depositorBtcPubkey: result.depositorBtcPubkey,
              appContractAddress: selectedApplication,
              providerAddress: provider.id,
              getMnemonic,
              signal,
            });
          } catch (error) {
            // Re-throw abort errors so they're suppressed by the outer catch
            if (signal.aborted) throw error;
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex + 1}: WOTS key submission failed - ${errorMsg}`;
            warnings.push(warning);
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                data: {
                  context: "[Multi-Vault] Failed to submit WOTS key for vault",
                  vaultId: result.vaultId,
                },
              },
            );
          }
        }

        // ========================================================================
        // Step 5 (cont): Sign Payout Transactions
        // VP waits for Pre-PegIn BTC confirmation before being ready.
        // ========================================================================

        for (const result of broadcastedResults) {
          try {
            setIsWaiting(true);
            const {
              context,
              vaultProviderAddress,
              preparedTransactions,
              depositorGraph,
            } = await pollAndPreparePayoutSigning({
              btcTxid: result.vaultId, // Use vaultId for payout lookup
              btcTxHex: result.peginTxHex,
              depositorBtcPubkey: result.depositorBtcPubkey,
              providerAddress: provider.id,
              providerBtcPubKey: provider.btcPubKey,
              vaultKeepers,
              universalChallengers: universalChallengerBtcPubkeys.map(
                (btcPubKey) => ({
                  btcPubKey,
                }),
              ),
              signal,
            });

            setIsWaiting(false);

            // Sign payouts (batch when wallet supports it)
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
              depositorBtcPubkey: result.depositorBtcPubkey,
              btcWallet: confirmedBtcWallet,
            });

            // Submit signatures
            await submitPayoutSignatures(
              vaultProviderAddress,
              result.vaultId,
              result.depositorBtcPubkey,
              signatures,
              confirmedEthAddress,
              depositorClaimerPresignatures,
            );
          } catch (error) {
            // If the user cancelled, stop immediately — don't continue with other vaults
            if (signal.aborted) throw error;

            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex + 1}: Payout signing failed - ${errorMsg}`;
            warnings.push(warning);
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                data: {
                  context:
                    "[Multi-Vault] Failed to sign or submit payouts for vault",
                  vaultId: result.vaultId,
                  providerAddress: provider.id,
                },
              },
            );
            // Continue with other vaults
          }
        }

        setPayoutSigningProgress(null);

        // ========================================================================
        // Step 6: Download Vault Artifacts (per vault, sequential)
        // ========================================================================

        setCurrentStep(DepositFlowStep.ARTIFACT_DOWNLOAD);

        for (const result of broadcastedResults) {
          if (signal.aborted) break;

          setArtifactDownloadInfo({
            providerAddress: provider.id,
            peginTxid: result.vaultId,
            depositorPk: result.depositorBtcPubkey,
          });

          // Wait for user to download and click "Continue"
          await new Promise<void>((resolve) => {
            artifactResolverRef.current = resolve;
          });
        }

        // ========================================================================
        // Step 7: Activate Vaults — wait for contract VERIFIED, then
        // reveal HTLC secret on Ethereum
        // ========================================================================

        setCurrentStep(DepositFlowStep.ACTIVATE_VAULT);
        setIsWaiting(true);
        await Promise.all(
          broadcastedResults.map((r) =>
            waitForContractVerification({ btcTxid: r.vaultId, signal }),
          ),
        );
        setIsWaiting(false);

        for (const result of broadcastedResults) {
          try {
            await activateVaultWithSecret({
              vaultId: result.vaultId,
              secret: ensureHexPrefix(result.htlcSecretHex),
              walletClient,
            });
          } catch (error) {
            if (signal.aborted) throw error;

            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex + 1}: Activation failed - ${errorMsg}`;
            warnings.push(warning);
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                data: {
                  context: "[Multi-Vault] Failed to activate vault",
                  vaultId: result.vaultId,
                },
              },
            );
          }
        }

        setCurrentStep(DepositFlowStep.COMPLETED);

        // Return result
        return {
          pegins: peginResults,
          batchId,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (err: unknown) {
        // Don't show error if flow was aborted (user intentionally closed modal)
        if (!signal.aborted) {
          setError(sanitizeErrorMessage(err));
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: { context: "Multi-vault deposit flow error" },
          });
        }
        return null;
      } finally {
        setProcessing(false);
        setIsWaiting(false);
        setCurrentVaultIndex(null);
        abortControllerRef.current = null;
      }
    }, [
      vaultAmounts,
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
      minDeposit,
      maxDeposit,
      btcAddress,
      spendableUTXOs,
      isUTXOsLoading,
      utxoError,
      vaultKeepers,
      findProvider,
      getMnemonic,
      mnemonicId,
      htlcSecretHexes,
      depositorSecretHashes,
    ]);

  return {
    executeMultiVaultDeposit,
    abort,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  };
}
