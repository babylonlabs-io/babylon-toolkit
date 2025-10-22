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
import type { Address } from 'viem';
import { usePeginFlow } from './usePeginFlow';
import type { VaultProvider } from '../../../types';

/**
 * BTC wallet provider interface
 * Defines the minimal interface needed from BTC wallet for peg-in flow
 */
interface BtcWalletProvider {
  signMessage: (message: string, type: 'ecdsa' | 'bip322-simple') => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
}

interface PeginSignModalProps {
  open: boolean;
  onClose: () => void;
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
  amount: number;
  /**
   * Array of selected vault providers
   * The first provider in the array will be used for the peg-in transaction
   */
  selectedProviders: VaultProvider[];
  btcWalletProvider?: BtcWalletProvider;
  btcAddress: string;
  depositorEthAddress: Address;
}

/**
 * PeginSignModal - Multi-step signing modal for deposit flow
 *
 * Displays the progress of the peg-in submission process:
 * 1. Sign proof of possession with BTC wallet
 * 2. Sign with ETH wallet and submit to vault contract
 */
export function PeginSignModal({
  open,
  onClose,
  onSuccess,
  amount,
  selectedProviders,
  btcWalletProvider,
  btcAddress,
  depositorEthAddress,
}: PeginSignModalProps) {
  const { currentStep, processing, error, isComplete } = usePeginFlow({
    open,
    amount,
    btcWalletProvider,
    btcAddress,
    depositorEthAddress,
    selectedProviders,
    onSuccess,
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="text-accent-primary flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <Text
          variant="body2"
          className="text-accent-secondary text-sm sm:text-base"
        >
          Please wait while we process your deposit
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Sign proof of possession (BTC wallet)
          </Step>
          <Step step={2} currentStep={currentStep}>
            Submit to vault contract (ETH wallet)
          </Step>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
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
          onClick={error || isComplete ? onClose : () => {}}
        >
          {processing && !error ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            'Close'
          ) : isComplete ? (
            'Done'
          ) : (
            'Close'
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
