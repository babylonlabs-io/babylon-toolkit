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
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { getWalletClient } from "wagmi/actions";

import { LOCAL_PEGIN_CONFIG } from "@/config/pegin";

import { CONTRACTS } from "../../../../../config/contracts";
import { useUTXOs } from "../../../../../hooks/useUTXOs";
import {
  getNextLocalStatus,
  LocalStorageStatus,
  PeginAction,
} from "../../../../../models/peginStateMachine";
import { signAndSubmitPayoutSignatures } from "../../../../../services/vault/vaultPayoutSignatureService";
import { createProofOfPossession } from "../../../../../services/vault/vaultProofOfPossessionService";
import { submitPeginRequest } from "../../../../../services/vault/vaultTransactionService";
import {
  addPendingPegin,
  updatePendingPeginStatus,
} from "../../../../../storage/peginStorage";
import { processPublicKeyToXOnly } from "../../../../../utils/btc";
import { usePendingPeginTxPolling } from "../../hooks/usePendingPeginTxPolling";
import { useVaultProviders } from "../../hooks/useVaultProviders";

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
  modalOpen: boolean; // Track if modal is open - used to stop Step 3 auto-signing if modal closes
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
 * Hook to orchestrate deposit flow execution
 *
 * Manages:
 * - Step 1: Proof of possession (BTC signature)
 * - Step 2: WASM transaction creation + ETH submission
 * - Step 3: Poll for payout transactions and sign them
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
    modalOpen,
    onSuccess,
  } = params;

  // Use useState instead of useRef to trigger re-renders
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step3Data, setStep3Data] = useState<{
    btcTxid: string;
    ethTxHash: string;
    depositorBtcPubkey: string;
  } | null>(null);
  const [transactionData, setTransactionData] = useState<
    | {
        unsignedTxHex: string;
        selectedUTXOs: Array<{
          txid: string;
          vout: number;
          value: number;
          scriptPubKey: string;
        }>;
        fee: bigint;
      }
    | undefined
  >(undefined);

  // Get BTC address from wallet provider
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;

  // Fetch UTXOs
  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

  // Get vault providers for step 3
  const { findProvider } = useVaultProviders();

  // Poll for payout transactions (only when step 3 data is available)
  const {
    transactions,
    loading: pollingLoading,
    error: pollingError,
  } = usePendingPeginTxPolling(
    step3Data
      ? {
          peginTxId: step3Data.btcTxid, // Already has 0x prefix
          vaultProviderAddress: selectedProviders[0] as Hex,
          depositorBtcPubkey: step3Data.depositorBtcPubkey,
        }
      : null,
  );

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

      // Prepare UTXO array for service (service will select appropriate UTXO)
      const availableUTXOs = confirmedUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        scriptPubKey: utxo.scriptPubKey,
      }));

      // Submit peg-in request (creates WASM tx + submits ETH tx)
      const result = await submitPeginRequest(
        ethWalletClient,
        ethChain,
        CONTRACTS.VAULT_CONTROLLER,
        depositorBtcPubkey,
        amount,
        availableUTXOs, // Pass array of available UTXOs
        Number(LOCAL_PEGIN_CONFIG.btcTransactionFee), // Use fixed fee for UTXO selection
        btcAddress, // Change address
        selectedProviders[0] as Address,
        processedVaultProviderKey,
        processedLiquidatorKeys,
      );

      // ====================================================================
      // STEP 2 COMPLETE: Add to localStorage immediately, prepare foy payout signing
      // ====================================================================
      // Ensure btcTxid has 0x prefix to match contract format
      // IMPORTANT: The smart contract stores BTC txids as Hex type (with 0x prefix)
      // and uses them as keys in the btcVaults mapping
      const btcTxidWithPrefix = result.btcTxid.startsWith("0x")
        ? result.btcTxid
        : `0x${result.btcTxid}`;

      // Store transaction data for localStorage caching (cross-device support)
      const transactionDataForStorage = {
        unsignedTxHex: result.btcTxHex,
        selectedUTXOs: result.selectedUTXOs,
        fee: result.fee,
      };

      setTransactionData(transactionDataForStorage);

      // Add to localStorage immediately after Step 2 with PENDING status
      // This ensures the pegin is tracked even if the user closes the modal
      if (depositorEthAddress) {
        const amountInBTC = (Number(amount) / 100000000).toString();

        addPendingPegin(depositorEthAddress, {
          id: btcTxidWithPrefix,
          amount: amountInBTC,
          providerIds: selectedProviders.map((p) => p),
          btcTxHash: result.btcTxid,
          status: LocalStorageStatus.PENDING, // Initial status after ETH submission
          unsignedTxHex: transactionDataForStorage.unsignedTxHex,
          selectedUTXOs: transactionDataForStorage.selectedUTXOs.map(
            (utxo) => ({
              txid: utxo.txid,
              vout: utxo.vout,
              value: utxo.value.toString(),
              scriptPubKey: utxo.scriptPubKey,
            }),
          ),
        });
      }

      // ====================================================================
      // STEP 3: Prepare for payout signing
      // ====================================================================
      setCurrentStep(3);

      // Store data for step 3 (this will trigger polling via useEffect)
      setStep3Data({
        btcTxid: btcTxidWithPrefix,
        ethTxHash: result.transactionHash,
        depositorBtcPubkey: depositorBtcPubkey.startsWith("0x")
          ? depositorBtcPubkey.slice(2)
          : depositorBtcPubkey,
      });

      // Don't call onSuccess yet - it will be called after step 3 completes
      // Keep processing state true to show loading during polling
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
    selectedProviders,
    utxoError,
    vaultProviderBtcPubkey,
  ]);

  // Effect to handle step 3: Sign payout transactions when ready
  useEffect(() => {
    if (!step3Data || !transactions || !depositorEthAddress) {
      return;
    }

    // Handle polling error
    if (pollingError) {
      setError(
        pollingError.message ||
          "Failed to fetch payout transactions from vault provider",
      );
      setProcessing(false);
      return;
    }

    // If still loading, keep waiting
    if (pollingLoading) {
      return;
    }

    // IMPORTANT: Only auto-sign if modal is still open
    // If modal was closed during Step 3, let row-level polling handle it
    if (!modalOpen) {
      return;
    }

    // When transactions are ready and modal is open, sign them
    const signPayoutTransactions = async () => {
      try {
        const provider = findProvider(selectedProviders[0] as Hex);
        if (!provider) {
          throw new Error("Vault provider not found");
        }

        // Extract liquidator BTC pubkeys from vault provider
        const liquidatorBtcPubkeys =
          provider.liquidators?.map(
            (liq: { btc_pub_key: string }) => liq.btc_pub_key,
          ) || [];

        const vaultProvider = {
          url: provider.url,
          address: provider.id as Hex,
          btcPubkey: provider.btc_pub_key,
          liquidatorBtcPubkeys,
        };

        // Get BTC wallet provider
        const btcWalletProvider = btcConnector?.connectedWallet?.provider;
        if (!btcWalletProvider) {
          throw new Error("BTC wallet not connected");
        }

        // Sign and submit payout signatures
        await signAndSubmitPayoutSignatures({
          peginTxId: step3Data.btcTxid,
          depositorBtcPubkey: step3Data.depositorBtcPubkey,
          claimerTransactions: transactions,
          vaultProvider,
          btcWalletProvider: {
            signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
          },
        });

        // Update localStorage status using state machine
        const nextStatus = getNextLocalStatus(
          PeginAction.SIGN_PAYOUT_TRANSACTIONS,
        );
        if (nextStatus) {
          updatePendingPeginStatus(
            depositorEthAddress,
            step3Data.btcTxid,
            nextStatus,
          );
        }

        // All steps complete - call success callback with transaction data
        setProcessing(false);
        onSuccess(
          step3Data.btcTxid,
          step3Data.ethTxHash,
          step3Data.depositorBtcPubkey,
          transactionData, // Pass transaction data for localStorage caching
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to sign payout transactions",
        );
        setProcessing(false);
      }
    };

    signPayoutTransactions();
  }, [
    step3Data,
    transactions,
    pollingLoading,
    pollingError,
    depositorEthAddress,
    findProvider,
    selectedProviders,
    btcConnector,
    onSuccess,
    transactionData,
    modalOpen,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
  };
}
