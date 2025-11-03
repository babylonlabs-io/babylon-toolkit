/**
 * Compatibility layer for deposit flow migration
 *
 * This hook provides the same API as the old useDepositFlow
 * while using the new architecture internally.
 */

import { getETHChain } from "@babylonlabs-io/config";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { getWalletClient } from "wagmi/actions";

import { CONTRACTS } from "@/config/contracts";
import { useUTXOs } from "@/hooks/useUTXOs";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
import { createProofOfPossession } from "@/services/vault/vaultProofOfPossessionService";
import { submitPeginRequest } from "@/services/vault/vaultTransactionService";
import { addPendingPegin } from "@/storage/peginStorage";
import { processPublicKeyToXOnly } from "@/utils/btc";

/**
 * BTC wallet provider interface
 */
interface BtcWalletProvider {
  signMessage: (
    message: string,
    type: "ecdsa" | "bip322-simple",
  ) => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
}

export interface UseDepositFlowParams {
  amount: bigint;
  btcWalletProvider: BtcWalletProvider;
  depositorEthAddress: Address | undefined;
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
}

/**
 * Hook to orchestrate deposit flow execution - Compatible with old API
 *
 * This is a bridge between old and new architecture.
 * It maintains the old API while using new services internally.
 *
 * @param params - Deposit parameters (old format)
 * @returns Execution function and state (old format)
 */
export function useDepositFlow(
  params: UseDepositFlowParams,
): UseDepositFlowReturn {
  const {
    amount,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    onSuccess,
  } = params;

  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get BTC address from wallet
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;

  // Fetch UTXOs
  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

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

      // Step 2: Create proof of possession
      setCurrentStep(1);

      await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress,
        signMessage: (message: string) =>
          btcWalletProvider.signMessage(message, "bip322-simple"),
      });

      // Step 3: Create transaction and submit
      setCurrentStep(2);

      // Get depositor's BTC public key
      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Process keys
      const processedVaultProviderKey = vaultProviderBtcPubkey.startsWith("0x")
        ? vaultProviderBtcPubkey.slice(2)
        : vaultProviderBtcPubkey;

      const processedLiquidatorKeys = liquidatorBtcPubkeys.map((key) =>
        key.startsWith("0x") ? key.slice(2) : key,
      );

      // Get wallet client for ETH transactions
      const wagmiConfig = getSharedWagmiConfig();
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: getETHChain().id,
        account: depositorEthAddress,
      });

      if (!walletClient) {
        throw new Error("Failed to get wallet client");
      }

      // Use new service for fee calculation
      const fees = depositService.calculateDepositFees(amount, 1);

      // Submit pegin request (using existing service)
      const result = await submitPeginRequest(
        walletClient,
        getETHChain(),
        CONTRACTS.VAULT_CONTROLLER,
        depositorBtcPubkey,
        amount,
        confirmedUTXOs,
        Number(fees.btcNetworkFee),
        btcAddress,
        selectedProviders[0] as Address,
        processedVaultProviderKey,
        processedLiquidatorKeys,
      );

      // Store pending pegin in localStorage
      const btcTxid = "0x" + result.btcTxid;
      const ethTxHash = result.transactionHash;

      const pendingPeginData = {
        id: btcTxid,
        depositAmount: amount.toString(),
        btcAddress,
        ethAddress: depositorEthAddress,
        contractStatus: 0,
        localStatus: LocalStorageStatus.PENDING,
        ethTxHash,
        timestamp: Date.now(),
        vaultProviderBtcPubkey: processedVaultProviderKey,
        selectedProviders,
      };

      addPendingPegin(depositorEthAddress, pendingPeginData);

      // Step 4: Complete
      setCurrentStep(3);

      // Call success callback
      onSuccess(btcTxid, ethTxHash, depositorBtcPubkey, {
        unsignedTxHex: result.btcTxHex,
        selectedUTXOs: result.selectedUTXOs,
        fee: result.fee,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Deposit flow error:", err);
    } finally {
      setProcessing(false);
    }
  }, [
    amount,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    onSuccess,
    btcAddress,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
  };
}
