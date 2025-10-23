/**
 * WithdrawSuccessModal - Success confirmation for collateral withdrawal
 */

import {
  Dialog,
  MobileDialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Button,
  useIsMobile,
} from '@babylonlabs-io/core-ui';

interface WithdrawSuccessModalProps {
  open: boolean;
  onClose: () => void;
  collateralAmount?: string;
  collateralSymbol?: string;
}

export function WithdrawSuccessModal({
  open,
  onClose,
  collateralAmount,
  collateralSymbol,
}: WithdrawSuccessModalProps) {
  const isMobileView = useIsMobile(640);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  return (
    <DialogComponent open={open} onClose={onClose} className="w-[41.25rem] max-w-full">
      <DialogHeader title="Withdrawal Successful" onClose={onClose} className="text-accent-primary" />
      <DialogBody className="no-scrollbar text-accent-primary mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 sm:px-6">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="bg-success-main/10 flex size-16 items-center justify-center rounded-full">
            <span className="text-success-main text-3xl">✓</span>
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center">
          <h3 className="text-accent-primary mb-2 text-lg font-semibold">
            Collateral Withdrawn Successfully
          </h3>
          <p className="text-accent-secondary text-sm">
            You have successfully withdrawn {collateralAmount} {collateralSymbol} from your position.
          </p>
        </div>

        {/* Info */}
        <div className="bg-secondary-highlight rounded-lg p-4">
          <div className="text-accent-secondary text-xs">
            Your collateral has been returned to your wallet as vBTC tokens.
          </div>
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0">
        <Button variant="contained" color="primary" onClick={onClose} className="w-full">
          Done
        </Button>
      </DialogFooter>
    </DialogComponent>
  );
}
