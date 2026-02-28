/**
 * Multi-Vault Deposit Flow Hook
 *
 * Orchestrates the complete 2-vault deposit flow with split transaction support.
 *
 * This hook handles three allocation strategies:
 * - SINGLE: One vault using standard flow
 * - MULTI_INPUT: Two vaults, each funded by existing UTXOs (no split TX)
 * - SPLIT: Two vaults funded by creating a split transaction first
 *
 * Flow:
 * 1. Validation - check wallets, UTXOs, pubkeys
 * 2. Planning - determine allocation strategy
 * 3. Split TX (if needed) - create, sign, broadcast immediately
 * 4. Pegin Creation - create 1-2 pegins (independent failures allowed)
 * 5. Storage - save with batch tracking
 * 6-8. Background - sign payouts, verify, broadcast to Bitcoin
 */

import { pushTx } from "@babylonlabs-io/ts-sdk";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  createSplitTransaction,
  createSplitTransactionPsbt,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { getBTCNetworkForWASM } from "@/config/pegin";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import { deriveLamportPkHash, linkPeginToMnemonic } from "@/services/lamport";
import {
  broadcastPeginWithLocalUtxo,
  planUtxoAllocation,
  preparePeginFromSplitOutput,
  registerSplitPeginOnChain,
  type AllocationPlan,
} from "@/services/vault";
import { prepareAndSignDepositorGraph } from "@/services/vault/depositorGraphSigningService";
import {
  signPayoutTransactions,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { addPendingPegin } from "@/storage/peginStorage";

import {
  broadcastBtcTransaction,
  DepositFlowStep,
  getEthWalletClient,
  pollAndPreparePayoutSigning,
  preparePegin,
  registerPeginAndWait,
  submitLamportPublicKey,
  submitPayoutSignatures,
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
  /** Fee rate in sat/vByte */
  feeRate: number;
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
  /** Callback to retrieve the decrypted mnemonic for Lamport PK derivation
   *  and submission to the vault provider. */
  getMnemonic: () => Promise<string>;
  /** UUID of the stored mnemonic, used to record the peg-in → mnemonic
   *  mapping so the resume flow can look up the correct mnemonic. */
  mnemonicId?: string;
  /** Pre-computed allocation plan from the form (skips runtime planning) */
  precomputedPlan?: AllocationPlan;
}

export interface ArtifactDownloadInfo {
  providerUrl: string;
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
  /** UTXO allocation plan (set after Step 1) */
  allocationPlan: AllocationPlan | null;
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
  /** Unsigned BTC transaction hex */
  btcTxHex: string;
  /** UTXOs used in the pegin */
  selectedUTXOs: DepositUtxo[];
  /** Transaction fee in satoshis */
  fee: bigint;
  /** Depositor's BTC public key (x-only) */
  depositorBtcPubkey: string;
  /** Error message if this vault failed */
  error?: string;
}

export interface MultiVaultDepositResult {
  /** Array of pegin results (one per vault) */
  pegins: PeginCreationResult[];
  /** Batch ID linking the vaults */
  batchId: string;
  /** Split transaction ID if split strategy was used */
  splitTxId?: string;
  /** Allocation strategy used */
  strategy: string;
  /** Warning messages for background operation failures (payout signing, broadcast) */
  warnings?: string[];
}

interface SplitTxSignResult {
  /** Transaction ID */
  txid: string;
  /** Signed transaction hex */
  signedHex: string;
  /** Output UTXOs created by split transaction */
  outputs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>;
}

// ============================================================================
// Helper: Create and Sign Split Transaction
// ============================================================================

async function createAndSignSplitTransaction(
  splitTx: NonNullable<AllocationPlan["splitTransaction"]>,
  btcWalletProvider: BitcoinWallet,
): Promise<SplitTxSignResult> {
  const network = getBTCNetworkForWASM();

  // Create unsigned split transaction
  const result = createSplitTransaction(
    splitTx.inputs,
    splitTx.outputs.map((o) => ({
      amount: o.amount,
      address: o.address,
    })),
    network,
  );

  // Get depositor's public key for P2TR signing
  const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
  const publicKeyNoCoord = Buffer.from(
    publicKeyHex.length === 64 ? publicKeyHex : publicKeyHex.slice(2),
    "hex",
  );

  // Create PSBT
  const psbtHex = createSplitTransactionPsbt(
    result.txHex,
    splitTx.inputs,
    publicKeyNoCoord,
  );

  // Sign via wallet
  const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex, {
    autoFinalized: true,
  });

  // Extract signed transaction
  const signedPsbt = Psbt.fromHex(signedPsbtHex);
  signedPsbt.setMaximumFeeRate(100000); // Allow high fee rates for split transactions
  const signedTx = signedPsbt.extractTransaction();
  const signedHex = signedTx.toHex();

  return {
    txid: result.txid,
    signedHex,
    outputs: result.outputs,
  };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMultiVaultDepositFlow(
  params: UseMultiVaultDepositFlowParams,
): UseMultiVaultDepositFlowReturn {
  const {
    vaultAmounts,
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
    precomputedPlan,
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
  const [allocationPlan, setAllocationPlan] = useState<AllocationPlan | null>(
    null,
  );
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

  // NOTE: We intentionally do NOT abort on unmount via useEffect cleanup.
  // React StrictMode (dev) simulates unmount/remount, which would abort the
  // signal mid-flow (after split TX broadcast but before pegin creation).
  // User-initiated abort is handled by handleClose → abort() in the parent.

  // Hooks
  const { btcAddress, spendableUTXOs, isUTXOsLoading, utxoError } =
    useBtcWalletState();
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);
  const { timelockPegin, depositorClaimValue, getOffchainParamsByVersion } =
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
        });

        // After validation, these values are guaranteed to be defined
        const confirmedBtcAddress = btcAddress!;
        const confirmedEthAddress = depositorEthAddress!;
        const confirmedBtcWallet = btcWalletProvider!;

        // Extract primary provider (current implementation supports single provider only)
        const primaryProvider = selectedProviders[0] as Address;

        // Generate batch ID for tracking
        const batchId = uuidv4();

        // ========================================================================
        // Step 1: Plan UTXO Allocation (use precomputed plan if available)
        // ========================================================================

        const plan =
          precomputedPlan ??
          planUtxoAllocation(
            spendableUTXOs,
            vaultAmounts,
            feeRate,
            confirmedBtcAddress,
            depositorClaimValue,
          );

        setAllocationPlan(plan);

        // ========================================================================
        // Step 2: Create and Broadcast Split Transaction (if needed)
        // ========================================================================

        let splitTxResult: SplitTxSignResult | null = null;

        if (plan.needsSplit && plan.splitTransaction) {
          setCurrentStep(DepositFlowStep.SIGN_SPLIT_TX);
          console.log("[Multi-Vault-Debug] Step 2: Entering split TX creation");

          // 2a. Create and sign split transaction
          splitTxResult = await createAndSignSplitTransaction(
            plan.splitTransaction,
            confirmedBtcWallet,
          );
          console.log(
            "[Multi-Vault-Debug] Step 2a: Split TX signed, txid:",
            splitTxResult.txid,
            "outputs:",
            splitTxResult.outputs.length,
          );

          // 2b. Broadcast split TX IMMEDIATELY
          try {
            await pushTx(splitTxResult.signedHex, getMempoolApiUrl());
            console.log(
              "[Multi-Vault-Debug] Step 2b: Split TX broadcast SUCCESS",
            );
          } catch (broadcastError) {
            throw new Error(
              `Failed to broadcast split transaction: ${broadcastError instanceof Error ? broadcastError.message : String(broadcastError)}`,
            );
          }

          // Split outputs are now on-chain (unconfirmed) and can be used for pegins
        }

        // ========================================================================
        // Step 2.5: Get shared resources (once, before per-vault loop)
        // ========================================================================

        // Get ETH wallet client once (chain switch + wallet client are reusable)
        console.log(
          "[Multi-Vault-Debug] Step 2.5: Getting ETH wallet client...",
        );
        const walletClient = await getEthWalletClient(confirmedEthAddress);
        console.log("[Multi-Vault-Debug] Step 2.5: ETH wallet client obtained");

        // Get mnemonic once before the loop.
        // The modal is one-time-use — calling getMnemonic() inside the loop
        // would hang on the second vault because the modal is already closed.
        console.log(
          "[Multi-Vault-Debug] Step 2.5: Getting mnemonic...",
        );
        const mnemonic = await getMnemonic();
        console.log(
          "[Multi-Vault-Debug] Step 2.5: mnemonic obtained",
        );

        // ========================================================================
        // Step 3: Create N Pegins (1 or 2) — with POP reuse
        // ========================================================================

        console.log(
          "[Multi-Vault-Debug] Step 3: Entering pegin creation loop, vaultAmounts:",
          vaultAmounts.length,
        );
        setCurrentStep(DepositFlowStep.SIGN_POP);

        let capturedPopSignature: Hex | undefined;

        const peginResults: PeginCreationResult[] = [];

        for (let i = 0; i < vaultAmounts.length; i++) {
          setCurrentVaultIndex(i);
          console.log(`[Multi-Vault-Debug] Loop vault ${i}: starting`);

          try {
            const allocation = plan.vaultAllocations[i];
            console.log(
              `[Multi-Vault-Debug] Loop vault ${i}: allocation fromSplit=${allocation.fromSplit}, splitTxOutputIndex=${allocation.splitTxOutputIndex}, utxos=${allocation.utxos.length}`,
            );

            const peginAmount = vaultAmounts[i];

            // CRITICAL: Use different path for split outputs vs existing UTXOs
            let peginResult: {
              btcTxid: string;
              ethTxHash: Hex;
              vaultId: Hex;
              btcTxHex: string;
              selectedUTXOs: UTXO[];
              fee: bigint;
            };
            let depositorBtcPubkey: string;

            if (allocation.fromSplit && splitTxResult) {
              // ================================================================
              // SPLIT OUTPUT PATH: Use custom pegin builder (no mempool fetch)
              // ================================================================
              console.log(
                `[Multi-Vault-Debug] Vault ${i}: entering SPLIT path`,
              );

              // Use output from split transaction (now on-chain)
              const splitOutput =
                splitTxResult.outputs[allocation.splitTxOutputIndex!];
              console.log(
                `[Multi-Vault-Debug] Vault ${i}: splitOutput txid=${splitOutput?.txid?.slice(0, 8)}..., vout=${splitOutput?.vout}, value=${splitOutput?.value}`,
              );
              const utxoToUse: UTXO = {
                txid: splitOutput.txid,
                vout: splitOutput.vout,
                value: splitOutput.value,
                scriptPubKey: splitOutput.scriptPubKey,
              };

              // Extract depositor pubkey
              const publicKeyHex = await confirmedBtcWallet.getPublicKeyHex();
              depositorBtcPubkey =
                publicKeyHex.length === 66
                  ? publicKeyHex.slice(2) // Strip first byte (02 or 03) → x-only
                  : publicKeyHex; // Already x-only

              console.log(
                `[Multi-Vault-Debug] Vault ${i}: calling preparePeginFromSplitOutput, peginAmount=${peginAmount}, depositorClaimValue=${depositorClaimValue}, feeRate=${feeRate}`,
              );
              const prepareResult = await preparePeginFromSplitOutput({
                pegInAmount: peginAmount,
                feeRate,
                changeAddress: confirmedBtcAddress,
                vaultProviderAddress: primaryProvider,
                depositorBtcPubkey,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                timelockPegin,
                depositorClaimValue,
                splitOutput: utxoToUse,
              });
              console.log(
                `[Multi-Vault-Debug] Vault ${i}: preparePeginFromSplitOutput SUCCESS, btcTxHash=${prepareResult.btcTxHash?.slice(0, 8)}...`,
              );

              // Derive Lamport keypair and compute PK hash (before ETH tx)
              const splitLamportPkHash = await deriveLamportPkHash(
                mnemonic,
                prepareResult.btcTxHash,
                prepareResult.depositorBtcPubkey,
                selectedApplication,
              );

              console.log(
                `[Multi-Vault-Debug] Vault ${i}: calling registerSplitPeginOnChain, hasPopSignature=${!!capturedPopSignature}`,
              );
              const registrationResult = await registerSplitPeginOnChain(
                confirmedBtcWallet,
                walletClient,
                {
                  depositorBtcPubkey: prepareResult.depositorBtcPubkey,
                  unsignedBtcTx: prepareResult.fundedTxHex,
                  vaultProviderAddress: primaryProvider,
                  depositorLamportPkHash: splitLamportPkHash,
                  preSignedBtcPopSignature: capturedPopSignature,
                  onPopSigned: () =>
                    setCurrentStep(DepositFlowStep.SUBMIT_PEGIN),
                },
              );
              console.log(
                `[Multi-Vault-Debug] Vault ${i}: registerSplitPeginOnChain SUCCESS, ethTxHash=${registrationResult.ethTxHash?.slice(0, 10)}..., vaultId=${registrationResult.vaultId?.slice(0, 10)}...`,
              );

              // Capture PoP signature from first vault for reuse
              capturedPopSignature ??= registrationResult.btcPopSignature;

              peginResult = {
                btcTxid: prepareResult.btcTxHash,
                ethTxHash: registrationResult.ethTxHash,
                vaultId: registrationResult.vaultId,
                btcTxHex: prepareResult.fundedTxHex,
                selectedUTXOs: prepareResult.selectedUTXOs,
                fee: prepareResult.fee,
              };
            } else {
              // ================================================================
              // STANDARD PATH: Prepare + register pegin (mempool OK)
              // ================================================================

              // Validate UTXOs are available
              if (allocation.utxos.length === 0) {
                throw new Error(`No UTXO available for vault ${i}`);
              }

              const prepared = await preparePegin({
                btcWalletProvider: confirmedBtcWallet,
                walletClient,
                amount: peginAmount,
                feeRate,
                btcAddress: confirmedBtcAddress,
                selectedProviders,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                timelockPegin,
                depositorClaimValue,
                confirmedUTXOs: allocation.utxos,
                reservedUtxoRefs: [],
              });

              // Derive Lamport keypair and compute PK hash (before ETH tx)
              const lamportPkHash = await deriveLamportPkHash(
                mnemonic,
                prepared.btcTxid,
                prepared.depositorBtcPubkey,
                selectedApplication,
              );

              const registration = await registerPeginAndWait({
                btcWalletProvider: confirmedBtcWallet,
                walletClient,
                depositorBtcPubkey: prepared.depositorBtcPubkey,
                fundedTxHex: prepared.btcTxHex,
                vaultProviderAddress: selectedProviders[0],
                depositorLamportPkHash: lamportPkHash,
                preSignedBtcPopSignature: capturedPopSignature,
                onPopSigned: () => setCurrentStep(DepositFlowStep.SUBMIT_PEGIN),
              });

              // Capture PoP signature from first vault for reuse
              capturedPopSignature ??= registration.btcPopSignature;

              depositorBtcPubkey = prepared.depositorBtcPubkey;
              peginResult = {
                btcTxid: registration.btcTxid,
                ethTxHash: registration.ethTxHash,
                vaultId: registration.btcTxid as Hex,
                btcTxHex: prepared.btcTxHex,
                selectedUTXOs: prepared.selectedUTXOs,
                fee: prepared.fee,
              };
            }

            // Store result
            peginResults.push({
              vaultIndex: i,
              btcTxHash: peginResult.btcTxid as Hex,
              ethTxHash: peginResult.ethTxHash,
              vaultId: peginResult.vaultId as Hex,
              btcTxHex: peginResult.btcTxHex,
              selectedUTXOs: peginResult.selectedUTXOs,
              fee: peginResult.fee,
              depositorBtcPubkey,
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(
              `[Multi-Vault] Pegin creation failed for vault ${i}:`,
              err,
            );

            // Store failed result (partial success handling)
            peginResults.push({
              vaultIndex: i,
              btcTxHash: "0x" as Hex,
              ethTxHash: "0x" as Hex,
              vaultId: "0x" as Hex,
              btcTxHex: "",
              selectedUTXOs: [],
              fee: 0n,
              depositorBtcPubkey: "",
              error: errorMsg,
            });

            // Continue with next vault (independent failures)
          }
        }

        setCurrentVaultIndex(null);
        const successfulPegins = peginResults.filter((r) => !r.error);

        // If ALL pegin creations failed, abort — don't silently show "completed"
        if (successfulPegins.length === 0 && peginResults.length > 0) {
          const errors = peginResults
            .map((r) => `Vault ${r.vaultIndex}: ${r.error}`)
            .join("; ");
          throw new Error(`All pegin creations failed: ${errors}`);
        }

        // ========================================================================
        // Step 4: Save Pegins to Storage
        // ========================================================================

        if (successfulPegins.length > 0) {
          for (const peginResult of successfulPegins) {
            const vaultAmount = vaultAmounts[peginResult.vaultIndex];

            // Defensive check: should never happen given loop structure
            if (vaultAmount === undefined) {
              console.error(
                "[Multi-Vault] Invalid vault index",
                peginResult.vaultIndex,
                "for vault",
                peginResult.vaultId,
              );
              continue;
            }

            addPendingPegin(confirmedEthAddress, {
              id: peginResult.vaultId, // PRIMARY ID (vaultId from contract)
              btcTxHash: peginResult.btcTxHash, // For compatibility
              amount: (Number(vaultAmount) / 100000000).toFixed(8), // BTC format
              providerIds: [primaryProvider],
              applicationController: selectedApplication,
              batchId, // Links to batch
              splitTxId: splitTxResult?.txid, // Split TX ID (if used)
              batchIndex: peginResult.vaultIndex + 1, // 1-based position for UI display
              batchTotal: vaultAmounts.length, // Total vaults in this batch
            });

            if (mnemonicId) {
              linkPeginToMnemonic(
                peginResult.vaultId,
                mnemonicId,
                confirmedEthAddress,
              );
            }
          }
        }

        // Move to next step after persisting pegins + mnemonic links,
        // so a page refresh won't lose the associations.
        setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        // ========================================================================
        // Step 4.5: Submit Lamport Public Keys to Vault Provider
        // ========================================================================

        const provider = findProvider(primaryProvider as Hex);
        if (!provider?.url) {
          throw new Error("Vault provider has no RPC URL");
        }

        for (const result of successfulPegins) {
          try {
            await submitLamportPublicKey({
              btcTxid: result.vaultId,
              depositorBtcPubkey: result.depositorBtcPubkey,
              appContractAddress: selectedApplication,
              providerUrl: provider.url,
              getMnemonic,
              signal,
            });
          } catch (error) {
            // Re-throw abort errors so they're suppressed by the outer catch
            if (signal.aborted) throw error;
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex}: Lamport key submission failed - ${errorMsg}`;
            warnings.push(warning);
            console.error(
              "[Multi-Vault] Failed to submit Lamport key for vault",
              result.vaultId,
              ":",
              error,
            );
            // Continue with other vaults
          }
        }

        // ========================================================================
        // Step 5: Background - Sign Payout Transactions
        // (step already set above after ETH confirmation)
        // ========================================================================

        for (const result of successfulPegins) {
          try {
            setIsWaiting(true);
            const {
              context,
              vaultProviderUrl,
              preparedTransactions,
              depositorGraph,
            } = await pollAndPreparePayoutSigning({
              btcTxid: result.vaultId, // Use vaultId for payout lookup
              btcTxHex: result.btcTxHex,
              depositorBtcPubkey: result.depositorBtcPubkey,
              providerUrl: provider.url,
              providerBtcPubKey: provider.btcPubKey,
              vaultKeepers,
              universalChallengers: universalChallengerBtcPubkeys.map(
                (btcPubKey) => ({
                  btcPubKey,
                }),
              ),
              timelockPegin,
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
            // Use version-resolved values from context so that the UC/keeper
            // set matches the vault's locked versions.
            const depositorClaimerPresignatures =
              await prepareAndSignDepositorGraph({
                depositorGraph,
                depositorBtcPubkey: result.depositorBtcPubkey,
                btcWallet: confirmedBtcWallet,
                vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys:
                  context.universalChallengerBtcPubkeys,
                timelockPegin,
                getOffchainParamsByVersion,
              });

            // Submit signatures
            await submitPayoutSignatures(
              vaultProviderUrl,
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
            const warning = `Vault ${result.vaultIndex}: Payout signing failed - ${errorMsg}`;
            warnings.push(warning);
            console.error(
              "[Multi-Vault] Failed to sign or submit payouts for vault",
              result.vaultId,
              "with provider",
              provider.url,
              ":",
              error,
            );
            // Continue with other vaults
          }
        }

        setPayoutSigningProgress(null);

        // ========================================================================
        // Step 5.5: Download Vault Artifacts (per vault, sequential)
        // ========================================================================

        setCurrentStep(DepositFlowStep.ARTIFACT_DOWNLOAD);

        for (const result of successfulPegins) {
          setArtifactDownloadInfo({
            providerUrl: provider.url,
            peginTxid: result.vaultId,
            depositorPk: result.depositorBtcPubkey,
          });

          // Wait for user to download and click "Continue"
          await new Promise<void>((resolve) => {
            artifactResolverRef.current = resolve;
          });
        }

        // ========================================================================
        // Step 6: Background - Wait for Contract Verification
        // ========================================================================

        setCurrentStep(DepositFlowStep.BROADCAST_BTC);
        setIsWaiting(true);
        await Promise.all(
          successfulPegins.map((r) =>
            waitForContractVerification({ btcTxid: r.vaultId, signal }),
          ),
        );

        // ========================================================================
        // Step 7: Background - Broadcast Pegins to Bitcoin
        // ========================================================================

        setIsWaiting(false);

        for (const result of successfulPegins) {
          try {
            const allocation = plan.vaultAllocations[result.vaultIndex];

            if (allocation.fromSplit && splitTxResult) {
              // SPLIT OUTPUT: Use custom broadcast (no mempool fetch)
              await broadcastPeginWithLocalUtxo({
                fundedTxHex: result.btcTxHex,
                depositorBtcPubkey: result.depositorBtcPubkey,
                splitOutputs: splitTxResult.outputs,
                signPsbt: (psbtHex: string) =>
                  confirmedBtcWallet.signPsbt(psbtHex),
              });
            } else {
              // STANDARD: Use existing broadcast
              await broadcastBtcTransaction(
                {
                  btcTxid: result.btcTxHash,
                  depositorBtcPubkey: result.depositorBtcPubkey,
                  btcWalletProvider: confirmedBtcWallet,
                },
                confirmedEthAddress,
              );
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex}: BTC broadcast failed - ${errorMsg}`;
            warnings.push(warning);
            console.error(
              "[Multi-Vault] Failed to broadcast vault pegin",
              {
                vaultIndex: result.vaultIndex,
                btcTxHash: result.btcTxHash,
              },
              error,
            );
            // Continue with other vaults
          }
        }

        setCurrentStep(DepositFlowStep.COMPLETED);

        // Return result
        return {
          pegins: peginResults,
          batchId,
          splitTxId: splitTxResult?.txid,
          strategy: plan.strategy,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (err: unknown) {
        // Don't show error if flow was aborted (user intentionally closed modal)
        if (!signal.aborted) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(errorMsg);
          console.error("Multi-vault deposit flow error:", err);
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
      vaultKeepers,
      findProvider,
      getOffchainParamsByVersion,
      getMnemonic,
      mnemonicId,
      precomputedPlan,
    ]);

  return {
    executeMultiVaultDeposit,
    abort,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    isWaiting,
    allocationPlan,
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  };
}
