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

interface PeginSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (btcTxId: string, ethTxHash: string) => void;
  amount: number;
  /**
   * IMPORTANT: selectedProviders is for UI display only.
   * The actual vault provider submitted to the smart contract is HARDCODED
   * from LOCAL_PEGIN_CONFIG for the POC. User selection is currently ignored.
   *
   * In production, this would be used to select the actual vault provider,
   * but for local development we use the fixed Anvil account configured in
   * btc-vault-deployment.
   */
  selectedProviders: string[];
  btcConnector: any;
  btcAddress: string;
  depositorEthAddress: Address;
}

/**
 * PeginSignModal - Multi-step signing modal for deposit flow
 *
 * Displays the progress of the peg-in submission process:
 * 1. Sign proof of possession with BTC wallet
 * 2. Sign with ETH wallet and submit to vault contract
 * 3. Sign and broadcast BTC transaction to Bitcoin network
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
  const { currentStep, processing, error, isComplete } = usePeginFlow({
    open,
    amount,
    btcConnector,
    btcAddress,
    depositorEthAddress,
    onSuccess,
  });

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
            Sign proof of possession (BTC wallet)
          </Step>
          <Step step={2} currentStep={currentStep}>
            Submit to vault contract (ETH wallet)
          </Step>
          <Step step={3} currentStep={currentStep}>
            Broadcast to Bitcoin network (BTC wallet)
          </Step>
          <Step step={4} currentStep={currentStep}>
            Complete
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
          onClick={error || currentStep === 4 ? onClose : () => {}}
        >
          {processing && !error ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            'Close'
          ) : isComplete ? (
            'View Position'
          ) : (
            'Close'
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
