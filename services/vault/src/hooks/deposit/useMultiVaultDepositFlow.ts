/**
 * Multi-Vault Deposit Flow Hook (POC)
 *
 * Orchestrates the creation of multiple vaults in a single flow:
 * 1. Plan UTXO allocation (split vs multi-UTXO)
 * 2. Create split transaction if needed
 * 3. Create N peg-in transactions (one per vault)
 * 4. Submit all to Ethereum (sequential)
 * 5. Sign payout transactions for all vaults
 * 6. Broadcast split tx + all peg-ins to Bitcoin
 *
 * This is a POC implementation with verbose logging.
 */

import { getBTCNetwork } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Network, UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { createSplitTransaction } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useBTCWallet } from "@/context/wallet";
import { useUTXOs } from "@/hooks/useUTXOs";
import { planUtxoAllocation } from "@/services/vault/utxoAllocationService";
import {
  broadcastPeginWithLocalUtxo,
  preparePeginFromSplitOutput,
  registerSplitPeginOnChain,
} from "@/services/vault/vaultSplitPeginService";
import { addPendingPegin } from "@/storage/peginStorage";
import type {
  AllocationPlan,
  MultiVaultDepositResult,
  PeginCreationResult,
} from "@/types/multiVault";

import {
  broadcastBtcTransaction,
  DepositStep,
  getEthWalletClient,
  pollAndPreparePayoutSigning,
  submitPayoutSignatures,
  submitPeginAndWait,
  waitForContractVerification,
} from "./depositFlowSteps";
import { waitForEthConfirmation } from "./depositFlowSteps/ethereumSubmit";
import { useVaultProviders } from "./useVaultProviders";

export interface UseMultiVaultDepositFlowParams {
  vaultAmounts: bigint[]; // Amount for each vault
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
}

export interface UseMultiVaultDepositFlowReturn {
  executeMultiVaultDeposit: () => Promise<MultiVaultDepositResult | null>;
  currentStep: DepositStep;
  currentVaultIndex: number | null; // Which vault is currently being processed
  processing: boolean;
  error: string | null;
  isWaiting: boolean;
  allocationPlan: AllocationPlan | null;
}

/**
 * Hook for multi-vault deposit flow
 *
 * This orchestrates the complete multi-vault creation process.
 */
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
  const { address: btcAddress } = useBTCWallet();
  const { spendableUTXOs } = useUTXOs(btcAddress);
  const { findProvider, vaultKeepers } = useVaultProviders(selectedApplication);
  const { latestUniversalChallengers } = useProtocolParamsContext();

  const executeMultiVaultDeposit =
    useCallback(async (): Promise<MultiVaultDepositResult | null> => {
      try {
        setProcessing(true);
        setError(null);

        // Strip "0x" prefix if present for validation
        const vaultProviderPubkeyStripped = vaultProviderBtcPubkey.startsWith(
          "0x",
        )
          ? vaultProviderBtcPubkey.slice(2)
          : vaultProviderBtcPubkey;

        // Validate required parameters (should be 64-char x-only pubkey)
        if (
          !vaultProviderPubkeyStripped ||
          vaultProviderPubkeyStripped.length !== 64
        ) {
          throw new Error(
            `Invalid vault provider BTC pubkey: "${vaultProviderBtcPubkey}" (original length: ${vaultProviderBtcPubkey.length}, stripped: ${vaultProviderPubkeyStripped.length}). Expected 64-char hex string (with or without 0x prefix).`,
          );
        }

        if (!btcAddress || !depositorEthAddress) {
          throw new Error("Wallet not connected");
        }

        if (!spendableUTXOs || spendableUTXOs.length === 0) {
          throw new Error("No spendable UTXOs available");
        }

        // Generate batch ID for tracking related vaults
        const batchId = uuidv4();
        console.log(`[Multi-Vault] Batch ID: ${batchId}`);

        // ========================================================================
        // Step 1: Plan UTXO Allocation
        // ========================================================================
        console.log("[Multi-Vault] Step 1: Planning UTXO allocation...");
        setCurrentStep(DepositStep.SIGN_POP);

        const plan = planUtxoAllocation(
          spendableUTXOs,
          vaultAmounts,
          feeRate,
          btcAddress,
        );

        setAllocationPlan(plan);
        console.log("[Multi-Vault] Allocation plan:", plan);

        // ========================================================================
        // Step 0/2: Create and Sign Split Transaction if Needed
        // ========================================================================
        // CRITICAL: Split transaction is signed NOW (Step 0, before any PoP signing)
        // but NOT broadcasted yet. It will be broadcasted between Step 5 and Step 6,
        // right before we broadcast the peg-in transactions.
        //
        // This allows us to:
        // 1. Use the unconfirmed split outputs for peg-in creation (Steps 3-5)
        // 2. Broadcast split TX + all peg-in TXs together at the end (Steps 5.5-6)
        //
        // The peg-in creation (Steps 3-5) does NOT fetch from mempool, so it works
        // fine with unbroadcast UTXOs. Only the broadcast step (Step 6) needs the
        // split TX to be on-chain, which is why we broadcast it in Step 5.5.
        // ========================================================================
        let splitTxResult: Awaited<
          ReturnType<typeof createAndSignSplitTransaction>
        > | null = null;

        if (plan.needsSplit && plan.splitTransaction) {
          console.log(
            "[Multi-Vault] Step 0: Signing split transaction (NOT broadcasting yet)...",
          );

          splitTxResult = await createAndSignSplitTransaction(
            plan.splitTransaction,
            btcWalletProvider,
          );

          console.log(
            `[Multi-Vault] Split transaction signed: ${splitTxResult.txid}`,
          );

          // Broadcast split TX IMMEDIATELY to Bitcoin network
          // This makes split outputs available on-chain for pegin transactions
          console.log(
            "[Multi-Vault] Broadcasting split transaction to Bitcoin...",
          );
          const { pushTx } = await import("@babylonlabs-io/ts-sdk");
          const { getMempoolApiUrl } = await import("@/clients/btc/config");

          try {
            const broadcastTxid = await pushTx(
              splitTxResult.signedHex,
              getMempoolApiUrl(),
            );
            console.log(
              `[Multi-Vault] Split TX broadcast complete: ${broadcastTxid}`,
            );
          } catch (error) {
            console.error("[Multi-Vault] Failed to broadcast split TX:", error);
            throw new Error(
              `Failed to broadcast split transaction: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          console.log(
            `[Multi-Vault] Split TX broadcast complete: ${splitTxResult.txid}`,
          );
          // Batch info will be saved later with individual pegins
        } else {
          console.log("[Multi-Vault] Step 0: No split transaction needed");
        }

        // ========================================================================
        // Step 3: Create N Peg-ins
        // ========================================================================
        console.log("[Multi-Vault] Step 3: Creating peg-in transactions...");

        const peginResults: PeginCreationResult[] = [];

        for (let i = 0; i < vaultAmounts.length; i++) {
          setCurrentVaultIndex(i);
          console.log(`[Multi-Vault] === Starting vault ${i} creation ===`);
          console.log(
            `[Multi-Vault] Creating peg-in ${i + 1}/${vaultAmounts.length}...`,
          );

          try {
            const allocation = plan.vaultAllocations[i];

            // Get UTXO for this vault
            let utxoToUse: UTXO;
            if (allocation.fromSplit && splitTxResult) {
              // Use output from split transaction
              const splitOutput =
                splitTxResult.outputs[allocation.splitTxOutputIndex!];
              utxoToUse = {
                txid: splitOutput.txid,
                vout: splitOutput.vout,
                value: splitOutput.value,
                scriptPubKey: splitOutput.scriptPubKey,
              };
              console.log(
                `[Multi-Vault] Vault ${i}: Using split tx output ${allocation.splitTxOutputIndex}`,
              );
            } else if (allocation.utxo) {
              // Use existing UTXO
              utxoToUse = allocation.utxo;
              console.log(
                `[Multi-Vault] Vault ${i}: Using existing UTXO ${utxoToUse.txid.slice(0, 8)}...`,
              );
            } else {
              throw new Error(`No UTXO available for vault ${i}`);
            }

            // Get ETH wallet client
            const walletClient = await getEthWalletClient(depositorEthAddress);

            // Determine amount: always use the user's requested vault amount
            // For split outputs, the UTXO value includes extra for pegin fees, which will be deducted
            const peginAmount = vaultAmounts[i];

            console.log(
              `[Multi-Vault] Vault ${i}: Requested vault amount: ${peginAmount} sats (UTXO value: ${utxoToUse.value})`,
            );

            // CRITICAL: Use different path for split outputs vs existing UTXOs
            let peginResult: {
              btcTxid: string;
              ethTxHash: Hex;
              btcTxHex: string;
              selectedUTXOs: UTXO[];
              fee: bigint;
            };
            let depositorBtcPubkey: string;

            if (allocation.fromSplit) {
              // ================================================================
              // SPLIT OUTPUT PATH: Use custom pegin builder (no mempool fetch)
              // ================================================================
              console.log(
                `[Multi-Vault] Vault ${i}: Using SPLIT OUTPUT path (custom pegin builder)`,
              );

              // Step 1: Prepare pegin using local split output data
              const prepareResult = await preparePeginFromSplitOutput({
                pegInAmount: peginAmount,
                feeRate,
                changeAddress: btcAddress,
                vaultProviderAddress: selectedProviders[0] as Address,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                splitOutput: utxoToUse,
                btcWallet: btcWalletProvider,
              });

              depositorBtcPubkey = prepareResult.depositorBtcPubkey;

              // Step 2: Register on Ethereum
              const registrationResult = await registerSplitPeginOnChain({
                depositorBtcPubkey: prepareResult.depositorBtcPubkey,
                unsignedBtcTx: prepareResult.fundedTxHex,
                vaultProviderAddress: selectedProviders[0] as Address,
                btcWallet: btcWalletProvider,
                ethWallet: walletClient,
                onPopSigned: () => {
                  console.log(`[Multi-Vault] Vault ${i}: PoP signed`);
                },
              });

              // Step 3: Wait for ETH confirmation
              console.log(
                `[Multi-Vault] Vault ${i}: Waiting for ETH confirmation...`,
              );
              await waitForEthConfirmation(registrationResult.ethTxHash);
              console.log(
                `[Multi-Vault] Vault ${i}: ETH confirmation received`,
              );

              peginResult = {
                btcTxid: prepareResult.btcTxHash,
                ethTxHash: registrationResult.ethTxHash,
                btcTxHex: prepareResult.fundedTxHex,
                selectedUTXOs: prepareResult.selectedUTXOs,
                fee: prepareResult.fee,
              };
            } else {
              // ================================================================
              // STANDARD PATH: Use existing submitPeginAndWait (mempool OK)
              // ================================================================
              console.log(
                `[Multi-Vault] Vault ${i}: Using STANDARD path (existing UTXO)`,
              );

              const result = await submitPeginAndWait({
                btcWalletProvider,
                walletClient,
                amount: peginAmount,
                feeRate,
                btcAddress,
                selectedProviders,
                vaultProviderBtcPubkey,
                vaultKeeperBtcPubkeys,
                universalChallengerBtcPubkeys,
                confirmedUTXOs: [utxoToUse], // Single UTXO per vault
                reservedUtxoRefs: [], // No reservations in multi-vault flow
                onPopSigned: () => {
                  console.log(`[Multi-Vault] Vault ${i}: PoP signed`);
                },
              });

              depositorBtcPubkey = result.depositorBtcPubkey;
              peginResult = {
                btcTxid: result.btcTxid,
                ethTxHash: result.ethTxHash,
                btcTxHex: result.btcTxHex,
                selectedUTXOs: result.selectedUTXOs,
                fee: result.fee,
              };
            }

            peginResults.push({
              vaultIndex: i,
              btcTxHash: peginResult.btcTxid as Hex,
              ethTxHash: peginResult.ethTxHash,
              btcTxHex: peginResult.btcTxHex,
              selectedUTXOs: peginResult.selectedUTXOs,
              fee: peginResult.fee,
              depositorBtcPubkey,
            });

            console.log(`[Multi-Vault] === Vault ${i} succeeded ===`);
            console.log(
              `[Multi-Vault] Vault ${i}: Peg-in created successfully`,
              {
                btcTxHash: peginResult.btcTxid,
                ethTxHash: peginResult.ethTxHash,
              },
            );
          } catch (err: unknown) {
            // Log raw error first to see actual type and structure
            console.error(`[Multi-Vault] === Vault ${i} FAILED ===`);
            console.error(`[Multi-Vault] Vault ${i}: CAUGHT ERROR (raw):`, err);
            console.error(`[Multi-Vault] Vault ${i}: Error type:`, typeof err);
            console.error(
              `[Multi-Vault] Vault ${i}: Error constructor:`,
              (err as any)?.constructor?.name,
            );

            // Try to extract message from any error type
            let errorMsg = "Unknown error";
            let errorStack = "";

            if (err instanceof Error) {
              errorMsg = err.message;
              errorStack = err.stack || "";
              console.error(
                `[Multi-Vault] Vault ${i}: Error is instance of Error`,
              );
            } else if (typeof err === "string") {
              errorMsg = err;
              console.error(
                `[Multi-Vault] Vault ${i}: Error is a string: "${err}"`,
              );
            } else if (err && typeof err === "object") {
              try {
                errorMsg = JSON.stringify(err, null, 2);
                console.error(
                  `[Multi-Vault] Vault ${i}: Error is an object:`,
                  errorMsg,
                );
              } catch {
                errorMsg = String(err);
                console.error(
                  `[Multi-Vault] Vault ${i}: Error object (toString):`,
                  errorMsg,
                );
              }
            } else {
              errorMsg = String(err);
              console.error(
                `[Multi-Vault] Vault ${i}: Error (converted to string):`,
                errorMsg,
              );
            }

            console.error(
              `[Multi-Vault] Vault ${i}: Extracted message:`,
              errorMsg,
            );
            console.error(`[Multi-Vault] Vault ${i}: Stack:`, errorStack);

            // TODO: Handle partial failures
            // For now, add error to result and continue
            peginResults.push({
              vaultIndex: i,
              btcTxHash: "0x" as Hex,
              ethTxHash: "0x" as Hex,
              btcTxHex: "",
              selectedUTXOs: [],
              fee: 0n,
              depositorBtcPubkey: "",
              error: errorMsg,
            });
          }
        }

        setCurrentVaultIndex(null);

        // Calculate successful peg-ins once for use in multiple steps below
        const successfulPegins = peginResults.filter((r) => !r.error);

        // ========================================================================
        // MODAL CLOSES HERE - User sees success, background work continues
        // ========================================================================
        console.log(
          "[Multi-Vault] ETH transactions complete - MODAL WILL CLOSE",
        );
        console.log(
          "[Multi-Vault] Continuing with payout signing in background...",
        );
        setCurrentStep(DepositStep.COMPLETED);

        // Save pegins to storage IMMEDIATELY so they appear in table with batch info
        if (successfulPegins.length > 0 && depositorEthAddress) {
          // Save pegins to storage (with batchId and splitTxId)
          for (const peginResult of successfulPegins) {
            const vaultAmount = vaultAmounts[peginResult.vaultIndex];
            addPendingPegin(depositorEthAddress, {
              id: peginResult.ethTxHash,
              btcTxHash: peginResult.btcTxHash,
              amount: (Number(vaultAmount) / 100000000).toFixed(8), // Fix decimal conversion
              providerIds: [selectedProviders[0]],
              applicationController: selectedApplication,
              batchId, // Links to batch
              splitTxId: splitTxResult?.txid, // Add split TX ID directly
            });
          }
          console.log(
            `[Multi-Vault] Saved ${successfulPegins.length} pegins to storage`,
          );
        }

        // ========================================================================
        // Background Step 4: Sign Payout Transactions for All Vaults
        // ========================================================================
        console.log(
          "[Multi-Vault] Background Step 4: Signing payout transactions...",
        );

        const provider = findProvider(selectedProviders[0] as Hex);
        if (!provider?.url) {
          throw new Error("Vault provider has no RPC URL");
        }

        for (let i = 0; i < peginResults.length; i++) {
          const result = peginResults[i];

          if (result.error) {
            console.log(
              `[Multi-Vault] Skipping payout signing for failed vault ${i}`,
            );
            continue;
          }

          console.log(
            `[Multi-Vault] Background: Signing payouts for vault ${i}...`,
          );

          try {
            const { context, vaultProviderUrl, preparedTransactions } =
              await pollAndPreparePayoutSigning({
                btcTxid: result.btcTxHash,
                btcTxHex: result.btcTxHex,
                depositorBtcPubkey: result.depositorBtcPubkey,
                providerUrl: provider.url,
                providerBtcPubKey: provider.btcPubKey,
                vaultKeepers: vaultKeepers.map((vk) => ({
                  btcPubKey: vk.btcPubKey,
                })),
                universalChallengers: latestUniversalChallengers.map((uc) => ({
                  btcPubKey: uc.btcPubKey,
                })),
              });

            // Sign payout transactions
            // TODO: Add progress tracking for payouts
            const { signPayout, signPayoutOptimistic } = await import(
              "@/services/vault/vaultPayoutSignatureService"
            );

            const signatures: Record<
              string,
              { payout_optimistic_signature: string; payout_signature: string }
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
              result.btcTxHash,
              result.depositorBtcPubkey,
              signatures,
              depositorEthAddress,
            );

            console.log(
              `[Multi-Vault] Background: Vault ${i} payout signatures submitted`,
            );
          } catch (err) {
            console.error(
              `[Multi-Vault] Background: Vault ${i} payout signing failed -`,
              err,
            );
            // Continue with other vaults
          }
        }

        // ========================================================================
        // Background Step 5: Wait for Contract Verification
        // ========================================================================
        console.log(
          "[Multi-Vault] Background Step 5: Waiting for contract verification...",
        );

        await Promise.all(
          peginResults
            .filter((r) => !r.error)
            .map((r) => waitForContractVerification({ btcTxid: r.btcTxHash })),
        );

        // ========================================================================
        // Background Step 6: Broadcast Peg-in Transactions to Bitcoin
        // ========================================================================
        console.log(
          "[Multi-Vault] Background Step 6: Broadcasting peg-ins to Bitcoin...",
        );

        // NOTE: Split TX was already broadcast immediately after signing (Step 0)
        // Pegin TXs can now reference on-chain split outputs
        if (splitTxResult) {
          console.log(
            `[Multi-Vault] Split TX already on-chain: ${splitTxResult.txid}`,
          );
        }

        // Broadcast all peg-in transactions
        for (let i = 0; i < peginResults.length; i++) {
          const result = peginResults[i];

          if (result.error) {
            console.log(
              `[Multi-Vault] Skipping broadcast for failed vault ${i}`,
            );
            continue;
          }

          console.log(
            `[Multi-Vault] Background: Broadcasting peg-in ${i + 1}/${peginResults.length}...`,
          );

          try {
            // Check if this vault was created from split output
            const allocation = plan.vaultAllocations[i];

            if (allocation.fromSplit && splitTxResult) {
              // ================================================================
              // SPLIT OUTPUT BROADCAST: Use custom broadcast (no mempool fetch)
              // ================================================================
              console.log(
                `[Multi-Vault] Background: Vault ${i} using SPLIT OUTPUT broadcast (local UTXO data)`,
              );

              const broadcastTxId = await broadcastPeginWithLocalUtxo({
                fundedTxHex: result.btcTxHex,
                depositorBtcPubkey: result.depositorBtcPubkey,
                splitOutputs: splitTxResult.outputs, // All split outputs for lookup
                btcWallet: btcWalletProvider,
              });

              console.log(
                `[Multi-Vault] Background: Vault ${i} broadcasted with local UTXO data (txid: ${broadcastTxId})`,
              );
            } else {
              // ================================================================
              // STANDARD BROADCAST: Use existing broadcastBtcTransaction
              // ================================================================
              console.log(
                `[Multi-Vault] Background: Vault ${i} using STANDARD broadcast (mempool OK)`,
              );

              await broadcastBtcTransaction(
                {
                  btcTxid: result.btcTxHash,
                  depositorBtcPubkey: result.depositorBtcPubkey,
                  btcWalletProvider,
                },
                depositorEthAddress,
              );
            }

            console.log(
              `[Multi-Vault] Background: Vault ${i} broadcasted successfully`,
            );
          } catch (err) {
            console.error(
              `[Multi-Vault] Background: Vault ${i} broadcast failed -`,
              err,
            );
            // Continue with other vaults
          }
        }

        // ========================================================================
        // Background Complete
        // ========================================================================
        console.log(
          "[Multi-Vault] Background: All vaults created and broadcast successfully!",
        );

        // NOTE: Pegins were already saved to storage earlier (after ETH confirmations)
        // This ensures they appear in table immediately with batch/split info

        const result: MultiVaultDepositResult = {
          batchId, // Use the batchId from the start of the flow
          splitTransaction: splitTxResult
            ? {
                ...plan.splitTransaction!,
                signedHex: splitTxResult.signedHex,
                broadcasted: true,
              }
            : undefined,
          vaults: peginResults,
          createdAt: Date.now(),
        };

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("[Multi-Vault] Flow error:", err);
        return null;
      } finally {
        setProcessing(false);
        setIsWaiting(false);
        setCurrentVaultIndex(null);
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
      findProvider,
      vaultKeepers,
      latestUniversalChallengers,
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

/**
 * Create and sign a split transaction
 */
async function createAndSignSplitTransaction(
  splitTx: NonNullable<AllocationPlan["splitTransaction"]>,
  btcWalletProvider: BitcoinWallet,
): Promise<{
  txid: string;
  signedHex: string;
  outputs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>;
}> {
  console.log("[Split TX] Creating proper split transaction with SDK...");

  const network = getBTCNetwork() as Network;

  const result = createSplitTransaction(
    splitTx.inputs,
    splitTx.outputs.map((o) => ({
      amount: o.amount,
      address: o.address,
    })),
    network,
  );

  console.log(`[Split TX] Unsigned transaction created: ${result.txid}`);

  // Sign the transaction using PSBT
  console.log("[Split TX] Creating PSBT for wallet signing...");

  // Get depositor's public key for P2TR signing
  const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
  const publicKeyNoCoord = Buffer.from(
    publicKeyHex.length === 64 ? publicKeyHex : publicKeyHex.slice(2),
    "hex",
  );

  // Import createSplitTransactionPsbt
  const { createSplitTransactionPsbt } = await import(
    "@babylonlabs-io/ts-sdk/tbv/core"
  );

  const psbtHex = createSplitTransactionPsbt(
    result.txHex,
    splitTx.inputs,
    publicKeyNoCoord,
  );

  console.log("[Split TX] Requesting wallet signature...");
  const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex, {
    autoFinalized: true,
  });

  // Extract signed transaction
  const { Psbt } = await import("bitcoinjs-lib");
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  // Set a reasonable maximum fee rate to prevent false positives
  // This is a safety check - the actual fee should be much lower due to change output
  signedPsbt.setMaximumFeeRate(100000); // 100k sats/vByte max (very generous)

  const signedTx = signedPsbt.extractTransaction();
  const signedHex = signedTx.toHex();

  console.log(`[Split TX] Transaction signed successfully!`);

  return {
    txid: result.txid,
    signedHex,
    outputs: result.outputs,
  };
}
