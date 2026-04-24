/**
 * Deposit Flow Hook
 *
 * Orchestrates the batch-first deposit flow. A single vault is just a batch of 1.
 * Creates ONE Pre-PegIn BTC transaction with N HTLC outputs (one per vault) and
 * registers them all atomically on Ethereum via submitPeginRequestBatch().
 *
 * Flow:
 * 0. Validation — check wallets, UTXOs, pubkeys, array alignment
 * 1. Get shared resources (ETH wallet client, mnemonic)
 * 2. Batch Pre-PegIn creation (one BTC tx with N HTLC outputs)
 * 3a. Derive WOTS public keys for all vaults
 * 3b. Sign BIP-322 proof-of-possession (one wallet popup per deposit session)
 * 3c. Build batch request array
 * 3d. Batch ETH registration (single submitPeginRequestBatch tx for all vaults)
 * 4. Broadcast Pre-PegIn transaction to Bitcoin + save to localStorage (CONFIRMING)
 * 5. Submit WOTS keys, poll VP, sign payout transactions
 * 6. Download vault artifacts (per vault, user-driven)
 * 7. Wait for contract verification, then activate vaults (reveal HTLC secret)
 *
 * ETH registration is atomic: submitPeginRequestBatch registers all vaults in a
 * single transaction, so either all succeed or all fail. If it fails, the Pre-PegIn
 * is NOT broadcast, so no BTC gets locked in unregistered HTLC outputs.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { VpResponseValidationError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { computeHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  collectReservedUtxoRefs,
  selectUtxosForDeposit,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import {
  broadcastPrePeginTransaction,
  utxosToExpectedRecord,
} from "@/services/vault/vaultPeginBroadcastService";
import { preparePeginTransaction } from "@/services/vault/vaultTransactionService";
import { assertUtxosAvailable } from "@/services/vault/vaultUtxoValidationService";
import {
  computeWotsPublicKeysHash,
  deriveWotsBlockPublicKeys,
  linkPeginToMnemonic,
  mnemonicToWotsSeed,
  type WotsPublicKeys,
} from "@/services/wots";
import {
  addPendingPegin,
  getPendingPegins,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import { btcAddressToScriptPubKeyHex } from "@/utils/btc";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { sanitizeErrorMessage } from "@/utils/errors/formatting";
import { formatBtcValue } from "@/utils/formatting";

import {
  DepositFlowStep,
  getEthWalletClient,
  registerPeginBatchAndWait,
  signAndSubmitPayouts,
  signProofOfPossession,
  submitWotsPublicKey,
  waitForContractVerification,
  type DepositUtxo,
} from "./depositFlowSteps";
import { useBtcWalletState } from "./useBtcWalletState";
import { useVaultProviders } from "./useVaultProviders";

// ============================================================================
// Types
// ============================================================================

export interface UseDepositFlowParams {
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

export interface UseDepositFlowReturn {
  /** Execute the batch deposit flow */
  executeDeposit: () => Promise<MultiVaultDepositResult | null>;
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
  /** Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)) */
  vaultId: Hex;
  /** Raw BTC pegin transaction hash (for VP RPC operations) */
  peginTxHash: Hex;
  /** Ethereum transaction hash */
  ethTxHash: Hex;
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

export function useDepositFlow(
  params: UseDepositFlowParams,
): UseDepositFlowReturn {
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
  const { findProvider } = useVaultProviders(selectedApplication);
  const { config, timelockPegin, timelockRefund, minDeposit, maxDeposit } =
    useProtocolParamsContext();

  // ============================================================================
  // Main Execution Function
  // ============================================================================

  const executeDeposit =
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

        if (isUTXOsLoading) {
          throw new Error("Loading UTXOs...");
        }
        if (utxoError) {
          throw new Error(`Failed to load UTXOs: ${utxoError.message}`);
        }

        if (!spendableUTXOs) {
          throw new Error(
            "Spendable UTXOs unavailable after loading completed",
          );
        }

        validateMultiVaultDepositInputs({
          btcAddress,
          depositorEthAddress,
          vaultAmounts,
          selectedProviders,
          confirmedUTXOs: spendableUTXOs,
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

        // Compute hashlocks from secrets.
        // SDK's computeHashlock takes 0x-prefixed hex and returns 0x-prefixed;
        // Pre-PegIn params expect hashlocks without the 0x prefix.
        const hashlocks = htlcSecretHexes.map((hex) =>
          computeHashlock(ensureHexPrefix(hex)).slice(2),
        );

        // Filter out UTXOs reserved by in-flight deposits to prevent
        // double-spend failures across concurrent sessions/tabs.
        const pendingPegins = getPendingPegins(confirmedEthAddress);
        const reservedUtxoRefs = collectReservedUtxoRefs({ pendingPegins });
        const availableUTXOs = selectUtxosForDeposit({
          availableUtxos: spendableUTXOs,
          reservedUtxoRefs,
          requiredAmount: vaultAmounts.reduce((sum, a) => sum + a, 0n),
          feeRate: mempoolFeeRate,
        });

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
            availableUTXOs,
          },
        );

        // ========================================================================
        // Step 3: Sign PoP + batch register all vaults on Ethereum
        // ========================================================================

        // 3a. Derive WOTS public keys for all vaults (must happen before ETH tx)
        // Keys are derived here and reused for both:
        //   - on-chain hash commitment (depositorWotsPkHash in ETH tx)
        //   - VP RPC submission (step 5)
        // Note: deriveWotsBlockPublicKeys zeroes the seed in its finally block,
        // so a fresh seed must be created per vault.
        const perVaultWotsKeys: WotsPublicKeys[] = [];
        const wotsPkHashes: Hex[] = [];
        for (let i = 0; i < batchResult.perVault.length; i++) {
          const vault = batchResult.perVault[i];
          const seed = mnemonicToWotsSeed(mnemonic);
          const wotsPublicKeys = await deriveWotsBlockPublicKeys(
            seed,
            vault.peginTxHash,
            batchResult.depositorBtcPubkey,
            selectedApplication,
          );
          perVaultWotsKeys.push(wotsPublicKeys);
          wotsPkHashes.push(computeWotsPublicKeysHash(wotsPublicKeys));
        }

        // 3b. Sign PoP during SIGN_POP so the wallet popup is associated
        // with this step, not the following SUBMIT_PEGIN.
        setCurrentStep(DepositFlowStep.SIGN_POP);
        const popSignature = await signProofOfPossession(
          confirmedBtcWallet,
          walletClient,
        );

        // 3c. Build batch request array.
        const batchRequests = batchResult.perVault.map((vault, i) => ({
          depositorSignedPeginTx: vault.peginTxHex,
          hashlock: ensureHexPrefix(hashlocks[i]) as Hex,
          htlcVout: vault.htlcVout,
          depositorPayoutBtcAddress: confirmedBtcAddress,
          depositorWotsPkHash: wotsPkHashes[i],
        }));

        // 3d. Re-check UTXO availability before committing to ETH registration.
        // This catches the common case where UTXOs were spent during the
        // (potentially lengthy) PoP signing step. It does not eliminate the
        // race entirely — UTXOs could still be spent between this check and
        // the BTC broadcast — but it prevents the most likely failure mode.
        await assertUtxosAvailable(
          batchResult.fundedPrePeginTxHex,
          confirmedBtcAddress,
        );

        // 3e. Single batch ETH transaction for all vaults.
        setCurrentStep(DepositFlowStep.SUBMIT_PEGIN);
        const batchRegistration = await registerPeginBatchAndWait({
          btcWalletProvider: confirmedBtcWallet,
          walletClient,
          vaultProviderAddress: primaryProvider,
          unsignedPrePeginTx: batchResult.fundedPrePeginTxHex,
          requests: batchRequests,
          popSignature,
        });

        // 3d. Build pegin results from batch response
        const peginResults: PeginCreationResult[] =
          batchRegistration.vaults.map((vault, i) => ({
            vaultIndex: i,
            vaultId: vault.vaultId,
            peginTxHash: vault.peginTxHash,
            ethTxHash: batchRegistration.ethTxHash,
            fundedPrePeginTxHex: batchResult.fundedPrePeginTxHex,
            peginTxHex: batchResult.perVault[i].peginTxHex,
            selectedUTXOs: batchResult.selectedUTXOs,
            fee: batchResult.fee,
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
            htlcSecretHex: htlcSecretHexes[i],
          }));

        // ========================================================================
        // Step 4: Persist pending pegins BEFORE broadcast
        // Saved immediately after ETH registration so the selected UTXOs are
        // reserved even if broadcast fails. Status is PENDING (not CONFIRMING)
        // — the resume flow will show a "Broadcast" button for these entries.
        // This prevents the race condition where a failed broadcast leaves
        // no localStorage record, causing UTXOs to be reused in a new deposit.
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
            peginTxHash: peginResult.peginTxHash,
            depositorBtcPubkey: peginResult.depositorBtcPubkey,
            amount: formatBtcValue(satoshiToBtcNumber(vaultAmount)),
            providerIds: [primaryProvider],
            applicationEntryPoint: selectedApplication,
            batchId,
            batchIndex: peginResult.vaultIndex + 1,
            batchTotal: vaultAmounts.length,
            status: LocalStorageStatus.PENDING,
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
              peginResult.peginTxHash,
              mnemonicId,
              confirmedEthAddress,
            );
          }
        }

        // ========================================================================
        // Step 4b: Broadcast Pre-PegIn transaction to Bitcoin
        // Broadcast immediately after ETH registration so the VP can verify
        // the Pre-PegIn inputs on the Bitcoin network when it processes the
        // Ethereum event.
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
            expectedUtxos: utxosToExpectedRecord(batchResult.selectedUTXOs),
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to broadcast batch Pre-PegIn transaction: ${errorMsg}`,
          );
        }

        // Broadcast succeeded — update pending pegins from PENDING to CONFIRMING
        for (const peginResult of peginResults) {
          updatePendingPeginStatus(
            confirmedEthAddress,
            peginResult.vaultId,
            LocalStorageStatus.CONFIRMING,
          );
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

        // Track per-vault outcomes so failed lanes don't block healthy siblings
        const wotsFailedVaultIds = new Set<string>();

        const MAX_WOTS_ATTEMPTS = 2;

        for (const result of broadcastedResults) {
          let wotsSuccess = false;

          for (let attempt = 1; attempt <= MAX_WOTS_ATTEMPTS; attempt++) {
            try {
              await submitWotsPublicKey({
                peginTxHash: result.peginTxHash,
                depositorBtcPubkey: result.depositorBtcPubkey,
                providerAddress: provider.id,
                wotsPublicKeys: perVaultWotsKeys[result.vaultIndex],
                signal,
              });
              wotsSuccess = true;
              break;
            } catch (error) {
              // Re-throw abort errors so they're suppressed by the outer catch
              if (signal.aborted) throw error;

              if (attempt < MAX_WOTS_ATTEMPTS) {
                // submitWotsPublicKey is idempotent — if the VP already accepted
                // the key but the response was lost, the retry will detect that
                // the VP moved past the WOTS stage and return early.
                logger.warn(
                  `[Multi-Vault] WOTS submission failed for vault ${result.vaultId}, retrying (attempt ${attempt}/${MAX_WOTS_ATTEMPTS})`,
                );
                continue;
              }

              const errorMsg =
                error instanceof Error ? error.message : String(error);
              const warning = `Vault ${result.vaultIndex + 1}: WOTS key submission failed - ${errorMsg}`;
              warnings.push(warning);
              logger.error(
                error instanceof Error ? error : new Error(String(error)),
                {
                  data: {
                    context:
                      "[Multi-Vault] Failed to submit WOTS key for vault",
                    vaultId: result.vaultId,
                  },
                },
              );
            }
          }

          if (!wotsSuccess) {
            wotsFailedVaultIds.add(result.vaultId);
          }
        }

        // ========================================================================
        // Step 5 (cont): Sign Payout Transactions
        // VP waits for Pre-PegIn BTC confirmation before being ready.
        // ========================================================================

        const payoutSignedVaultIds = new Set<string>();

        for (let vi = 0; vi < broadcastedResults.length; vi++) {
          const result = broadcastedResults[vi];

          // Skip vaults whose WOTS key submission failed — the VP won't have
          // the keys needed, so payout signing would timeout.
          if (wotsFailedVaultIds.has(result.vaultId)) continue;

          try {
            setCurrentVaultIndex(vi);
            setIsWaiting(true);

            await signAndSubmitPayouts({
              vaultId: result.vaultId,
              peginTxHash: result.peginTxHash,
              depositorBtcPubkey: result.depositorBtcPubkey,
              providerBtcPubKey: provider.btcPubKey,
              registeredPayoutScriptPubKey:
                btcAddressToScriptPubKeyHex(confirmedBtcAddress),
              btcWallet: confirmedBtcWallet,
              depositorEthAddress: confirmedEthAddress,
              signal,
              onProgress: setPayoutSigningProgress,
            });

            setIsWaiting(false);
            payoutSignedVaultIds.add(result.vaultId);
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
        setCurrentVaultIndex(null);

        // Only proceed with vaults that completed payout signing.
        // Vaults that failed WOTS submission or payout signing will never
        // reach VERIFIED — waiting for them would block healthy siblings.
        const readyResults = broadcastedResults.filter((r) =>
          payoutSignedVaultIds.has(r.vaultId),
        );

        // ========================================================================
        // Step 6: Download Vault Artifacts (per vault, sequential)
        // ========================================================================

        setCurrentStep(DepositFlowStep.ARTIFACT_DOWNLOAD);

        for (const result of readyResults) {
          if (signal.aborted) break;

          setArtifactDownloadInfo({
            providerAddress: provider.id,
            peginTxid: result.peginTxHash,
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

        if (readyResults.length > 0) {
          setCurrentStep(DepositFlowStep.ACTIVATE_VAULT);
          setIsWaiting(true);
          await Promise.all(
            readyResults.map((r) =>
              waitForContractVerification({ vaultId: r.vaultId, signal }),
            ),
          );
          setIsWaiting(false);

          for (const result of readyResults) {
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
            data: {
              context: "Multi-vault deposit flow error",
              ...(err instanceof VpResponseValidationError && {
                detail: err.detail,
              }),
            },
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
      findProvider,
      getMnemonic,
      mnemonicId,
      htlcSecretHexes,
      depositorSecretHashes,
    ]);

  return {
    executeDeposit,
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
