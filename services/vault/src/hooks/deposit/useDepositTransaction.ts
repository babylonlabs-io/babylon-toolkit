import { getETHChain } from "@babylonlabs-io/config";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Hex, WalletClient } from "viem";
import { getWalletClient } from "wagmi/actions";

import { BTC_TRANSACTION_FEE } from "@/config/pegin";
import { useError } from "@/context/error";
import { useBTCWallet } from "@/context/wallet";
import { useUTXOs } from "@/hooks/useUTXOs";
import type { DepositTransactionData } from "@/services/deposit";
import { depositService } from "@/services/deposit";
import * as vaultTransactionService from "@/services/vault/vaultTransactionService";
import type { VaultProvider } from "@/types/vaultProvider";

import { useVaultProviders } from "./useVaultProviders";

export interface CreateDepositTransactionParams {
  amount: string;
  selectedProviders: string[];
  ethAddress: Hex;
  providers?: VaultProvider[];
}

export interface TransactionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UseDepositTransactionResult {
  /**
   * Create and submit deposit transaction using PeginManager
   * This is the new combined flow that replaces the old two-step process
   */
  createDepositTransaction: (
    params: CreateDepositTransactionParams,
  ) => Promise<TransactionResult>;

  /**
   * @deprecated Legacy method kept for backward compatibility.
   * Use createDepositTransaction instead which now handles the complete flow.
   */
  submitTransaction: (
    txData: DepositTransactionData,
  ) => Promise<TransactionResult>;

  isCreating: boolean;
  isSubmitting: boolean;
  lastTransaction: DepositTransactionData | null;

  reset: () => void;
}

export function useDepositTransaction(): UseDepositTransactionResult {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const { address: btcAddress } = useBTCWallet();
  const { confirmedUTXOs } = useUTXOs(btcAddress);
  const { vaultProviders: availableProviders, liquidators } =
    useVaultProviders();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTransaction, setLastTransaction] =
    useState<DepositTransactionData | null>(null);
  const { handleError } = useError();

  const reset = useCallback(() => {
    setIsCreating(false);
    setIsSubmitting(false);
    setLastTransaction(null);
  }, []);

  /**
   * Create and submit deposit transaction using PeginManager.
   */
  const createDepositTransaction = useCallback(
    async (
      params: CreateDepositTransactionParams,
    ): Promise<TransactionResult> => {
      setIsCreating(true);

      try {
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }
        if (!params.ethAddress) {
          throw new Error("ETH address not provided");
        }
        if (!btcAddress) {
          throw new Error("BTC address not available");
        }

        const pegInAmount = depositService.parseBtcToSatoshis(params.amount);

        const providers = params.providers || availableProviders;
        if (!providers || providers.length === 0) {
          throw new Error("No providers available");
        }

        if (
          !params.selectedProviders ||
          params.selectedProviders.length === 0
        ) {
          throw new Error("No provider selected");
        }

        const selectedProvider = providers.find(
          (p) =>
            p.id.toLowerCase() === params.selectedProviders[0].toLowerCase(),
        );

        if (!selectedProvider) {
          throw new Error("Selected provider not found");
        }

        if (!selectedProvider.btcPubKey) {
          throw new Error(
            "Provider BTC public key is missing. Cannot create deposit transaction.",
          );
        }

        if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
          throw new Error("No confirmed UTXOs available");
        }

        // Get ETH wallet client
        const wagmiConfig = getSharedWagmiConfig();
        const expectedChainId = getETHChain().id;
        const walletClient = (await getWalletClient(wagmiConfig, {
          chainId: expectedChainId,
        })) as WalletClient;

        if (!walletClient) {
          throw new Error("No wallet client available");
        }

        // Calculate fee rate from fixed fee
        const feeRate = Math.ceil(Number(BTC_TRANSACTION_FEE) / 250);

        // Use PeginManager for complete flow
        const result = await vaultTransactionService.submitPeginRequest(
          btcWalletProvider,
          walletClient,
          {
            pegInAmount,
            feeRate,
            changeAddress: btcAddress,
            vaultProviderAddress: selectedProvider.id as Hex,
            vaultProviderBtcPubkey: selectedProvider.btcPubKey,
            liquidatorBtcPubkeys: liquidators.map((liq) => liq.btcPubKey),
            availableUTXOs: confirmedUTXOs,
          },
        );

        return {
          success: true,
          data: {
            ethTxHash: result.transactionHash,
            btcTxid: result.btcTxHash,
            btcUnsignedTxHex: result.btcTxHex,
            timestamp: Date.now(),
          },
        };
      } catch (error) {
        const handledError =
          error instanceof Error
            ? error
            : new Error("Failed to create deposit transaction");

        handleError({
          error: handledError,
          displayOptions: {
            showModal: true,
          },
        });

        return {
          success: false,
          error: handledError.message,
        };
      } finally {
        setIsCreating(false);
      }
    },
    [
      btcWalletProvider,
      btcAddress,
      confirmedUTXOs,
      availableProviders,
      liquidators,
      handleError,
    ],
  );

  const submitTransaction = useCallback(
    async (txData: DepositTransactionData): Promise<TransactionResult> => {
      setIsSubmitting(true);

      try {
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }
        if (!btcAddress) {
          throw new Error("BTC address not available");
        }

        const wagmiConfig = getSharedWagmiConfig();
        const expectedChainId = getETHChain().id;
        const walletClient = (await getWalletClient(wagmiConfig, {
          chainId: expectedChainId,
        })) as WalletClient;

        if (!walletClient) {
          throw new Error("No wallet client available");
        }

        const selectedUTXO = txData.selectedUTXOs[0];
        if (!selectedUTXO) {
          throw new Error("No UTXO selected for transaction");
        }

        // Calculate fee rate from fixed fee
        // Average pegin tx size is ~250 vbytes
        const feeRate = Math.ceil(Number(txData.fee) / 250);

        const result = await vaultTransactionService.submitPeginRequest(
          btcWalletProvider,
          walletClient,
          {
            pegInAmount: txData.pegInAmount,
            feeRate,
            changeAddress: btcAddress,
            vaultProviderAddress: txData.vaultProviderAddress,
            vaultProviderBtcPubkey: txData.vaultProviderBtcPubkey,
            liquidatorBtcPubkeys: txData.liquidatorBtcPubkeys as string[],
            availableUTXOs: [selectedUTXO],
          },
        );

        return {
          success: true,
          data: {
            ethTxHash: result.transactionHash,
            btcTxid: result.btcTxHash,
            btcUnsignedTxHex: result.btcTxHex,
            timestamp: Date.now(),
          },
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
            retryAction: () => submitTransaction(txData),
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
    [btcWalletProvider, btcAddress, handleError],
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
