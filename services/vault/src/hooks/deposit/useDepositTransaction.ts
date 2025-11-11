/**
 * Deposit transaction hook
 *
 * Handles transaction creation, signing, and submission for deposits.
 * Integrates with wallet providers and blockchain clients.
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";

import type { DepositTransactionData } from "../../services/deposit";
import { formatErrorMessage } from "../../utils/errors";
import { useUTXOs } from "../useUTXOs";
import { useBtcPublicKey } from "../useBtcPublicKey";
import { useVaultProviders } from "../../components/Overview/Deposits/hooks/useVaultProviders";
import { buildDepositTransaction } from "./buildDepositTransaction";

export interface CreateDepositTransactionParams {
  amount: string;
  selectedProviders: string[];
  btcAddress: string;
  ethAddress: Hex;
}

export interface TransactionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UseDepositTransactionResult {
  // Transaction creation
  createDepositTransaction: (
    params: CreateDepositTransactionParams,
  ) => Promise<TransactionResult<DepositTransactionData>>;

  // Transaction submission
  submitTransaction: (
    txData: DepositTransactionData,
  ) => Promise<TransactionResult>;

  // Transaction state
  isCreating: boolean;
  isSubmitting: boolean;
  lastTransaction: DepositTransactionData | null;

  // Reset
  reset: () => void;
}

/**
 * Hook for deposit transaction operations
 *
 * @returns Transaction functions and state
 */
export function useDepositTransaction(): UseDepositTransactionResult {
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTransaction, setLastTransaction] =
    useState<DepositTransactionData | null>(null);

  // Get wallet connections
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;
  const btcConnected = !!btcAddress;

  // Get BTC public key
  const btcPubkey = useBtcPublicKey(btcConnected);

  // Get confirmed UTXOs
  const { confirmedUTXOs, isLoading: utxosLoading } = useUTXOs(btcAddress);

  // Get vault providers
  const { findProvider } = useVaultProviders();

  // Reset state
  const reset = useCallback(() => {
    setIsCreating(false);
    setIsSubmitting(false);
    setLastTransaction(null);
  }, []);

  // Create deposit transaction
  const createDepositTransaction = useCallback(
    async (
      params: CreateDepositTransactionParams,
    ): Promise<TransactionResult<DepositTransactionData>> => {
      setIsCreating(true);

      try {
        // Validate prerequisites
        if (!btcAddress) {
          throw new Error("BTC wallet not connected");
        }

        if (!btcPubkey) {
          throw new Error("Failed to get BTC public key from wallet");
        }

        if (utxosLoading) {
          throw new Error("Still loading UTXOs, please wait");
        }

        if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
          throw new Error("No confirmed UTXOs available");
        }

        // Get provider data
        const selectedProviderAddress = params.selectedProviders[0];
        const provider = findProvider(selectedProviderAddress);
        
        if (!provider) {
          throw new Error("Selected provider not found");
        }

        // Prepare provider data with liquidator pubkeys
        const providerData = {
          address: provider.id as Hex,
          btcPubkey: provider.btc_pub_key,
          liquidatorPubkeys: provider.liquidators?.map(l => l.btc_pub_key) || [],
        };

        // Build the transaction using the extracted function
        const txData = await buildDepositTransaction({
          amount: params.amount,
          selectedProviders: params.selectedProviders,
          btcAddress: params.btcAddress,
          ethAddress: params.ethAddress,
          btcPubkey,
          confirmedUTXOs,
          providerData,
        });

        setLastTransaction(txData);

        return {
          success: true,
          data: txData,
        };
      } catch (error) {
        return {
          success: false,
          error: formatErrorMessage(error),
        };
      } finally {
        setIsCreating(false);
      }
    },
    [
      btcAddress,
      btcPubkey,
      confirmedUTXOs,
      utxosLoading,
      findProvider,
    ],
  );

  // Submit transaction to blockchain
  const submitTransaction = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_txData: DepositTransactionData): Promise<TransactionResult> => {
      setIsSubmitting(true);

      try {
        // Mock transaction submission
        // In real implementation would:
        // 1. Sign transaction with BTC wallet
        // 2. Submit to ETH smart contract
        // 3. Broadcast BTC transaction

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const result = {
          btcTxid: "0x" + "2".repeat(64),
          ethTxHash: ("0x" + "3".repeat(64)) as Hex,
          timestamp: Date.now(),
        };

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          error: formatErrorMessage(error),
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  return {
    createDepositTransaction,
    submitTransaction,
    isCreating,
    isSubmitting,
    lastTransaction,
    reset,
  };
}
