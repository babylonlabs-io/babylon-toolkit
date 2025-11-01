/**
 * useDepositFlow Hook
 *
 * Orchestrates the complete deposit submission flow:
 * 1. Proof of possession (BIP-322 signature)
 * 2. Create unsigned BTC transaction via WASM
 * 3. Submit to smart contract (ETH transaction)
 *
 * This hook is called from SignModal and handles
 * the business logic layer between UI and services.
 */

import { getETHChain } from "@babylonlabs-io/config";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { getWalletClient } from "wagmi/actions";

import { CONTRACTS } from "../../../../../config/contracts";
import { LOCAL_PEGIN_CONFIG } from "../../../../../config/pegin";
import { useUTXOs } from "../../../../../hooks/useUTXOs";
import { createProofOfPossession } from "../../../../../services/vault/vaultProofOfPossessionService";
import { submitPeginRequest } from "../../../../../services/vault/vaultTransactionService";
import { processPublicKeyToXOnly } from "../../../../../utils/btc";

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
  onSuccess: (btcTxid: string, ethTxHash: string) => void;
}

export interface UseDepositFlowReturn {
  executeDepositFlow: () => Promise<void>;
  currentStep: number;
  processing: boolean;
  error: string | null;
}

/**
 * Hook to orchestrate deposit flow execution
 *
 * Manages:
 * - Step 1: Proof of possession (BTC signature)
 * - Step 2: WASM transaction creation + ETH submission
 * - Step 3: Complete
 *
 * @param params - Deposit parameters
 * @returns Execution function and state
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

  // Use useState instead of useRef to trigger re-renders
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get BTC address from wallet provider
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

      // Validation checks
      if (!btcAddress) {
        throw new Error("BTC wallet not connected");
      }
      if (!depositorEthAddress) {
        throw new Error("ETH wallet not connected");
      }
      if (amount <= 0n) {
        throw new Error("Invalid deposit amount");
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

      // ====================================================================
      // STEP 1: Create proof of possession (BIP-322 signature)
      // ====================================================================
      setCurrentStep(1);

      await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress,
        signMessage: (message: string) =>
          btcWalletProvider.signMessage(message, "bip322-simple"),
      });

      // ====================================================================
      // STEP 2: Create WASM transaction + Submit to smart contract
      // ====================================================================
      setCurrentStep(2);

      // Get depositor's BTC public key
      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Process vault provider and liquidator keys (remove 0x prefix if present)
      const processedVaultProviderKey = vaultProviderBtcPubkey.startsWith("0x")
        ? vaultProviderBtcPubkey.slice(2)
        : vaultProviderBtcPubkey;

      const processedLiquidatorKeys = liquidatorBtcPubkeys.map((key) =>
        key.startsWith("0x") ? key.slice(2) : key,
      );

      // Get ETH wallet client
      const ethChain = getETHChain();
      const ethWalletClient = await getWalletClient(getSharedWagmiConfig(), {
        chainId: ethChain.id,
      });

      if (!ethWalletClient) {
        throw new Error("Failed to get ETH wallet client");
      }

      // Select first suitable UTXO
      const requiredAmount =
        amount + BigInt(LOCAL_PEGIN_CONFIG.btcTransactionFee);
      const selectedUTXO = confirmedUTXOs.find(
        (utxo: { value: number }) => utxo.value >= requiredAmount,
      );

      if (!selectedUTXO) {
        throw new Error(
          `No suitable UTXO found. You need at least ${Number(requiredAmount) / 100000000} BTC (including transaction fee).`,
        );
      }

      // Prepare UTXO params for service
      const utxoParams = {
        fundingTxid: selectedUTXO.txid,
        fundingVout: selectedUTXO.vout,
        fundingValue: BigInt(selectedUTXO.value),
        fundingScriptPubkey: selectedUTXO.scriptPubKey,
      };

      // Submit peg-in request (creates WASM tx + submits ETH tx)
      const result = await submitPeginRequest(
        ethWalletClient,
        ethChain,
        CONTRACTS.VAULT_CONTROLLER,
        depositorBtcPubkey,
        amount,
        utxoParams,
        selectedProviders[0] as Address,
        processedVaultProviderKey,
        processedLiquidatorKeys,
      );

      // ====================================================================
      // STEP 3: Complete
      // ====================================================================
      setCurrentStep(3);

      // Call success callback with transaction hashes
      onSuccess(result.btcTxid, result.transactionHash);

      setProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setProcessing(false);
    }
  }, [
    amount,
    btcAddress,
    btcWalletProvider,
    confirmedUTXOs,
    depositorEthAddress,
    isUTXOsLoading,
    liquidatorBtcPubkeys,
    onSuccess,
    selectedProviders,
    utxoError,
    vaultProviderBtcPubkey,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
  };
}
