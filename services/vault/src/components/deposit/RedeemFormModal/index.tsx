import {
  Avatar,
  AvatarGroup,
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { PEGIN_DISPLAY_LABELS } from "../../../models/peginStateMachine";
import type { Deposit } from "../../../types/vault";

interface RedeemCollateralModalProps {
  open: boolean;
  onClose: () => void;
  onNext: (depositIds: string[]) => void;
  deposits: Deposit[];
}

export function RedeemCollateralModal({
  open,
  onClose,
  onNext,
  deposits,
}: RedeemCollateralModalProps) {
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);

  // Filter only "Available" deposits
  const availableDeposits = useMemo(() => {
    return deposits.filter((d) => d.status === PEGIN_DISPLAY_LABELS.AVAILABLE);
  }, [deposits]);

  const handleClose = () => {
    setSelectedDepositIds([]);
    onClose();
  };

  const handleNext = () => {
    if (selectedDepositIds.length > 0) {
      onNext(selectedDepositIds);
    }
  };

  const toggleSelection = (depositId: string) => {
    setSelectedDepositIds((prev) =>
      prev.includes(depositId)
        ? prev.filter((id) => id !== depositId)
        : [...prev, depositId],
    );
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Redeem"
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto text-accent-primary">
        <Text variant="body2" className="text-accent-secondary">
          Select the BTC amount you want to redeem back to your wallet.
        </Text>

        {availableDeposits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <img
              src="/images/btc.png"
              alt="Bitcoin"
              className="mb-4 h-16 w-16"
            />
            <Text variant="body2" className="center text-accent-secondary">
              No deposits in use to redeem.
            </Text>
          </div>
        ) : (
          <div className="flex flex-col">
            {availableDeposits.map((deposit, index) => {
              const isSelected = selectedDepositIds.includes(deposit.id);

              return (
                <div
                  key={deposit.id}
                  className={`flex cursor-pointer items-center justify-between gap-4 px-0 py-4 transition-colors ${
                    index % 2 === 0
                      ? "bg-secondary-highlight/50 hover:bg-secondary-highlight"
                      : "bg-transparent hover:bg-secondary-highlight/50"
                  }`}
                  onClick={() => toggleSelection(deposit.id)}
                >
                  <div className="flex flex-1 items-center gap-3 px-4">
                    <AvatarGroup size="medium">
                      <Avatar
                        url="/images/btc.png"
                        alt="BTC"
                        size="medium"
                        variant="circular"
                      />
                    </AvatarGroup>
                    <Text variant="body1" className="font-medium">
                      {deposit.amount} BTC
                    </Text>
                  </div>
                  <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSelection(deposit.id)}
                      variant="default"
                      showLabel={false}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogBody>

      <DialogFooter className="flex items-center justify-end pb-6">
        <Button
          variant="contained"
          color="primary"
          onClick={handleNext}
          disabled={selectedDepositIds.length === 0}
          className="text-sm sm:text-base"
        >
          Next
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
