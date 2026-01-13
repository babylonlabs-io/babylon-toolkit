/**
 * Main deposit flow orchestration hook
 *
 * This hook manages the complete deposit flow from form submission
 * to transaction completion. All business logic for deposits lives here.
 *
 * Now includes all 4 signing steps in a single continuous flow:
 * 1. Sign Proof of Possession (PoP)
 * 2. Sign & Submit Ethereum Transaction
 * 3. Sign Payout Transactions (after polling for readiness)
 * 4. Sign & Broadcast BTC Transaction
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import {
  getWalletClient,
  switchChain,
  waitForTransactionReceipt,
} from "wagmi/actions";

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type { ClaimerTransactions } from "@/clients/vault-provider-rpc/types";
import { useUTXOs } from "@/hooks/useUTXOs";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import {
  broadcastPeginTransaction,
  fetchVaultById,
  signAndSubmitPayoutSignatures,
} from "@/services/vault";
import { submitPeginRequest } from "@/services/vault/vaultTransactionService";
import {
  addPendingPegin,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import { processPublicKeyToXOnly, stripHexPrefix } from "@/utils/btc";

import { useVaultProviders } from "./useVaultProviders";

export interface UseDepositFlowParams {
  amount: bigint;
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  modalOpen: boolean;
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
    transactionData?: {
      unsignedTxHex: string;
      selectedUTXOs: Array<{
        txid: string;
        vout: number;
        value: number;
        scriptPubKey: string;
      }>;
      fee: bigint;
    },
  ) => void;
}

export interface UseDepositFlowReturn {
  executeDepositFlow: () => Promise<void>;
  currentStep: number;
  processing: boolean;
  error: string | null;
  /** Whether we're in a waiting state (polling for data) */
  isWaiting: boolean;
  /** Description of the current step for UI display */
  stepDescription: string;
}

/** Timeout for RPC requests (30 seconds). */
const RPC_TIMEOUT_MS = 30 * 1000;

/**
 * Polling interval for payout transactions.
 *
 * Chosen as 10 seconds to balance user experience and backend load:
 * - Shorter intervals improve responsiveness but can significantly increase
 *   the number of requests hitting the vault provider.
 * - Longer intervals reduce load but make the UI feel sluggish while waiting
 *   for payout readiness.
 *
 * This value is intended as a conservative default for production deployments
 * and may need to be tuned per environment if backend characteristics change.
 */
const POLLING_INTERVAL_MS = 10 * 1000;

/**
 * Maximum time to wait for polling operations.
 *
 * Set to 10 minutes to:
 * - Allow for typical worst-case processing times on the vault provider side.
 * - Avoid unbounded polling in the UI in case of delayed or stuck operations.
 *
 * This is a safety cap rather than an SLA and should be revisited if
 * end-to-end deposit processing times materially change in production.
 */
const MAX_POLLING_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Transient error patterns that indicate polling should continue.
 */
const TRANSIENT_ERROR_PATTERNS = [
  "PegIn not found",
  "No transaction graphs found",
] as const;

/**
 * Invalid state patterns that indicate the vault provider is still processing.
 */
const INVALID_STATE_PATTERNS = [
  "Acknowledged",
  "PendingChallengerSignatures",
] as const;

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;

  // Check for direct transient patterns
  if (TRANSIENT_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))) {
    return true;
  }

  // Check for "Invalid state" with specific sub-states
  if (
    msg.includes("Invalid state") &&
    INVALID_STATE_PATTERNS.some((pattern) => msg.includes(pattern))
  ) {
    return true;
  }

  return false;
}

/**
 * Get step description for UI display
 */
function getStepDescription(step: number, isWaiting: boolean): string {
  switch (step) {
    case 1:
      return "Please sign the proof of possession in your BTC wallet.";
    case 2:
      return "Please sign and submit the peg-in request in your ETH wallet.";
    case 3:
      return isWaiting
        ? "Waiting for Vault Provider to prepare payout transactions..."
        : "Please sign the payout transactions in your BTC wallet.";
    case 4:
      return isWaiting
        ? "Waiting for on-chain verification..."
        : "Please sign and broadcast the Bitcoin transaction in your BTC wallet.";
    case 5:
      return "Deposit successfully submitted!";
    default:
      return "";
  }
}

/**
 * Hook to orchestrate deposit flow execution
 *
 * @param params - Deposit parameters
 * @returns Execution function and state
 */
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
    liquidatorBtcPubkeys,
    onSuccess,
  } = params;

  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  // Refs for cleanup and preventing concurrent operations
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Get BTC address from wallet
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;

  // Fetch UTXOs
  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

  // Get vault providers for signing
  const { findProvider, liquidators } = useVaultProviders(selectedApplication);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  // Cleanup polling timers on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Get the selected vault provider with validation
   */
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

  /**
   * Poll for payout transactions from vault provider
   */
  const pollForPayoutTransactions = useCallback(
    async (
      btcTxid: string,
      depositorBtcPubkey: string,
    ): Promise<ClaimerTransactions[]> => {
      // Prevent concurrent polling operations
      if (isPollingRef.current) {
        throw new Error("Polling operation already in progress");
      }

      return new Promise((resolve, reject) => {
        // Get vault provider URL with validation
        let provider;
        try {
          provider = getSelectedVaultProvider();
        } catch (err) {
          reject(err);
          return;
        }

        if (!provider.url) {
          reject(new Error("Vault provider has no RPC URL"));
          return;
        }

        // Mark polling as active
        isPollingRef.current = true;

        // Create RPC client once outside the poll loop
        const rpcClient = new VaultProviderRpcApi(provider.url, RPC_TIMEOUT_MS);

        // Track if promise has been settled to prevent race conditions
        let isSettled = false;

        const settle = (
          type: "resolve" | "reject",
          value: ClaimerTransactions[] | Error,
        ) => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          if (type === "resolve") {
            resolve(value as ClaimerTransactions[]);
          } else {
            reject(value);
          }
        };

        pollingTimeoutRef.current = setTimeout(() => {
          settle(
            "reject",
            new Error("Timeout waiting for payout transactions"),
          );
        }, MAX_POLLING_TIMEOUT_MS);

        // Poll function
        const poll = async (): Promise<boolean> => {
          // Check if already settled before polling
          if (isSettled) return true;

          try {
            const response = await rpcClient.requestClaimAndPayoutTransactions({
              pegin_tx_id: stripHexPrefix(btcTxid),
              depositor_pk: depositorBtcPubkey,
            });

            if (response.txs && response.txs.length > 0) {
              settle("resolve", response.txs);
              return true;
            }
            return false;
          } catch (err) {
            if (isTransientError(err)) {
              return false; // Continue polling
            }
            // Non-transient error: fail fast instead of continuing to poll
            console.error("Non-transient polling error:", err);
            settle(
              "reject",
              err instanceof Error ? err : new Error(String(err)),
            );
            return true; // Stop polling
          }
        };

        // Start interval polling
        pollingIntervalRef.current = setInterval(async () => {
          // Skip if already settled
          if (isSettled || !pollingIntervalRef.current) return;

          try {
            const done = await poll();
            if (done && pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } catch (e) {
            console.warn("Polling interval error:", e);
          }
        }, POLLING_INTERVAL_MS);

        poll().catch((e) => {
          console.warn("Initial poll error:", e);
        });
      });
    },
    [cleanup, getSelectedVaultProvider],
  );

  /**
   * Wait for contract status to update (verified state)
   */
  const waitForContractVerification = useCallback(
    async (btcTxid: string): Promise<void> => {
      // Prevent concurrent polling operations
      if (isPollingRef.current) {
        throw new Error("Polling operation already in progress");
      }

      return new Promise((resolve, reject) => {
        // Mark polling as active
        isPollingRef.current = true;

        // Track if promise has been settled to prevent race conditions
        let isSettled = false;

        const settle = (type: "resolve" | "reject", error?: Error) => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          if (type === "resolve") {
            resolve();
          } else {
            reject(error);
          }
        };

        // Set up timeout
        pollingTimeoutRef.current = setTimeout(() => {
          settle(
            "reject",
            new Error("Timeout waiting for contract verification"),
          );
        }, MAX_POLLING_TIMEOUT_MS);

        // Poll for contract status
        const poll = async (): Promise<boolean> => {
          // Check if already settled before polling
          if (isSettled) return true;

          try {
            const vault = await fetchVaultById(btcTxid as Hex);
            // Contract status >= 1 indicates the vault is ready for broadcast.
            // Status values:
            //   0 = PENDING (waiting for signatures)
            //   1 = VERIFIED (all signatures collected, ready for broadcast)
            //   2+ = Higher statuses indicate post-broadcast states
            // We accept >= 1 because if the vault has already progressed past
            // VERIFIED, it's still valid to proceed with the broadcast step.
            if (vault && vault.status >= 1) {
              settle("resolve");
              return true;
            }
            return false;
          } catch (error) {
            // Log errors but continue polling - the vault may not be indexed yet
            console.warn("Error polling for contract verification:", error);
            return false;
          }
        };

        // Start interval polling
        pollingIntervalRef.current = setInterval(async () => {
          // Skip if already settled
          if (isSettled || !pollingIntervalRef.current) return;

          const success = await poll();
          if (success && pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }, POLLING_INTERVAL_MS);

        // Do an immediate initial poll
        poll();
      });
    },
    [cleanup],
  );

  const executeDepositFlow = useCallback(async () => {
    try {
      setProcessing(true);
      setError(null);

      // Step 1: Validation using new service layer
      if (!btcAddress) {
        throw new Error("BTC wallet not connected");
      }
      if (!depositorEthAddress) {
        throw new Error("ETH wallet not connected");
      }

      // Use new validation service
      const amountValidation = depositService.validateDepositAmount(
        amount,
        10000n, // MIN_DEPOSIT
        21000000_00000000n, // MAX_DEPOSIT
      );
      if (!amountValidation.valid) {
        throw new Error(amountValidation.error);
      }

      if (selectedProviders.length === 0) {
        throw new Error("No providers selected");
      }

      if (isUTXOsLoading) {
        throw new Error("Loading UTXOs...");
      }
      if (utxoError) {
        throw new Error(`Failed to load UTXOs: ${utxoError}`);
      }
      if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
        throw new Error("No confirmed UTXOs available");
      }

      // Step 2: Get wallet client for ETH transactions
      setCurrentStep(1);

      const wagmiConfig = getSharedWagmiConfig();
      const expectedChainId = getETHChain().id;

      // Switch to the correct chain if needed
      try {
        await switchChain(wagmiConfig, { chainId: expectedChainId });
      } catch (switchError) {
        console.error("Failed to switch chain:", switchError);
        throw new Error(
          `Please switch to ${expectedChainId === 1 ? "Ethereum Mainnet" : "Sepolia Testnet"} in your wallet`,
        );
      }

      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: expectedChainId,
        account: depositorEthAddress,
      });

      if (!walletClient) {
        throw new Error("Failed to get wallet client");
      }

      // Submit pegin request with type-safe BitcoinWallet cast
      // The btcWalletProvider from wallet-connector already implements the BitcoinWallet interface
      const result = await submitPeginRequest(btcWalletProvider, walletClient, {
        pegInAmount: amount,
        feeRate,
        changeAddress: btcAddress,
        vaultProviderAddress: selectedProviders[0] as Address,
        vaultProviderBtcPubkey,
        liquidatorBtcPubkeys,
        availableUTXOs: confirmedUTXOs,
        // Callback to update step indicator AFTER PoP signing, BEFORE ETH signing
        onPopSigned: () => {
          setCurrentStep(2);
        },
      });

      // Get depositor's BTC public key for display
      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Store pending pegin in localStorage for immediate UI feedback
      // Note: result.btcTxHash includes "0x" prefix
      const btcTxid = result.btcTxHash;
      const ethTxHash = result.transactionHash;

      // Format amount for display (satoshis to BTC string)
      const amountBtc = depositService.formatSatoshisToBtc(amount);

      // selectedApplication is already the controller address (e.g., "0xcb38...")
      // No need to look it up - just use it directly
      const applicationController = selectedApplication;

      const peginData = {
        id: btcTxid,
        amount: amountBtc,
        providerIds: selectedProviders,
        applicationController,
        status: LocalStorageStatus.PENDING,
        btcTxHash: ethTxHash, // Store ETH tx hash for tracking
        unsignedTxHex: result.btcTxHex,
        selectedUTXOs: result.selectedUTXOs.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value.toString(),
          scriptPubKey: utxo.scriptPubKey,
        })),
      };

      addPendingPegin(depositorEthAddress, peginData);

      // Wait for ETH transaction to be confirmed before proceeding
      // This ensures the PegInPending event is emitted on-chain
      // so the vault provider can index it and prepare payout transactions
      try {
        await waitForTransactionReceipt(wagmiConfig, {
          hash: ethTxHash,
          confirmations: 1,
        });
      } catch {
        // If the transaction was dropped/replaced, throw an error
        // The user can retry from the deposits table
        throw new Error(
          `ETH transaction not confirmed. It may have been dropped or replaced. ` +
            `Please check your wallet and retry. Hash: ${ethTxHash}`,
        );
      }

      // Step 3: Wait for payout transactions and sign them
      setCurrentStep(3);
      setIsWaiting(true);

      let payoutTransactions: ClaimerTransactions[];
      try {
        payoutTransactions = await pollForPayoutTransactions(
          btcTxid,
          depositorBtcPubkey,
        );
      } catch (pollError) {
        // Timeout or error during polling
        // The deposit is already saved, so user can continue from table
        setIsWaiting(false);
        throw pollError;
      }

      // Sign payout transactions
      setIsWaiting(false);

      // Use helper to get provider with validation
      const provider = getSelectedVaultProvider();

      await signAndSubmitPayoutSignatures({
        peginTxId: btcTxid,
        depositorBtcPubkey,
        claimerTransactions: payoutTransactions,
        providers: {
          vaultProvider: {
            address: provider.id as Hex,
            url: provider.url,
            btcPubKey: provider.btcPubKey,
          },
          liquidators,
        },
        btcWallet: btcWalletProvider,
      });

      // Update localStorage
      updatePendingPeginStatus(
        depositorEthAddress,
        btcTxid,
        LocalStorageStatus.PAYOUT_SIGNED,
      );

      // Step 4: Wait for contract verification and broadcast
      setCurrentStep(4);
      setIsWaiting(true);

      try {
        await waitForContractVerification(btcTxid);
      } catch (waitError) {
        // Timeout during verification - fallback to table flow
        setIsWaiting(false);
        throw waitError;
      }

      // Broadcast BTC transaction
      setIsWaiting(false);

      // Fetch vault to get unsigned tx
      const vault = await fetchVaultById(btcTxid as Hex);
      if (!vault?.unsignedBtcTx) {
        throw new Error("Vault or unsigned transaction not found");
      }

      const broadcastTxId = await broadcastPeginTransaction({
        unsignedTxHex: vault.unsignedBtcTx,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
        depositorBtcPubkey,
      });

      // Update localStorage
      updatePendingPeginStatus(
        depositorEthAddress,
        btcTxid,
        LocalStorageStatus.CONFIRMING,
        broadcastTxId,
      );

      // All 4 steps complete - call success callback
      setCurrentStep(5);
      onSuccess(btcTxid, ethTxHash, depositorBtcPubkey, {
        unsignedTxHex: result.btcTxHex,
        selectedUTXOs: result.selectedUTXOs,
        fee: result.fee,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Deposit flow error:", err);
      cleanup();
      // Reset to step 1 so user can retry from the beginning
      setCurrentStep(1);
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
    liquidatorBtcPubkeys,
    onSuccess,
    btcAddress,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
    pollForPayoutTransactions,
    waitForContractVerification,
    getSelectedVaultProvider,
    liquidators,
    cleanup,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
    isWaiting,
    stepDescription: getStepDescription(currentStep, isWaiting),
  };
}
