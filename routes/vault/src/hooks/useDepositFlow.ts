/**
 * useDepositFlow Hook
 *
 * Manages the deposit (peg-in) submission flow state and orchestration.
 * Extracts business logic from CollateralDepositSignModal for cleaner separation.
 */

import { useState, useCallback } from 'react';
import type { Address } from 'viem';
import { submitPeginRequest } from '../services/vault/vaultTransactionService';
import { createProofOfPossession } from '../transactions/btc/proofOfPossession';
import { CONTRACTS } from '../config/contracts';
import { useUTXOs, selectUTXOForPegin } from './useUTXOs';
import { SATOSHIS_PER_BTC } from '../utils/peginTransformers';
import { processPublicKeyToXOnly } from '../utils/btcUtils';
import { PEGIN_FEE_CONFIG } from '../config/pegin';

/**
 * TODO: Replace with proper error handling and logging from shared infrastructure
 * This is a temporary implementation until vault routes are integrated with
 * the main app's error handling context (ErrorProvider) and logging (Sentry)
 */
const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`[useDepositFlow] ${message}`, data);
  },
  error: (error: Error, data?: { tags?: Record<string, unknown>; data?: Record<string, unknown> }) => {
    console.error(`[useDepositFlow] Error:`, error.message, data);
    console.error(error);
  },
};

/**
 * BTC wallet provider interface
 * Defines the minimal interface needed from BTC wallet for deposit flow
 */
interface BtcWalletProvider {
  signMessage: (message: string, type: 'ecdsa' | 'bip322-simple') => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  getAddress: () => Promise<string>;
}

interface UseDepositFlowParams {
  amount: number; // in BTC
  btcWalletProvider: BtcWalletProvider | null;
  depositorEthAddress: Address | undefined;
  selectedProviders: string[]; // ETH addresses
  vaultProviderBtcPubkey: string; // Selected vault provider's BTC public key (from API)
  liquidatorBtcPubkeys: string[]; // Liquidators' BTC public keys (from API)
  onSuccess?: (btcTxid: string, ethTxHash: string, btcTxHex: string) => void;
}

interface UseDepositFlowReturn {
  executeDepositFlow: () => Promise<void>;
  currentStep: number;
  processing: boolean;
  error: string | null;
}

/**
 * Hook to manage the deposit submission flow
 */
export function useDepositFlow({
  amount,
  btcWalletProvider,
  depositorEthAddress,
  selectedProviders,
  vaultProviderBtcPubkey,
  liquidatorBtcPubkeys,
  onSuccess,
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
        throw new Error('BTC wallet not connected');
      }
      if (!depositorEthAddress) {
        throw new Error('ETH wallet not connected');
      }
      if (selectedProviders.length === 0) {
        throw new Error('No vault provider selected');
      }
      if (!vaultProviderBtcPubkey) {
        throw new Error('Vault provider BTC public key not available');
      }
      if (!liquidatorBtcPubkeys || liquidatorBtcPubkeys.length === 0) {
        throw new Error('Liquidators not available');
      }

      // Get BTC address from provider
      const address = await btcWalletProvider.getAddress();
      if (!address) {
        throw new Error('BTC address not available');
      }
      setBtcAddress(address);

      // Use first selected provider for now (multi-provider support TBD)
      const selectedProvider = selectedProviders[0] as Address;

      // Convert amount from BTC to satoshis
      const pegInAmountSats = BigInt(Math.floor(amount * Number(SATOSHIS_PER_BTC)));

      // Step 1: Create proof of possession (REQUIRED)
      setCurrentStep(1);
      logger.info('Creating proof of possession', {
        category: 'vault-deposit',
        depositorEthAddress,
      });
      
      await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress: address,
        signMessage: (message: string) => btcWalletProvider.signMessage(message, 'bip322-simple'),
      });

      // Step 2: Prepare and submit transaction
      setCurrentStep(2);
      logger.info('Submitting deposit request to Vault Controller', {
        category: 'vault-deposit',
        amount: pegInAmountSats.toString(),
        provider: selectedProvider,
      });

      // Get depositor's BTC public key and convert to x-only format
      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Select suitable UTXO (using default fee from config)
      const requiredAmount = pegInAmountSats + PEGIN_FEE_CONFIG.defaultFee;
      const selectedUTXO = selectUTXOForPegin(confirmedUTXOs, requiredAmount);

      if (!selectedUTXO) {
        throw new Error(
          `No suitable UTXO found. Required: ${requiredAmount} sats. Please ensure you have enough confirmed BTC.`
        );
      }

      // Submit to smart contract with provider and liquidator data from API
      const result = await submitPeginRequest(
        CONTRACTS.VAULT_CONTROLLER,
        depositorBtcPubkey,
        pegInAmountSats,
        {
          fundingTxid: selectedUTXO.txid,
          fundingVout: selectedUTXO.vout,
          fundingValue: BigInt(selectedUTXO.value),
          fundingScriptPubkey: selectedUTXO.scriptPubKey,
        },
        selectedProvider,
        vaultProviderBtcPubkey,
        liquidatorBtcPubkeys,
      );

      // Step 3: Complete
      setCurrentStep(3);
      logger.info('Deposit request submitted successfully', {
        category: 'vault-deposit',
        btcTxid: result.btcTxid,
        ethTxHash: result.transactionHash,
      });

      setProcessing(false);

      // Call success callback
      if (onSuccess) {
        onSuccess(result.btcTxid, result.transactionHash, result.btcTxHex);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error occurred during deposit flow');
      
      logger.error(error, {
        tags: { component: 'useDepositFlow', step: currentStep },
        data: {
          amount,
          depositorEthAddress,
          selectedProvider: selectedProviders[0],
        },
      });

      setError(error.message);
      setProcessing(false);
    }
  }, [
    amount,
    btcWalletProvider,
    depositorEthAddress,
    selectedProviders,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    confirmedUTXOs,
    onSuccess,
    currentStep,
  ]);

  return {
    executeDepositFlow,
    currentStep,
    processing,
    error,
  };
}

