/**
 * usePeginFlow Hook
 *
 * Manages the peg-in submission flow state and orchestration.
 * Extracts all business logic from PeginSignModal for cleaner separation of concerns.
 */

import { useState, useEffect } from 'react';
import type { Address } from 'viem';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { submitPeginRequest } from '../../../services/vault/vaultTransactionService';
import { createProofOfPossession } from '../../../transactions/btc/proofOfPossession';
import { CONTRACTS } from '../../../config/contracts';

interface UsePeginFlowParams {
  open: boolean;
  amount: number;
  btcConnector: any;
  btcAddress: string;
  depositorEthAddress: Address;
  onSuccess: (btcTxId: string, ethTxHash: string) => void;
}

interface UsePeginFlowReturn {
  currentStep: number;
  processing: boolean;
  error: string | null;
  isComplete: boolean;
}

/**
 * Hook to manage peg-in flow state and execution
 *
 * Orchestrates:
 * 1. Proof of possession with BTC wallet
 * 2. Transaction submission with ETH wallet
 * 3. Success/error handling
 */
export function usePeginFlow({
  open,
  amount,
  btcConnector,
  btcAddress,
  depositorEthAddress,
  onSuccess,
}: UsePeginFlowParams): UsePeginFlowReturn {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setProcessing(false);
      setError(null);
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
      // Step 1: Proof of Possession
      setCurrentStep(1);

      // Extract signMessage function from BTC wallet provider
      const signMessage = btcConnector?.connectedWallet?.provider?.signMessage;

      // Create proof of possession (REQUIRED)
      await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress: btcAddress,
        signMessage: signMessage,
      });

      // Step 2: Prepare and submit transaction (ETH wallet signs and waits for confirmation)
      setCurrentStep(2);

      // Extract BTC public key from wallet provider
      if (!btcConnector?.connectedWallet?.provider) {
        throw new Error('BTC wallet not connected');
      }

      // Get public key from provider
      const publicKeyHex =
        await btcConnector.connectedWallet.provider.getPublicKeyHex();

      // Convert to x-only pubkey
      const depositorBtcPubkey = toXOnly(
        Buffer.from(publicKeyHex, 'hex'),
      ).toString('hex');

      // Convert BTC amount to satoshis
      const pegInAmountSats = BigInt(Math.round(amount * 100_000_000));

      // Submit to smart contract (ETH wallet signs, broadcasts, and waits for confirmation)
      const result = await submitPeginRequest(
        CONTRACTS.VAULT_CONTROLLER,
        depositorBtcPubkey,
        pegInAmountSats,
      );

      // Step 3: Complete
      setCurrentStep(3);
      setProcessing(false);

      // Pass both BTC transaction ID and ETH transaction hash to parent
      onSuccess(result.btcTxid, result.transactionHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setProcessing(false);
    }
  };

  return {
    currentStep,
    processing,
    error,
    isComplete: currentStep === 3,
  };
}
