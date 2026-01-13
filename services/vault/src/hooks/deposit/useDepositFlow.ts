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
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import {
  getWalletClient,
  switchChain,
  waitForTransactionReceipt,
} from "wagmi/actions";

import type { ClaimerTransactions } from "@/clients/vault-provider-rpc/types";
import { useUTXOs } from "@/hooks/useUTXOs";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import {
  pollForPayoutTransactions,
  waitForContractVerification,
} from "@/services/deposit/polling";
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
import { processPublicKeyToXOnly } from "@/utils/btc";

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

      // Get provider for polling and signing
      const provider = getSelectedVaultProvider();
      if (!provider.url) {
        throw new Error("Vault provider has no RPC URL");
      }

      let payoutTransactions: ClaimerTransactions[];
      try {
        payoutTransactions = await pollForPayoutTransactions({
          btcTxid,
          depositorBtcPubkey,
          providerUrl: provider.url,
        });
      } catch (pollError) {
        // Timeout or error during polling
        // The deposit is already saved, so user can continue from table
        setIsWaiting(false);
        throw pollError;
      }

      // Sign payout transactions
      setIsWaiting(false);

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
        await waitForContractVerification({ btcTxid });
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
    getSelectedVaultProvider,
    liquidators,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
    isWaiting,
  };
}
