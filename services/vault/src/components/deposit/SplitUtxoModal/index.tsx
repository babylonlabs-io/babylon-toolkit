import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface SplitUtxoModalProps {
  open: boolean;
  onClose: () => void;
  onContinueToSplit: () => void;
  onDoNotSplit: () => void;
}

export function SplitUtxoModal({
  open,
  onClose,
  onContinueToSplit,
  onDoNotSplit,
}: SplitUtxoModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="flex flex-col items-center gap-6 px-6 pb-4 pt-10 text-center">
        <img
          src={btcConfig.icon}
          alt={btcConfig.name}
          className="h-[100px] w-[100px]"
        />

        <div className="flex flex-col gap-4">
          <Heading variant="h5" className="text-accent-primary">
            Split your {btcConfig.name} into multiple vaults
          </Heading>

          <Text variant="body1" className="text-accent-secondary">
            Splitting your {btcConfig.coinSymbol} into multiple vaults allows
            for partial liquidation. If your position is liquidated, only part of
            your {btcConfig.coinSymbol} may be affected instead of the full
            amount.
          </Text>
        </div>
      </DialogBody>

      <DialogFooter className="flex flex-col gap-4 px-6 pb-6">
        <Button
          variant="contained"
          color="primary"
          fluid
          onClick={onContinueToSplit}
        >
          Continue to Split (Recommended)
        </Button>

        <Button variant="ghost" color="primary" fluid onClick={onDoNotSplit}>
          Do not split
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
