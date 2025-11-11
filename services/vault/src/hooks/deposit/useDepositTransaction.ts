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
import type { VaultProvider } from "@/types/vaultProvider";
import { processPublicKeyToXOnly } from "@/utils/btc";
import { formatErrorMessage } from "@/utils/errors";

export interface CreateDepositTransactionParams {
  amount: string;
  selectedProviders: string[];
  btcAddress: string;
  ethAddress: Hex;
  providers?: VaultProvider[];
}

export interface TransactionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UseDepositTransactionResult {
  createDepositTransaction: (
    params: CreateDepositTransactionParams,
  ) => Promise<TransactionResult<DepositTransactionData>>;

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
  const { providers: availableProviders } = useVaultProviders();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTransaction, setLastTransaction] =
    useState<DepositTransactionData | null>(null);

  const reset = useCallback(() => {
    setIsCreating(false);
    setIsSubmitting(false);
    setLastTransaction(null);
  }, []);

  const createDepositTransaction = useCallback(
    async (
      params: CreateDepositTransactionParams,
    ): Promise<TransactionResult<DepositTransactionData>> => {
      setIsCreating(true);

      try {
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }
        if (!params.ethAddress) {
          throw new Error("ETH address not provided");
        }

        const pegInAmount = depositService.parseBtcToSatoshis(params.amount);

        const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
        const btcPubkey = processPublicKeyToXOnly(publicKeyHex);

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
            selectedProvider.liquidators?.map((liq) => liq.btc_pub_key) || [],
        };

        if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
          throw new Error("No confirmed UTXOs available");
        }

        const formattedUTXOs = confirmedUTXOs.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          scriptPubKey: utxo.scriptPubKey || "",
        }));

        const fees = depositService.calculateDepositFees(pegInAmount, 1);
        const requiredAmount = pegInAmount + fees.totalFee;

        const { selected: selectedUTXOs } = depositService.selectOptimalUTXOs(
          formattedUTXOs,
          requiredAmount,
        );

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

  const submitTransaction = useCallback(
    async (txData: DepositTransactionData): Promise<TransactionResult> => {
      setIsSubmitting(true);

      try {
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }

        const wagmiConfig = getSharedWagmiConfig();
        const expectedChainId = getETHChain().id;
        const walletClient = (await getWalletClient(wagmiConfig, {
          chainId: expectedChainId,
        })) as WalletClient;

        if (!walletClient) {
          throw new Error("No wallet client available");
        }

        const depositorBtcPubkey = txData.depositorBtcPubkey.startsWith("0x")
          ? txData.depositorBtcPubkey.slice(2)
          : txData.depositorBtcPubkey;

        const selectedUTXO = txData.selectedUTXOs[0];
        if (!selectedUTXO) {
          throw new Error("No UTXO selected for transaction");
        }

        const result = await vaultTransactionService.submitPeginRequest(
          walletClient,
          getETHChain(),
          CONTRACTS.VAULT_CONTROLLER as Address,
          depositorBtcPubkey,
          txData.pegInAmount,
          [selectedUTXO],
          Number(txData.fee),
          "",
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
