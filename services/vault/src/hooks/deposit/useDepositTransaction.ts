/**
 * Deposit transaction hook
 *
 * Handles transaction creation, signing, and submission for deposits.
 * Integrates with wallet providers and blockchain clients.
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";

import { useError } from "../../context/error";
import type { DepositTransactionData } from "../../services/deposit";
import { depositService } from "../../services/deposit";
import { ErrorCode, ValidationError } from "../../utils/errors";

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
  const { handleError } = useError();

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
        // Parse amount
        const pegInAmount = depositService.parseBtcToSatoshis(params.amount);

        // Mock wallet data (in real implementation, would get from wallet)
        const btcPubkey = "0x" + "a".repeat(64); // Mock 32-byte pubkey

        // Mock provider data (in real implementation, would fetch from API)
        const providerData = {
          address: params.selectedProviders[0] as Hex,
          btcPubkey: "0x" + "b".repeat(64),
          liquidatorPubkeys: ["0x" + "c".repeat(64), "0x" + "d".repeat(64)],
        };

        // Calculate fees and select UTXOs
        const fees = depositService.calculateDepositFees(pegInAmount, 1);
        const requiredAmount = pegInAmount + fees.totalFee;

        // Mock UTXO selection (in real implementation, would use actual UTXOs)
        const mockUTXOs = [
          {
            txid: "0x" + "f".repeat(64),
            vout: 0,
            value: Number(requiredAmount + 1000n), // Add some change
            scriptPubKey: "0x" + "e".repeat(40),
          },
        ];

        const { selected: selectedUTXOs } = depositService.selectOptimalUTXOs(
          mockUTXOs,
          requiredAmount,
        );

        // Build transaction data
        const txData = depositService.transformFormToTransactionData(
          {
            amount: params.amount,
            selectedProviders: params.selectedProviders,
          },
          {
            btcPubkey,
            ethAddress: params.ethAddress,
          },
          providerData,
          {
            selectedUTXOs,
            fee: fees.totalFee,
          },
        );

        // Mock unsigned transaction hex (in real implementation, would use WASM)
        txData.unsignedTxHex = "0x" + "1".repeat(500);

        setLastTransaction(txData);

        return {
          success: true,
          data: txData,
        };
      } catch (error) {
        const validationError =
          error instanceof Error
            ? new ValidationError(
                error.message,
                ErrorCode.VALIDATION_ERROR,
                "amount",
              )
            : new Error("Failed to create deposit transaction");

        handleError({
          error: validationError,
          displayOptions: {
            showModal: true,
          },
        });

        return {
          success: false,
          error: validationError.message,
        };
      } finally {
        setIsCreating(false);
      }
    },
    [handleError],
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
        const txError =
          error instanceof Error
            ? error
            : new Error("Failed to submit transaction");

        handleError({
          error: txError,
          displayOptions: {
            showModal: true,
            retryAction: () => submitTransaction(_txData),
          },
        });

        return {
          success: false,
          error: txError.message,
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [handleError],
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
