import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

interface TransactionSuccessModalProps {
  open: boolean;
  onClose: () => void;
  borrowAmount: number;
  borrowSymbol: string;
  collateralAmount: number;
}

/**
 * TransactionSuccessModal - Success celebration modal for borrow/collateral operations
 *
 * Shows different messages based on the operation type:
 * - Only collateral: "Collateral Added Successfully"
 * - Only borrow: "Borrow Successful"
 * - Both: "Transaction Successful"
 */
export function TransactionSuccessModal({
  open,
  onClose,
  borrowAmount,
  borrowSymbol,
  collateralAmount,
}: TransactionSuccessModalProps) {
  // Determine operation type
  const hasCollateral = collateralAmount > 0;
  const hasBorrow = borrowAmount > 0;

  // Format amounts with commas for readability
  const formattedBorrow = borrowAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const formattedCollateral = collateralAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });

  // Determine heading and message based on operation
  let heading: string;
  let message: string;
  let icon: string;

  if (hasCollateral && !hasBorrow) {
    // Only added collateral
    heading = "Collateral Added Successfully";
    message = `${formattedCollateral} BTC has been added to your position as collateral.`;
    icon = "/images/btc.png";
  } else if (!hasCollateral && hasBorrow) {
    // Only borrowed
    heading = "Borrow Successful";
    message = `${formattedBorrow} ${borrowSymbol} has been borrowed and is now available in your wallet.`;
    icon = "/images/usdc.png";
  } else {
    // Both collateral and borrow
    heading = "Transaction Successful";
    message = `${formattedCollateral} BTC collateral added and ${formattedBorrow} ${borrowSymbol} borrowed successfully.`;
    icon = "/images/btc.png";
  }

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img src={icon} alt="Success" className="mx-auto mb-6 h-24 w-24" />

        <Heading variant="h4" className="mb-4 text-xl sm:text-2xl">
          {heading}
        </Heading>

        <Text
          variant="body1"
          className="text-sm text-accent-secondary sm:text-base"
        >
          {message}
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
