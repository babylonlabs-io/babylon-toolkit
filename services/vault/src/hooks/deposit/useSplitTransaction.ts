/**
 * Hook for planning and executing the split transaction.
 *
 * Extracts Steps 0-2 from useMultiVaultDepositFlow so the split TX
 * can be signed and broadcast on the split choice screen, before
 * entering the multi-vault deposit flow.
 */

import { pushTx } from "@babylonlabs-io/ts-sdk";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { useUTXOs } from "@/hooks/useUTXOs";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import { planUtxoAllocation, type AllocationPlan } from "@/services/vault";

import {
  createAndSignSplitTransaction,
  type SplitTxSignResult,
} from "./useMultiVaultDepositFlow";

interface UseSplitTransactionParams {
  vaultAmounts: bigint[];
  feeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
}

interface UseSplitTransactionReturn {
  executeSplit: () => Promise<{
    plan: AllocationPlan;
    splitTxResult: SplitTxSignResult | null;
  } | null>;
  processing: boolean;
  error: string | null;
}

export function useSplitTransaction(
  params: UseSplitTransactionParams,
): UseSplitTransactionReturn {
  const {
    vaultAmounts,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;
  const {
    spendableUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

  const executeSplit = useCallback(async () => {
    setProcessing(true);
    setError(null);

    try {
      // Step 0: Validation
      validateMultiVaultDepositInputs({
        btcAddress,
        depositorEthAddress,
        vaultAmounts,
        selectedProviders,
        confirmedUTXOs: spendableUTXOs,
        isUTXOsLoading,
        utxoError,
        vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys,
      });

      // Step 1: Plan UTXO allocation
      const plan = planUtxoAllocation(
        spendableUTXOs,
        vaultAmounts,
        feeRate,
        btcAddress!,
      );

      // Step 2: Create and broadcast split TX (if needed)
      let splitTxResult: SplitTxSignResult | null = null;

      if (plan.needsSplit && plan.splitTransaction) {
        splitTxResult = await createAndSignSplitTransaction(
          plan.splitTransaction,
          btcWalletProvider,
        );

        try {
          await pushTx(splitTxResult.signedHex, getMempoolApiUrl());
        } catch (broadcastError) {
          throw new Error(
            `Failed to broadcast split transaction: ${broadcastError instanceof Error ? broadcastError.message : String(broadcastError)}`,
          );
        }
      }

      return { plan, splitTxResult };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return null;
    } finally {
      setProcessing(false);
    }
  }, [
    btcAddress,
    depositorEthAddress,
    vaultAmounts,
    selectedProviders,
    spendableUTXOs,
    isUTXOsLoading,
    utxoError,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    feeRate,
    btcWalletProvider,
  ]);

  return { executeSplit, processing, error };
}
