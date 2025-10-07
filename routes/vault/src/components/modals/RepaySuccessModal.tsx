import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

import mascotSmile from "../../assets/mascot-smile-expression.png";

interface RepaySuccessModalProps {
  open: boolean;
  onClose: () => void;
  repayAmount: string;
  btcAmount: string;
}

/**
 * RepaySuccessModal - Success celebration modal after repayment completion
 * 
 * Displays:
 * - "Repayment and Withdrawal Successful" heading
 * - Repaid amount and BTC released confirmation
 * - "Done" button to close
 */
export function RepaySuccessModal({
  open,
  onClose,
  repayAmount,
  btcAmount,
}: RepaySuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src={mascotSmile}
          alt="Success mascot"
          className="mx-auto mb-6 size-[200px] sm:size-[300px]"
        />

        <Heading variant="h4" className="mb-4 text-xl sm:text-2xl">
          Repayment and Withdrawal Successful
        </Heading>

        <Text variant="body1" className="text-sm text-accent-secondary sm:text-base">
          You have repaid {repayAmount} USDC and your {btcAmount} BTC
          <br />
          has been released back to your wallet.
        </Text>
      </DialogBody>

      <DialogFooter className="flex gap-4 px-4 pb-8 sm:px-6">
        <Button
          variant="contained"
          color="primary"
          onClick={onClose}
          className="w-full"
        >
          Done
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
