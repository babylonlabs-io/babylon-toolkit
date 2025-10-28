/**
 * useDepositFlow Hook
 *
 * Manages the deposit (peg-in) submission flow state and orchestration.
 * Integrates with committed service layer and properly handles wallet clients.
 */

import { useCallback, useState } from "react";
import type { Address } from "viem";

import { createProofOfPossession } from "../services/vault/vaultProofOfPossessionService";
// import { processPublicKeyToXOnly } from "../utils/btcUtils";
import { SATOSHIS_PER_BTC } from "../utils/peginTransformers";

import { useUTXOs } from "./useUTXOs";

/**
 * Default fee for pegin transactions (10,000 sats = ~$10 at $100k BTC)
 * This is a conservative estimate that should cover most transaction fees
 */
// const DEFAULT_PEGIN_FEE = 10_000n;

/**
 * TODO: Replace with proper error handling and logging from shared infrastructure
 * This is a temporary implementation until vault routes are integrated with
 * the main app's error handling context (ErrorProvider) and logging (Sentry)
 */
const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`[useDepositFlow] ${message}`, data);
  },
  error: (
    error: Error,
    data?: { tags?: Record<string, unknown>; data?: Record<string, unknown> },
  ) => {
    console.error(`[useDepositFlow] Error:`, error.message, data);
    console.error(error);
  },
};

/**
 * BTC wallet provider interface
 * Defines the minimal interface needed from BTC wallet for deposit flow
 */
interface BtcWalletProvider {
  signMessage: (
    message: string,
    type: "ecdsa" | "bip322-simple",
  ) => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  getAddress: () => Promise<string>;
}

export interface UseDepositFlowParams {
  /** Amount to deposit in BTC */
  amount: number;
  /** BTC wallet provider */
  btcWalletProvider: BtcWalletProvider | null;
  /** Depositor's ETH address */
  depositorEthAddress: Address | undefined;
  /** Selected vault provider ETH addresses */
  selectedProviders: string[];
  /** Selected vault provider's BTC public key (from API) */
  vaultProviderBtcPubkey: string;
  /** Liquidator BTC public keys (from API) */
  liquidatorBtcPubkeys: string[];
  /** Callback on successful deposit - TODO: Re-enable when wallet providers added */
  onSuccess?: (btcTxid: string, ethTxHash: string, btcTxHex: string) => void;
}

export interface UseDepositFlowReturn {
  /** Execute the deposit flow */
  executeDepositFlow: () => Promise<void>;
  /** Current step in the flow (1-3) */
  currentStep: number;
  /** Whether the flow is processing */
  processing: boolean;
  /** Error message if flow failed */
  error: string | null;
}

/**
 * Hook to manage the deposit submission flow
 *
 * Flow:
 * 1. Create proof of possession (sign ETH address with BTC key)
 * 2. Build and submit pegin transaction to Vault Controller
 * 3. Complete and call success callback
 */
export function useDepositFlow({
  amount,
  btcWalletProvider,
  depositorEthAddress,
  selectedProviders,
  vaultProviderBtcPubkey,
  liquidatorBtcPubkeys,
  // onSuccess - TODO: Re-enable when wallet providers added
}: UseDepositFlowParams): UseDepositFlowReturn {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [btcAddress, setBtcAddress] = useState<string | undefined>(undefined);

  // Fetch UTXOs for the BTC wallet (will be undefined initially until address is set)
  const { confirmedUTXOs } = useUTXOs(btcAddress);

  const executeDepositFlow = useCallback(async () => {
    setProcessing(true);
    setError(null);

    try {
      // Validate prerequisites
      if (!btcWalletProvider) {
        throw new Error("BTC wallet not connected");
      }
      if (!depositorEthAddress) {
        throw new Error("ETH wallet not connected");
      }
      if (selectedProviders.length === 0) {
        throw new Error("No vault provider selected");
      }
      if (!vaultProviderBtcPubkey) {
        throw new Error("Vault provider BTC public key not available");
      }
      if (!liquidatorBtcPubkeys || liquidatorBtcPubkeys.length === 0) {
        throw new Error("Liquidators not available");
      }

      // Get BTC address from provider
      const address = await btcWalletProvider.getAddress();
      if (!address) {
        throw new Error("BTC address not available");
      }
      setBtcAddress(address);

      // Use first selected provider for now (multi-provider support TBD)
      const selectedProvider = selectedProviders[0] as Address;

      // Convert amount from BTC to satoshis
      const pegInAmountSats = BigInt(
        Math.floor(amount * Number(SATOSHIS_PER_BTC)),
      );

      // Step 1: Create proof of possession
      setCurrentStep(1);
      logger.info("Creating proof of possession", {
        category: "vault-deposit",
        depositorEthAddress,
      });

      await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress: address,
        signMessage: (message: string) =>
          btcWalletProvider.signMessage(message, "bip322-simple"),
      });

      // Step 2: Prepare and submit transaction
      setCurrentStep(2);
      logger.info("Submitting deposit request to Vault Controller", {
        category: "vault-deposit",
        amount: pegInAmountSats.toString(),
        provider: selectedProvider,
      });

      // TODO: Re-enable when wallet providers are added
      // Get depositor's BTC public key and convert to x-only format
      // const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      // const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Select suitable UTXO (using default fee)
      // const requiredAmount = pegInAmountSats + DEFAULT_PEGIN_FEE;
      // const selectedUTXO = selectUTXOForPegin(confirmedUTXOs, requiredAmount);

      // if (!selectedUTXO) {
      //   throw new Error(
      //     `No suitable UTXO found. Required: ${requiredAmount} sats. Please ensure you have enough confirmed BTC.`,
      //   );
      // }

      // Submit to smart contract with provider and liquidator data from API
      throw new Error(
        "Wallet providers not yet integrated. This feature will be available soon.",
      );

      // const result = await submitPeginRequest(
      //   walletClient,
      //   chain,
      //   CONTRACTS.VAULT_CONTROLLER,
      //   depositorBtcPubkey,
      //   pegInAmountSats,
      //   {
      //     fundingTxid: selectedUTXO.txid,
      //     fundingVout: selectedUTXO.vout,
      //     fundingValue: BigInt(selectedUTXO.value),
      //     fundingScriptPubkey: selectedUTXO.scriptPubKey,
      //   },
      //   selectedProvider,
      //   vaultProviderBtcPubkey,
      //   liquidatorBtcPubkeys,
      // );

      // TODO: Re-enable when wallet providers are added
      // Step 3: Complete
      // setCurrentStep(3);
      // logger.info("Deposit request submitted successfully", {
      //   category: "vault-deposit",
      //   btcTxid: result.btcTxid,
      //   ethTxHash: result.transactionHash,
      // });

      // setProcessing(false);

      // // Call success callback
      // if (onSuccess) {
      //   onSuccess(result.btcTxid, result.transactionHash, result.btcTxHex);
      // }
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error("Unknown error occurred during deposit flow");

      logger.error(error, {
        tags: { component: "useDepositFlow", step: currentStep },
        data: {
          amount,
          depositorEthAddress,
          selectedProvider: selectedProviders[0],
        },
      });

      setError(error.message);
      setProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amount,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    confirmedUTXOs,
    currentStep,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
  };
}
