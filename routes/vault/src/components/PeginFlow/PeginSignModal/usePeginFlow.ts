/**
 * usePeginFlow Hook
 *
 * Manages the peg-in submission flow state and orchestration.
 * Extracts all business logic from PeginSignModal for cleaner separation of concerns.
 */

import { useState, useEffect } from 'react';
import type { Address } from 'viem';
import { submitPeginRequest } from '../../../services/vault/vaultTransactionService';
import { createProofOfPossession } from '../../../transactions/btc/proofOfPossession';
import { CONTRACTS } from '../../../config/contracts';
import { useUTXOs, selectUTXOForPegin } from '../../../hooks/useUTXOs';
import { SATOSHIS_PER_BTC } from '../../../utils/peginTransformers';
import type { VaultProvider } from '../../../clients/vault-api/types';
import { LOCAL_PEGIN_CONFIG } from '../../../config/pegin';
import { processPublicKeyToXOnly } from '../../../utils/btc';
import { estimatePeginFee, getMaxPeginFee } from '../../../utils/fee/peginFee';
import { useNetworkFees } from '../../../hooks/useNetworkFees';

/**
 * BTC wallet provider interface
 * Defines the minimal interface needed from BTC wallet for peg-in flow
 */
interface BtcWalletProvider {
  signMessage: (message: string, type: 'ecdsa' | 'bip322-simple') => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
}

interface UsePeginFlowParams {
  open: boolean;
  amount: number;
  btcWalletProvider?: BtcWalletProvider;
  btcAddress: string;
  depositorEthAddress: Address;
  selectedProviders: VaultProvider[];
  onSuccess: (data: {
    btcTxId: string;
    ethTxHash: string;
    unsignedTxHex: string;
    utxo: {
      txid: string;
      vout: number;
      value: bigint;
      scriptPubKey: string;
    };
  }) => void;
}

interface UsePeginFlowReturn {
  currentStep: number;
  processing: boolean;
  error: string | null;
  isComplete: boolean;
  unsignedTxHex?: string;
  btcTxid?: string;
  ethTxHash?: string;
}

/**
 * Hook to manage peg-in flow state and execution
 *
 * Orchestrates:
 * 1. Proof of possession with BTC wallet
 * 2. Submit unsigned transaction to ETH vault contract
 *
 * Note: BTC broadcasting moved to separate button (after vault verification)
 * Note: UTXO fetching and validation happens before step 1
 */
export function usePeginFlow({
  open,
  amount,
  btcWalletProvider,
  btcAddress,
  depositorEthAddress,
  selectedProviders,
  onSuccess,
}: UsePeginFlowParams): UsePeginFlowReturn {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsignedTxHex, setUnsignedTxHex] = useState<string | undefined>(
    undefined,
  );
  const [btcTxid, setBtcTxid] = useState<string | undefined>(undefined);
  const [ethTxHash, setEthTxHash] = useState<string | undefined>(undefined);

  // Fetch UTXOs for the connected BTC wallet
  const {
    confirmedUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

  // Fetch dynamic fee rates from mempool API
  const { data: networkFees } = useNetworkFees();

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setProcessing(false);
      setError(null);
      setUnsignedTxHex(undefined);
      setBtcTxid(undefined);
      setEthTxHash(undefined);
    }
  }, [open]);

  // Execute peg-in flow when modal opens
  useEffect(() => {
    if (open && currentStep === 1 && !processing && !error) {
      executePeginFlow();
    }
  }, [open, currentStep, processing, error]);

  const executePeginFlow = async () => {
    setProcessing(true);
    setError(null);

    try {
      // Validate selected providers
      if (!selectedProviders || selectedProviders.length === 0) {
        throw new Error('No vault provider selected. Please select at least one provider.');
      }

      // Use the first selected provider (already have full object from parent)
      // TODO: Support multiple providers in the future
      const selectedProvider = selectedProviders[0];

      // Validate UTXOs availability (happens before step 1)
      if (isUTXOsLoading) {
        throw new Error('Loading wallet UTXOs. Please wait...');
      }

      if (utxoError) {
        throw new Error(`Failed to fetch UTXOs: ${utxoError.message}`);
      }

      if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
        throw new Error(
          'No confirmed UTXOs found in your wallet. Please ensure you have confirmed BTC in your wallet.',
        );
      }

      // Convert BTC amount to satoshis
      const pegInAmountSats = BigInt(
        Math.round(amount * Number(SATOSHIS_PER_BTC)),
      );

      // Get fee rate: Use hourFee from mempool API, or fallback to hardcoded value
      // hourFee provides good balance between speed (~1 hour) and cost
      const feeRate = networkFees?.hourFee || LOCAL_PEGIN_CONFIG.fallbackFeeRate;

      // Calculate MAXIMUM possible fee for UTXO selection
      // This is the worst case: transaction with a change output (2 outputs total)
      // Using max fee ensures selected UTXO can cover peg-in + fees regardless of change
      const maxPossibleFee = getMaxPeginFee(feeRate);

      // Select first UTXO that can cover peg-in amount + maximum possible fee
      // Single-pass selection: O(n) instead of O(n²) iteration
      const selectedUTXO = confirmedUTXOs.find(
        (utxo) => BigInt(utxo.value) >= pegInAmountSats + maxPossibleFee,
      );

      if (!selectedUTXO) {
        // Show helpful error with actual numbers
        const requiredAmount = pegInAmountSats + maxPossibleFee;
        const requiredBTC = Number(requiredAmount) / Number(SATOSHIS_PER_BTC);
        const maxAvailable =
          confirmedUTXOs.length > 0
            ? Math.max(...confirmedUTXOs.map((u) => u.value))
            : 0;
        const maxAvailableBTC = maxAvailable / Number(SATOSHIS_PER_BTC);
        const feeInBTC = Number(maxPossibleFee) / Number(SATOSHIS_PER_BTC);

        throw new Error(
          `Insufficient funds in single UTXO.\n\n` +
            `Required: ${requiredBTC.toFixed(8)} BTC\n` +
            `  ├─ Peg-in amount: ${(amount).toFixed(8)} BTC\n` +
            `  └─ Max fee (${feeRate} sat/vb): ${feeInBTC.toFixed(8)} BTC\n\n` +
            `Largest available UTXO: ${maxAvailableBTC.toFixed(8)} BTC\n\n` +
            `Please consolidate your UTXOs or add more funds to a single UTXO.`,
        );
      }

      // Calculate ACTUAL fee for the selected UTXO
      // This will be <= maxPossibleFee and is what we'll actually pay
      const actualFee = estimatePeginFee(
        pegInAmountSats,
        BigInt(selectedUTXO.value),
        feeRate,
      );

      // Step 1: Proof of Possession
      setCurrentStep(1);

      // Validate BTC wallet provider
      if (!btcWalletProvider) {
        throw new Error('BTC wallet not connected');
      }

      // Create proof of possession (REQUIRED)
      // Wrap signMessage to handle the type parameter (use BIP-322 for proof of possession)
      await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress: btcAddress,
        signMessage: (message: string) => btcWalletProvider.signMessage(message, 'bip322-simple'),
      });

      // Step 2: Prepare and submit transaction (ETH wallet signs and waits for confirmation)
      setCurrentStep(2);

      // Get depositor's BTC public key and convert to x-only format
      const publicKeyHex = await btcWalletProvider.getPublicKeyHex();
      const depositorBtcPubkey = processPublicKeyToXOnly(publicKeyHex);

      // Process vault provider's BTC public key (convert to x-only format)
      const vaultProviderBtcPubkey = processPublicKeyToXOnly(selectedProvider.btc_pub_key);

      // Submit to smart contract (ETH wallet signs, broadcasts, and waits for confirmation)
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
        selectedProvider.id as Address,
        vaultProviderBtcPubkey,
        feeRate, // Dynamic fee rate from mempool API
      );

      // Store unsigned transaction hex and ETH tx hash for later BTC broadcasting
      setUnsignedTxHex(result.btcTxHex);
      setEthTxHash(result.transactionHash);

      // Store BTC txid (calculated from unsigned tx, not yet broadcast)
      setBtcTxid(result.btcTxid);

      // Step 2 Complete - stop here, BTC broadcast happens later
      // (after vault provider verification via separate button)
      setCurrentStep(3); // Set to 3 to show step 2 as complete (checkmark, not spinner)
      setProcessing(false);

      // Pass all data to parent including unsigned TX and UTXO for localStorage caching
      // Note: btcTxid is the EXPECTED transaction ID, BTC tx not yet broadcast
      //
      // CACHING STRATEGY:
      // - Store unsignedTxHex & UTXO in localStorage as OPTIONAL cache (faster broadcasting)
      // - Cross-device broadcasting works WITHOUT these cached values by:
      //   1. Fetching unsignedTxHex from ETH contract
      //   2. Deriving UTXO from unsignedTxHex + mempool API queries
      onSuccess({
        btcTxId: result.btcTxid,
        ethTxHash: result.transactionHash,
        // unsignedTxHex + utxo -> Cache for performance (optional)
        unsignedTxHex: result.btcTxHex,
        utxo: {
          txid: selectedUTXO.txid,
          vout: selectedUTXO.vout,
          value: BigInt(selectedUTXO.value),
          scriptPubKey: selectedUTXO.scriptPubKey,
        },
      });
    } catch (err) {
      // Log full error for debugging
      console.error('Peg-in flow error:', err);

      // Extract error message
      let errorMessage = 'Unknown error occurred';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        // Try to extract useful error info from object
        const errorObj = err as Record<string, unknown>;
        errorMessage =
          (typeof errorObj.message === 'string' ? errorObj.message : undefined) ||
          (typeof errorObj.reason === 'string' ? errorObj.reason : undefined) ||
          (typeof errorObj.shortMessage === 'string' ? errorObj.shortMessage : undefined) ||
          JSON.stringify(err);
      }

      setError(errorMessage);
      setProcessing(false);
    }
  };

  return {
    currentStep,
    processing,
    error,
    isComplete: currentStep === 3,
    unsignedTxHex,
    btcTxid,
    ethTxHash,
  };
}
