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
 * 6. Broadcast Pre-PegIn transactions to Bitcoin
 * 7. Submit Lamport keys, poll VP, sign payout transactions
 * 8. Download vault artifacts (per vault, user-driven)
 * 9. Wait for contract verification, then activate vaults (reveal HTLC secret on Ethereum)
 */

import { pushTx } from "@babylonlabs-io/ts-sdk";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  createSplitTransaction,
  createSplitTransactionPsbt,
  ensureHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { getBTCNetworkForWASM } from "@/config/pegin";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import { deriveLamportPkHash, linkPeginToMnemonic } from "@/services/lamport";
import {
  broadcastPrePeginWithLocalUtxo,
  planUtxoAllocation,
  preparePeginFromSplitOutput,
  registerSplitPeginOnChain,
  type AllocationPlan,
} from "@/services/vault";
import { prepareAndSignDepositorGraph } from "@/services/vault/depositorGraphSigningService";
import { activateVaultWithSecret } from "@/services/vault/vaultActivationService";
import {
  signPayoutTransactions,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { broadcastPrePeginTransaction } from "@/services/vault/vaultPeginBroadcastService";
import {
  addPendingPegin,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { formatBtcValue } from "@/utils/formatting";
import { hashSecret } from "@/utils/secretUtils";

import {
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
  /** Callback to retrieve the decrypted mnemonic for Lamport PK derivation
   *  and submission to the vault provider. */
  getMnemonic: () => Promise<string>;
  /** UUID of the stored mnemonic, used to record the peg-in → mnemonic
   *  mapping so the resume flow can look up the correct mnemonic. */
  mnemonicId?: string;
  /** Depositor claim value in satoshis (computed via WASM from VK/UC counts) */
  depositorClaimValue: bigint;
  /** Pre-computed allocation plan from the form (skips runtime planning) */
  precomputedPlan?: AllocationPlan;
  /** Per-vault raw HTLC secret hexes (no 0x prefix) — generated in the secret
   *  modal step. These are used as the HTLC preimages so the on-chain
   *  hashlocks match what was shown to the user. */
  htlcSecretHexes: string[];
  /** Per-vault SHA-256 secret hashes for the new peg-in flow (one per vault) */
  depositorSecretHashes?: Hex[];
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
    depositorClaimValue,
    precomputedPlan,
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
  const { config, timelockPegin, timelockRefund, getOffchainParamsByVersion } =
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
        // Step 1: Plan UTXO Allocation (use precomputed plan if available)
        // ========================================================================

        const plan =
          precomputedPlan ??
          planUtxoAllocation(
            spendableUTXOs,
            vaultAmounts,
            mempoolFeeRate,
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

          // 2a. Create and sign split transaction
          splitTxResult = await createAndSignSplitTransaction(
            plan.splitTransaction,
            confirmedBtcWallet,
          );
          // 2b. Broadcast split TX IMMEDIATELY
          try {
            await pushTx(splitTxResult.signedHex, getMempoolApiUrl());
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
        const walletClient = await getEthWalletClient(confirmedEthAddress);

        // Get mnemonic once before the loop.
        // The modal is one-time-use — calling getMnemonic() inside the loop
        // would hang on the second vault because the modal is already closed.
        const mnemonic = await getMnemonic();

        // ========================================================================
        // Step 3: Create N Pegins (1 or 2) — with POP reuse
        // ========================================================================

        setCurrentStep(DepositFlowStep.SIGN_POP);

        let capturedPopSignature: Hex | undefined;

        const peginResults: PeginCreationResult[] = [];
        const vaultErrors: string[] = [];

        for (let i = 0; i < vaultAmounts.length; i++) {
          setCurrentVaultIndex(i);

          try {
            const allocation = plan.vaultAllocations[i];

            const peginAmount = vaultAmounts[i];

            // CRITICAL: Use different path for split outputs vs existing UTXOs
            let peginResult: {
              btcTxid: string;
              ethTxHash: Hex;
              vaultId: Hex;
              fundedPrePeginTxHex: string;
              peginTxHex: string;
              selectedUTXOs: UTXO[];
              fee: bigint;
              htlcSecretHex: string;
            };
            let depositorBtcPubkey: string;

            if (allocation.fromSplit && splitTxResult) {
              // ================================================================
              // SPLIT OUTPUT PATH: Use custom pegin builder (no mempool fetch)
              // ================================================================

              // Use output from split transaction (now on-chain)
              const splitOutput =
                splitTxResult.outputs[allocation.splitTxOutputIndex!];
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

              // Use the secret shown to the user in the secret modal
              const splitHtlcSecretHex = htlcSecretHexes[i];
              const splitHashH = hashSecret(splitHtlcSecretHex).slice(2);

              const prepareResult = await preparePeginFromSplitOutput({
                pegInAmount: peginAmount,
                protocolFeeRate: config.offchainParams.feeRate,
                mempoolFeeRate,
                changeAddress: confirmedBtcAddress,
                vaultProviderAddress: primaryProvider,
                depositorBtcPubkey,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                timelockPegin,
                timelockRefund,
                hashH: splitHashH,
                councilQuorum: config.offchainParams.councilQuorum,
                councilSize: config.offchainParams.securityCouncilKeys.length,
                splitOutput: utxoToUse,
                signPsbt: (psbtHex: string) =>
                  confirmedBtcWallet.signPsbt(psbtHex),
              });

              // Derive Lamport keypair and compute PK hash (before ETH tx)
              const splitLamportPkHash = await deriveLamportPkHash(
                mnemonic,
                prepareResult.btcTxHash,
                prepareResult.depositorBtcPubkey,
                selectedApplication,
              );

              const registrationResult = await registerSplitPeginOnChain(
                confirmedBtcWallet,
                walletClient,
                {
                  depositorBtcPubkey: prepareResult.depositorBtcPubkey,
                  unsignedPrePeginTxHex: prepareResult.fundedPrePeginTxHex,
                  peginTxHex: prepareResult.peginTxHex,
                  hashlock: ensureHexPrefix(splitHashH),
                  vaultProviderAddress: primaryProvider,
                  depositorPayoutBtcAddress: confirmedBtcAddress,
                  depositorLamportPkHash: splitLamportPkHash,
                  preSignedBtcPopSignature: capturedPopSignature,
                  onPopSigned: () =>
                    setCurrentStep(DepositFlowStep.SUBMIT_PEGIN),
                  depositorSecretHash: depositorSecretHashes?.[i],
                },
              );

              // Capture PoP signature from first vault for reuse
              capturedPopSignature ??= registrationResult.btcPopSignature;

              peginResult = {
                btcTxid: prepareResult.btcTxHash,
                ethTxHash: registrationResult.ethTxHash,
                vaultId: registrationResult.vaultId,
                fundedPrePeginTxHex: prepareResult.fundedPrePeginTxHex,
                peginTxHex: prepareResult.peginTxHex,
                selectedUTXOs: prepareResult.selectedUTXOs,
                fee: prepareResult.fee,
                htlcSecretHex: splitHtlcSecretHex,
              };
            } else {
              // ================================================================
              // STANDARD PATH: Prepare + register pegin (mempool OK)
              // ================================================================

              // Validate UTXOs are available
              if (allocation.utxos.length === 0) {
                throw new Error(`No UTXO available for vault ${i}`);
              }

              // Use the secret shown to the user in the secret modal
              const htlcSecretHex = htlcSecretHexes[i];
              const hashH = hashSecret(htlcSecretHex).slice(2);

              const prepared = await preparePegin({
                btcWalletProvider: confirmedBtcWallet,
                walletClient,
                amount: peginAmount,
                protocolFeeRate: config.offchainParams.feeRate,
                mempoolFeeRate,
                btcAddress: confirmedBtcAddress,
                selectedProviders,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                timelockPegin,
                timelockRefund,
                hashH,
                councilQuorum: config.offchainParams.councilQuorum,
                councilSize: config.offchainParams.securityCouncilKeys.length,
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
                peginTxHex: prepared.peginTxHex,
                fundedPrePeginTxHex: prepared.fundedPrePeginTxHex,
                hashlock: ensureHexPrefix(hashH),
                vaultProviderAddress: selectedProviders[0],
                depositorPayoutBtcAddress: confirmedBtcAddress,
                depositorLamportPkHash: lamportPkHash,
                preSignedBtcPopSignature: capturedPopSignature,
                onPopSigned: () => setCurrentStep(DepositFlowStep.SUBMIT_PEGIN),
                depositorSecretHash: depositorSecretHashes?.[i],
              });

              // Capture PoP signature from first vault for reuse
              capturedPopSignature ??= registration.btcPopSignature;

              depositorBtcPubkey = prepared.depositorBtcPubkey;
              peginResult = {
                btcTxid: registration.btcTxid,
                ethTxHash: registration.ethTxHash,
                vaultId: registration.btcTxid as Hex,
                fundedPrePeginTxHex: prepared.fundedPrePeginTxHex,
                peginTxHex: prepared.peginTxHex,
                selectedUTXOs: prepared.selectedUTXOs,
                fee: prepared.fee,
                htlcSecretHex,
              };
            }

            // Store result
            peginResults.push({
              vaultIndex: i,
              btcTxHash: peginResult.btcTxid as Hex,
              ethTxHash: peginResult.ethTxHash,
              vaultId: peginResult.vaultId as Hex,
              fundedPrePeginTxHex: peginResult.fundedPrePeginTxHex,
              peginTxHex: peginResult.peginTxHex,
              selectedUTXOs: peginResult.selectedUTXOs,
              fee: peginResult.fee,
              depositorBtcPubkey,
              htlcSecretHex: peginResult.htlcSecretHex,
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error(err instanceof Error ? err : new Error(String(err)), {
              data: {
                context: `[Multi-Vault] Pegin creation failed for vault ${i}`,
              },
            });

            vaultErrors.push(`Vault ${i}: ${errorMsg}`);

            // Continue with next vault (independent failures)
          }
        }

        setCurrentVaultIndex(null);

        // If ALL pegin creations failed, abort — don't silently show "completed"
        if (peginResults.length === 0 && vaultErrors.length > 0) {
          throw new Error(
            `All pegin creations failed: ${vaultErrors.join("; ")}`,
          );
        }

        // Surface partial failures as warnings so the user knows
        if (vaultErrors.length > 0) {
          warnings.push(...vaultErrors);
        }

        // ========================================================================
        // Step 4: Save Pegins to Storage
        // ========================================================================

        if (peginResults.length > 0) {
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
              id: peginResult.vaultId, // PRIMARY ID (vaultId from contract)
              btcTxHash: peginResult.btcTxHash, // For compatibility
              amount: formatBtcValue(satoshiToBtcNumber(vaultAmount)), // BTC format
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

        const provider = findProvider(primaryProvider as Hex);
        if (!provider) {
          throw new Error("Vault provider not found");
        }

        // ========================================================================
        // Step 4: Broadcast Pre-PegIn transactions to Bitcoin
        // Per spec, broadcast happens right after ETH submission so the VP
        // can monitor the Pre-PegIn on-chain before BaBe setup.
        // ========================================================================

        setCurrentStep(DepositFlowStep.BROADCAST_PRE_PEGIN);

        const broadcastedVaultIds = new Set<string>();

        for (const result of peginResults) {
          try {
            const allocation = plan.vaultAllocations[result.vaultIndex];

            if (allocation.fromSplit && splitTxResult) {
              // SPLIT OUTPUT: Use custom broadcast (no mempool fetch)
              await broadcastPrePeginWithLocalUtxo({
                fundedPrePeginTxHex: result.fundedPrePeginTxHex,
                depositorBtcPubkey: result.depositorBtcPubkey,
                splitOutputs: splitTxResult.outputs,
                signPsbt: (psbtHex: string) =>
                  confirmedBtcWallet.signPsbt(psbtHex),
              });
            } else {
              // STANDARD: Broadcast directly from memory (no indexer re-fetch)
              await broadcastPrePeginTransaction({
                unsignedTxHex: result.fundedPrePeginTxHex,
                btcWalletProvider: {
                  signPsbt: (psbtHex: string) =>
                    confirmedBtcWallet.signPsbt(psbtHex),
                },
                depositorBtcPubkey: result.depositorBtcPubkey,
              });
            }

            broadcastedVaultIds.add(result.vaultId);

            // Update localStorage status after successful broadcast
            updatePendingPeginStatus(
              confirmedEthAddress,
              result.vaultId,
              LocalStorageStatus.CONFIRMING,
            );
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex}: BTC broadcast failed - ${errorMsg}`;
            warnings.push(warning);
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                data: {
                  context: "[Multi-Vault] Failed to broadcast vault pegin",
                  vaultIndex: result.vaultIndex,
                  btcTxHash: result.btcTxHash,
                },
              },
            );
            // Continue with other vaults
          }
        }

        // Only continue the flow for vaults whose Pre-PegIn was actually broadcast.
        // Failed-broadcast vaults will never reach VERIFIED on-chain, so polling
        // for them would hang until the abort signal fires.
        const broadcastedResults = peginResults.filter((r) =>
          broadcastedVaultIds.has(r.vaultId),
        );

        if (broadcastedResults.length === 0) {
          throw new Error(
            "All vault broadcasts failed. Check the warnings for details.",
          );
        }

        // ========================================================================
        // Step 5: Submit Lamport Public Keys to Vault Provider
        // ========================================================================

        setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
        setIsWaiting(true);

        for (const result of broadcastedResults) {
          try {
            await submitLamportPublicKey({
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
            const warning = `Vault ${result.vaultIndex}: Lamport key submission failed - ${errorMsg}`;
            warnings.push(warning);
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                data: {
                  context:
                    "[Multi-Vault] Failed to submit Lamport key for vault",
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
            const warning = `Vault ${result.vaultIndex}: Payout signing failed - ${errorMsg}`;
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
            const warning = `Vault ${result.vaultIndex}: Activation failed - ${errorMsg}`;
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
          splitTxId: splitTxResult?.txid,
          strategy: plan.strategy,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (err: unknown) {
        // Don't show error if flow was aborted (user intentionally closed modal)
        if (!signal.aborted) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(errorMsg);
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
      depositorClaimValue,
      config,
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
    allocationPlan,
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  };
}
