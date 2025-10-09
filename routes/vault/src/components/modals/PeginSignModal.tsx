import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Step,
  Text,
} from '@babylonlabs-io/core-ui';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { submitPeginRequest } from '../../services/vault/vaultTransactionService';
import { createProofOfPossession } from '../../services/btc/proofOfPossession';
import { CONTRACTS } from '../../config/contracts';

interface PeginSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (btcTxId: string, ethTxHash: string) => void; // Returns both BTC tx ID and ETH tx hash
  amount: number; // BTC amount decimal
  selectedProviders: string[]; // UI only, not used in contract (HARDCODED vault provider is used for now)
  btcConnector: any;
  btcAddress: string;
  depositorEthAddress: Address;
}

// Helper to delay for UI feedback
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * PeginSignModal - Multi-step signing modal for deposit flow
 *
 * Orchestrates the peg-in submission process:
 * 1. Create proof of possession
 * 2. Create & submit unsigned BTC tx to smart contract
 * 3. Wait for ETH transaction confirmation
 * 4. Complete
 *
 * Note: The selectedProviders prop is for UI display only.
 * The actual vault provider used is HARDCODED from local deployment config.
 */
export function PeginSignModal({
  open,
  onClose,
  onSuccess,
  amount,
  btcConnector,
  btcAddress,
  depositorEthAddress,
}: PeginSignModalProps) {
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
  }, [open]);

  const executePeginFlow = async () => {
    setProcessing(true);
    setError(null);

    try {
      // Step 1: Proof of Possession
      setCurrentStep(1);

      // Extract signMessage function from BTC wallet provider if available
      const signMessage = btcConnector?.connectedWallet?.provider?.signMessage;

      const pop = await createProofOfPossession({
        ethAddress: depositorEthAddress,
        btcAddress: btcAddress, // REAL: From connected BTC wallet
        signMessage: signMessage, // REAL: From BTC wallet if supported
      });

      if (pop) {
        console.log('[PeginSignModal] Proof of possession created');
      } else {
        console.log(
          '[PeginSignModal] Proof of possession skipped (wallet does not support)',
        );
      }

      await delay(500); // UI feedback

      // Step 2: Extract BTC public key and submit peg-in request
      // REAL: This extracts the pubkey from wallet and creates the BTC transaction via WASM
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

      const result = await submitPeginRequest(
        CONTRACTS.VAULT_CONTROLLER,
        depositorBtcPubkey,
        pegInAmountSats,
      );

      // Step 3: Validating (transaction confirmed)
      setCurrentStep(3);
      await delay(500);

      // Step 4: Complete
      setCurrentStep(4);
      await delay(500);

      setProcessing(false);

      // Pass both BTC transaction ID and ETH transaction hash to parent
      onSuccess(result.btcTxid, result.transactionHash);
    } catch (err) {
      console.error('[PeginSignModal] Peg-in failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setProcessing(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Please wait while we process your deposit
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Step 1: Sign proof of possession
          </Step>
          <Step step={2} currentStep={currentStep}>
            Step 2: Sign & broadcast pegInRequest to Vault Controller
          </Step>
          <Step step={3} currentStep={currentStep}>
            Step 3: Validating
          </Step>
          <Step step={4} currentStep={currentStep}>
            Step 4: Complete
          </Step>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-error/10 p-4">
            <Text variant="body2" className="text-sm text-error">
              Error: {error}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={processing && !error}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={error ? onClose : () => {}}
        >
          {processing && !error ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            'Close'
          ) : (
            'View Position'
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
