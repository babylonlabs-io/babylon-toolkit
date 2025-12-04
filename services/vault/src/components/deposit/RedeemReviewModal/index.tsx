import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { useBTCPrice } from "../../../hooks/useBTCPrice";
import type { Deposit } from "../../../types/vault";

interface RedeemCollateralReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  depositIds: string[];
  deposits: Deposit[];
  isSigning?: boolean;
}

export function RedeemCollateralReviewModal({
  open,
  onClose,
  onConfirm,
  depositIds,
  deposits,
  isSigning = false,
}: RedeemCollateralReviewModalProps) {
  // Fetch real-time BTC price from Chainlink
  const { btcPriceUSD } = useBTCPrice();

  // Get selected deposits
  const selectedDeposits = useMemo(
    () => deposits.filter((d) => depositIds.includes(d.id)),
    [deposits, depositIds],
  );

  // Calculate total amount
  const totalAmount = useMemo(
    () => selectedDeposits.reduce((sum, d) => sum + d.amount, 0),
    [selectedDeposits],
  );

  // Calculate USD value
  const totalUsd = totalAmount * btcPriceUSD;

  return (
    <ResponsiveDialog open={open} onClose={!isSigning ? onClose : undefined}>
      <DialogHeader
        title="Review"
        onClose={!isSigning ? onClose : undefined}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto text-accent-primary">
        <Text variant="body2" className="text-accent-secondary">
          Review the details before confirming
        </Text>

        {/* Redeem Amount - Two Column Layout */}
        <div className="flex items-start justify-between pb-4">
          <Text variant="body1" className="font-medium">
            Redeem Amount
          </Text>
          <div className="flex flex-col items-end">
            <Text variant="body1" className="font-medium">
              {totalAmount} BTC
            </Text>
            <Text variant="body2" className="text-accent-secondary">
              ($
              {totalUsd.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              USD)
            </Text>
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="pb-6">
        <Button
          variant="contained"
          color="primary"
          onClick={onConfirm}
          disabled={isSigning}
          fluid
        >
          {isSigning ? (
            <>
              <Loader size={16} className="mr-2 text-accent-contrast" />
              Signing...
            </>
          ) : (
            "Confirm"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
