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
import { broadcastPeginTransaction } from '../../../services/btc/broadcastService';
import { CONTRACTS } from '../../../config/contracts';
import { useUTXOs, selectUTXOForPegin } from '../../../hooks/useUTXOs';
import { LOCAL_PEGIN_CONFIG } from '../../../config/pegin';
import { SATOSHIS_PER_BTC } from '../../../utils/peginTransformers';

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
  unsignedTxHex?: string;
  btcTxid?: string;
}

/**
 * Hook to manage peg-in flow state and execution
 *
 * Orchestrates:
 * 1. Proof of possession with BTC wallet
 * 2. Submit unsigned transaction to ETH vault contract
 * 3. Sign and broadcast BTC transaction to Bitcoin network
 * 4. Success/error handling
 *
 * Note: UTXO fetching and validation happens before step 1
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
  const [unsignedTxHex, setUnsignedTxHex] = useState<string | undefined>(undefined);
  const [btcTxid, setBtcTxid] = useState<string | undefined>(undefined);

  // Fetch UTXOs for the connected BTC wallet
  const { confirmedUTXOs, isLoading: isUTXOsLoading, error: utxoError } = useUTXOs(btcAddress);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setProcessing(false);
      setError(null);
      setUnsignedTxHex(undefined);
      setBtcTxid(undefined);
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
      const pegInAmountSats = BigInt(Math.round(amount * Number(SATOSHIS_PER_BTC)));

      // Calculate required amount: peg-in amount + transaction fee
      const requiredAmount = pegInAmountSats + LOCAL_PEGIN_CONFIG.btcTransactionFee;

      // Select suitable UTXO
      const selectedUTXO = selectUTXOForPegin(confirmedUTXOs, requiredAmount);

      if (!selectedUTXO) {
        const requiredBTC = Number(requiredAmount) / Number(SATOSHIS_PER_BTC);
        throw new Error(
          `No suitable UTXO found. You need at least ${requiredBTC.toFixed(8)} BTC (including fees) in a single UTXO. Please consolidate your UTXOs or add more funds.`,
        );
      }

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
      );

      // Store unsigned transaction hex for broadcasting
      setUnsignedTxHex(result.btcTxHex);

      // Step 3: Sign and broadcast BTC transaction to Bitcoin network
      setCurrentStep(3);

      // Get BTC wallet provider for signing
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error('BTC wallet not connected');
      }

      // Broadcast the PegIn transaction to Bitcoin network
      const broadcastedTxId = await broadcastPeginTransaction({
        unsignedTxHex: result.btcTxHex,
        utxo: {
          txid: selectedUTXO.txid,
          vout: selectedUTXO.vout,
          value: BigInt(selectedUTXO.value),
          scriptPubKey: selectedUTXO.scriptPubKey,
        },
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      setBtcTxid(broadcastedTxId);

      // Step 4: Complete
      setCurrentStep(4);
      setProcessing(false);

      // Pass broadcasted BTC transaction ID and ETH transaction hash to parent
      onSuccess(broadcastedTxId, result.transactionHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setProcessing(false);
    }
  };

  return {
    currentStep,
    processing,
    error,
    isComplete: currentStep === 4,
    unsignedTxHex,
    btcTxid,
  };
}
