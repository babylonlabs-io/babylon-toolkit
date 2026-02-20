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
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { getBTCNetworkForWASM } from "@/config/pegin";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useUTXOs } from "@/hooks/useUTXOs";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import {
  broadcastPeginWithLocalUtxo,
  planUtxoAllocation,
  preparePeginFromSplitOutput,
  registerSplitPeginOnChain,
  type AllocationPlan,
} from "@/services/vault";
import {
  signPayout,
  signPayoutOptimistic,
} from "@/services/vault/vaultPayoutSignatureService";
import { addPendingPegin } from "@/storage/peginStorage";

import {
  broadcastBtcTransaction,
  DepositStep,
  getEthWalletClient,
  pollAndPreparePayoutSigning,
  submitPayoutSignatures,
  submitPeginAndWait,
  waitForContractVerification,
  type DepositUtxo,
} from "./depositFlowSteps";
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
  btcWalletProvider: BitcoinWallet;
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
}

export interface UseMultiVaultDepositFlowReturn {
  /** Execute the multi-vault deposit flow */
  executeMultiVaultDeposit: () => Promise<MultiVaultDepositResult | null>;
  /** Current step in the deposit flow */
  currentStep: DepositStep;
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
  } = params;

  // State
  const [currentStep, setCurrentStep] = useState<DepositStep>(
    DepositStep.SIGN_POP,
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

  // Hooks
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;
  const {
    spendableUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);
  const { latestUniversalChallengers } = useProtocolParamsContext();
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);

  // ============================================================================
  // Main Execution Function
  // ============================================================================

  const executeMultiVaultDeposit =
    useCallback(async (): Promise<MultiVaultDepositResult | null> => {
      setProcessing(true);
      setError(null);
      setCurrentStep(DepositStep.SIGN_POP);

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

        // Generate batch ID for tracking
        const batchId = uuidv4();

        // ========================================================================
        // Step 1: Plan UTXO Allocation
        // ========================================================================

        const plan = planUtxoAllocation(
          spendableUTXOs,
          vaultAmounts,
          feeRate,
          confirmedBtcAddress,
        );

        setAllocationPlan(plan);

        // ========================================================================
        // Step 2: Create and Broadcast Split Transaction (if needed)
        // ========================================================================

        let splitTxResult: SplitTxSignResult | null = null;

        if (plan.needsSplit && plan.splitTransaction) {
          // 2a. Create and sign split transaction
          splitTxResult = await createAndSignSplitTransaction(
            plan.splitTransaction,
            btcWalletProvider,
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
        // Step 3: Create N Pegins (1 or 2)
        // ========================================================================

        setCurrentStep(DepositStep.SUBMIT_PEGIN);

        const peginResults: PeginCreationResult[] = [];

        for (let i = 0; i < vaultAmounts.length; i++) {
          setCurrentVaultIndex(i);

          try {
            const allocation = plan.vaultAllocations[i];

            // Get UTXO for this vault
            let utxoToUse: UTXO;
            if (allocation.fromSplit && splitTxResult) {
              // Use output from split transaction (now on-chain)
              const splitOutput =
                splitTxResult.outputs[allocation.splitTxOutputIndex!];
              utxoToUse = {
                txid: splitOutput.txid,
                vout: splitOutput.vout,
                value: splitOutput.value,
                scriptPubKey: splitOutput.scriptPubKey,
              };
            } else if (allocation.utxos.length > 0) {
              // Use existing UTXOs (MULTI_INPUT: may be multiple UTXOs per vault)
              utxoToUse = allocation.utxos[0]!; // primary UTXO (for type compat; full array used below)
            } else {
              throw new Error(`No UTXO available for vault ${i}`);
            }

            const walletClient = await getEthWalletClient(confirmedEthAddress);
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

            if (allocation.fromSplit) {
              // ================================================================
              // SPLIT OUTPUT PATH: Use custom pegin builder (no mempool fetch)
              // ================================================================

              // Extract depositor pubkey
              const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
              depositorBtcPubkey =
                publicKeyHex.length === 66
                  ? publicKeyHex.slice(2) // Strip first byte (02 or 03) → x-only
                  : publicKeyHex; // Already x-only

              const prepareResult = await preparePeginFromSplitOutput({
                pegInAmount: peginAmount,
                feeRate,
                changeAddress: confirmedBtcAddress,
                vaultProviderAddress: selectedProviders[0] as Address,
                depositorBtcPubkey,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                splitOutput: utxoToUse,
              });

              const registrationResult = await registerSplitPeginOnChain(
                btcWalletProvider,
                walletClient,
                {
                  depositorBtcPubkey: prepareResult.depositorBtcPubkey,
                  unsignedBtcTx: prepareResult.fundedTxHex,
                  vaultProviderAddress: selectedProviders[0] as Address,
                },
              );

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
              // STANDARD PATH: Use existing submitPeginAndWait (mempool OK)
              // ================================================================

              const result = await submitPeginAndWait({
                btcWalletProvider,
                walletClient,
                amount: peginAmount,
                feeRate,
                btcAddress: confirmedBtcAddress,
                selectedProviders,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                confirmedUTXOs: allocation.utxos, // MULTI_INPUT: pass all assigned UTXOs for this vault
                reservedUtxoRefs: [],
              });

              depositorBtcPubkey = result.depositorBtcPubkey;
              peginResult = {
                btcTxid: result.btcTxid,
                ethTxHash: result.ethTxHash,
                vaultId: result.btcTxid as Hex, // In standard path, btcTxid = vaultId
                btcTxHex: result.btcTxHex,
                selectedUTXOs: result.selectedUTXOs,
                fee: result.fee,
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
              providerIds: [selectedProviders[0]],
              applicationController: selectedApplication,
              batchId, // Links to batch
              splitTxId: splitTxResult?.txid, // Split TX ID (if used)
              batchIndex: peginResult.vaultIndex + 1, // 1-based position for UI display
              batchTotal: vaultAmounts.length, // Total vaults in this batch
            });
          }
        }

        // ========================================================================
        // Step 5: Background - Sign Payout Transactions
        // ========================================================================

        setCurrentStep(DepositStep.SIGN_PAYOUTS);

        const provider = findProvider(selectedProviders[0] as Hex);
        if (!provider?.url) {
          throw new Error("Vault provider has no RPC URL");
        }

        for (const result of successfulPegins) {
          try {
            const { context, vaultProviderUrl, preparedTransactions } =
              await pollAndPreparePayoutSigning({
                btcTxid: result.vaultId, // Use vaultId for payout lookup
                btcTxHex: result.btcTxHex,
                depositorBtcPubkey: result.depositorBtcPubkey,
                providerUrl: provider.url,
                providerBtcPubKey: provider.btcPubKey,
                vaultKeepers,
                universalChallengers: latestUniversalChallengers,
              });

            // Sign payouts
            const signatures: Record<
              string,
              {
                payout_optimistic_signature: string;
                payout_signature: string;
              }
            > = {};

            for (const tx of preparedTransactions) {
              const payoutOptimisticSig = await signPayoutOptimistic(
                btcWalletProvider,
                context,
                tx,
              );
              const payoutSig = await signPayout(
                btcWalletProvider,
                context,
                tx,
              );

              signatures[tx.claimerPubkeyXOnly] = {
                payout_optimistic_signature: payoutOptimisticSig,
                payout_signature: payoutSig,
              };
            }

            // Submit signatures
            await submitPayoutSignatures(
              vaultProviderUrl,
              result.vaultId,
              result.depositorBtcPubkey,
              signatures,
              confirmedEthAddress,
            );
          } catch (error) {
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

        // ========================================================================
        // Step 6: Background - Wait for Contract Verification
        // ========================================================================

        await Promise.all(
          successfulPegins.map((r) =>
            waitForContractVerification({ btcTxid: r.vaultId }),
          ),
        );

        // ========================================================================
        // Step 7: Background - Broadcast Pegins to Bitcoin
        // ========================================================================

        setCurrentStep(DepositStep.BROADCAST_BTC);

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
                  btcWalletProvider.signPsbt(psbtHex),
              });
            } else {
              // STANDARD: Use existing broadcast
              await broadcastBtcTransaction(
                {
                  btcTxid: result.btcTxHash,
                  depositorBtcPubkey: result.depositorBtcPubkey,
                  btcWalletProvider,
                },
                confirmedEthAddress,
              );
            }
          } catch (error) {
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

        setCurrentStep(DepositStep.COMPLETED);

        // Return result
        return {
          pegins: peginResults,
          batchId,
          splitTxId: splitTxResult?.txid,
          strategy: plan.strategy,
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        return null;
      } finally {
        setProcessing(false);
        setIsWaiting(false);
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
      btcAddress,
      spendableUTXOs,
      isUTXOsLoading,
      utxoError,
      latestUniversalChallengers,
      vaultKeepers,
      findProvider,
    ]);

  return {
    executeMultiVaultDeposit,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    isWaiting,
    allocationPlan,
  };
}
