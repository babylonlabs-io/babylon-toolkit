import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useRedeemTransaction } from "./useRedeemTransaction";
import type { Hex } from "viem";

interface RedeemSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Peg-in transaction hash (vault ID) to redeem */
  pegInTxHash?: Hex;
}

/**
 * RedeemSignModal - Transaction signing modal for redeem flow
 *
 * The redeem transaction unlocks and withdraws the BTC from an available vault
 * back to the user's Bitcoin address.
 */
export function RedeemSignModal({
  open,
  onClose,
  onSuccess,
  pegInTxHash,
}: RedeemSignModalProps) {
  const {
    isLoading,
    error,
    executeTransaction,
  } = useRedeemTransaction({
    pegInTxHash,
    isOpen: open,
  });

  const handleSign = async () => {
    try {
      await executeTransaction();
      onSuccess();
    } catch (err) {
      // Error is already shown in the modal
      console.error('Redeem transaction failed:', err);
    }
  };

  // Check if we're ready to execute (have all required data)
  const isReady = !!pegInTxHash;

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Redeem in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="text-accent-primary flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <Text variant="body1" className="text-accent-secondary text-sm sm:text-base">
          Sign the transaction to redeem your BTC vault. Your BTC will be unlocked and returned to your Bitcoin address.
        </Text>

        {error && (
          <Text variant="body2" className="text-error-main text-sm">
            {error}
          </Text>
        )}
      </DialogBody>

      <DialogFooter className="flex gap-4">
        <Button
          variant="outlined"
          color="primary"
          onClick={onClose}
          className="flex-1 text-xs sm:text-base"
          disabled={isLoading}
        >
          Cancel
        </Button>

        <Button
          disabled={isLoading || !isReady}
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={handleSign}
        >
          {isLoading ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : !isReady ? (
            "Loading..."
          ) : (
            "Sign"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
