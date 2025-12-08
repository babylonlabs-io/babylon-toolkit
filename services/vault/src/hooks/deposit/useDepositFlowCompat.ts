/**
 * Compatibility layer for deposit flow migration
 *
 * This hook provides the same API as the old useDepositFlow
 * while using the new architecture internally.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { useUTXOs } from "@/hooks/useUTXOs";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { depositService } from "@/services/deposit";
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

      // Step 3: Submit pegin request (PeginManager handles PoP internally)
      setCurrentStep(2);

      // Use new service for fee calculation
      const fees = depositService.calculateDepositFees(amount);

      // TODO - implement fee calcs
      // Current: Calculate fee rate from fixed fee (average pegin tx is ~250 vbytes)
      const feeRate = Math.ceil(Number(fees.btcNetworkFee) / 250);

      // Submit pegin request with type-safe BitcoinWallet cast
      // The btcWalletProvider from wallet-connector already implements the BitcoinWallet interface
      const result = await submitPeginRequest(
        btcWalletProvider as BitcoinWallet,
        walletClient,
        {
          pegInAmount: amount,
          feeRate,
          changeAddress: btcAddress,
          vaultProviderAddress: selectedProviders[0] as Address,
          vaultProviderBtcPubkey,
          liquidatorBtcPubkeys,
          availableUTXOs: confirmedUTXOs,
        },
      );

      // Get depositor's BTC public key for display
      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Store pending pegin in localStorage for immediate UI feedback
      const btcTxid = "0x" + result.btcTxHash;
      const ethTxHash = result.transactionHash;

      // Format amount for display (satoshis to BTC string)
      const amountBtc = depositService.formatSatoshisToBtc(amount);

      addPendingPegin(depositorEthAddress, {
        id: btcTxid,
        amount: amountBtc,
        providerIds: selectedProviders,
        status: LocalStorageStatus.PENDING,
        btcTxHash: ethTxHash, // Store ETH tx hash for tracking
        unsignedTxHex: result.btcTxHex,
        selectedUTXOs: result.selectedUTXOs.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value.toString(),
          scriptPubKey: utxo.scriptPubKey,
        })),
      });

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
