/**
 * Deposit transaction hook
 *
 * Handles transaction creation, signing, and submission for deposits.
 * Integrates with wallet providers and blockchain clients.
 */

import { getETHChain } from "@babylonlabs-io/config";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address, Hex, WalletClient } from "viem";
import { getWalletClient } from "wagmi/actions";

import { useVaultProviders } from "@/components/Overview/Deposits/hooks/useVaultProviders";
import { CONTRACTS } from "@/config/contracts";
import { useBTCWallet } from "@/context/wallet";
import { useUTXOs } from "@/hooks/useUTXOs";
import type { DepositTransactionData } from "@/services/deposit";
import { depositService } from "@/services/deposit";
import * as vaultBtcTransactionService from "@/services/vault/vaultBtcTransactionService";
import * as vaultTransactionService from "@/services/vault/vaultTransactionService";
import { processPublicKeyToXOnly } from "@/utils/btc";
import { formatErrorMessage } from "@/utils/errors";

export interface CreateDepositTransactionParams {
  amount: string;
  selectedProviders: string[];
  btcAddress: string;
  ethAddress: Hex;
  providers?: any[]; // Optional: pass providers if already fetched
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
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const { address: btcAddress } = useBTCWallet();
  const { confirmedUTXOs } = useUTXOs(btcAddress);
  const { providers: availableProviders } = useVaultProviders();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTransaction, setLastTransaction] =
    useState<DepositTransactionData | null>(null);

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
        // Validate wallet connections
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }
        if (!params.ethAddress) {
          throw new Error("ETH address not provided");
        }

        // Parse amount
        const pegInAmount = depositService.parseBtcToSatoshis(params.amount);

        // Get BTC public key from wallet
        const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
        const btcPubkey = processPublicKeyToXOnly(publicKeyHex);

        // Get provider data from API or use passed providers
        const providers = params.providers || availableProviders;
        if (!providers || providers.length === 0) {
          throw new Error("No providers available");
        }

        const selectedProvider = providers.find(
          (p) =>
            p.id.toLowerCase() === params.selectedProviders[0].toLowerCase(),
        );

        if (!selectedProvider) {
          throw new Error("Selected provider not found");
        }

        const providerData = {
          address: selectedProvider.id as Hex,
          btcPubkey: selectedProvider.btc_pub_key || "",
          liquidatorPubkeys:
            selectedProvider.liquidators?.map((liq: any) => liq.btc_pub_key) ||
            [],
        };

        // Get actual UTXOs from wallet
        if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
          throw new Error("No confirmed UTXOs available");
        }

        // Convert mempool UTXOs to the format expected by the service
        const formattedUTXOs = confirmedUTXOs.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          scriptPubKey: utxo.scriptPubKey || "",
        }));

        // Calculate fees and select UTXOs
        const fees = depositService.calculateDepositFees(pegInAmount, 1);
        const requiredAmount = pegInAmount + fees.totalFee;

        const { selected: selectedUTXOs } = depositService.selectOptimalUTXOs(
          formattedUTXOs,
          requiredAmount,
        );

        // Build transaction data structure
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

        // Create unsigned BTC transaction using WASM
        // Note: Current implementation only supports single UTXO
        const selectedUTXO = selectedUTXOs[0];
        if (!selectedUTXO) {
          throw new Error("No UTXO selected");
        }

        const unsignedTx =
          await vaultBtcTransactionService.createPeginTxForSubmission({
            depositorBtcPubkey: btcPubkey.startsWith("0x")
              ? btcPubkey.slice(2)
              : btcPubkey,
            pegInAmount,
            fundingTxid: selectedUTXO.txid,
            fundingVout: selectedUTXO.vout,
            fundingValue: BigInt(selectedUTXO.value),
            fundingScriptPubkey: selectedUTXO.scriptPubKey,
            vaultProviderBtcPubkey: providerData.btcPubkey.startsWith("0x")
              ? providerData.btcPubkey.slice(2)
              : providerData.btcPubkey,
            liquidatorBtcPubkeys: providerData.liquidatorPubkeys.map(
              (key: string) => (key.startsWith("0x") ? key.slice(2) : key),
            ),
          });

        txData.unsignedTxHex = unsignedTx.unsignedTxHex;

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
    [btcWalletProvider, confirmedUTXOs, availableProviders],
  );

  // Submit transaction to blockchain
  const submitTransaction = useCallback(
    async (txData: DepositTransactionData): Promise<TransactionResult> => {
      setIsSubmitting(true);

      try {
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }

        // Get wallet client for ETH transactions
        const wagmiConfig = getSharedWagmiConfig();
        const expectedChainId = getETHChain().id;
        const walletClient = (await getWalletClient(wagmiConfig, {
          chainId: expectedChainId,
        })) as WalletClient;

        if (!walletClient) {
          throw new Error("No wallet client available");
        }

        // Prepare transaction parameters
        const depositorBtcPubkey = txData.depositorBtcPubkey.startsWith("0x")
          ? txData.depositorBtcPubkey.slice(2)
          : txData.depositorBtcPubkey;

        const selectedUTXO = txData.selectedUTXOs[0];
        if (!selectedUTXO) {
          throw new Error("No UTXO selected for transaction");
        }

        // Submit pegin request to ETH contract
        const result = await vaultTransactionService.submitPeginRequest(
          walletClient,
          getETHChain(),
          CONTRACTS.VAULT_CONTROLLER as Address,
          depositorBtcPubkey,
          txData.pegInAmount,
          [selectedUTXO],
          Number(txData.fee),
          "", // change address - not used in current implementation
          txData.vaultProviderAddress,
          txData.vaultProviderBtcPubkey.startsWith("0x")
            ? txData.vaultProviderBtcPubkey.slice(2)
            : txData.vaultProviderBtcPubkey,
          txData.liquidatorBtcPubkeys.map((key: string) =>
            key.startsWith("0x") ? key.slice(2) : key,
          ),
        );

        return {
          success: true,
          data: {
            ethTxHash: result.transactionHash,
            btcTxid: result.btcTxid,
            btcUnsignedTxHex: result.btcTxHex,
            timestamp: Date.now(),
          },
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
    [btcWalletProvider],
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
