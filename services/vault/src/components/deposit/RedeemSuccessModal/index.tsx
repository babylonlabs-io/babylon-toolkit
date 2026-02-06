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

interface RedeemCollateralSuccessModalProps {
  open: boolean;
  onClose: () => void;
  totalAmount: number;
  depositCount: number;
}

export function RedeemCollateralSuccessModal({
  open,
  onClose,
  totalAmount,
  depositCount,
}: RedeemCollateralSuccessModalProps) {
  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <img
          src={btcConfig.icon}
          alt={btcConfig.name}
          className="mx-auto h-auto w-full max-w-[160px]"
        />

        <Heading
          variant="h4"
          className="mb-4 mt-6 text-xl text-accent-primary sm:text-2xl"
        >
          Redeem Request Sent
        </Heading>

        <Text
          variant="body1"
          className="mb-2 text-sm text-accent-secondary sm:text-base"
        >
          Your {btcConfig.coinSymbol} redemption request has been submitted. The
          vault provider will process your request and return your{" "}
          {btcConfig.coinSymbol} to your wallet.
        </Text>

        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          This typically takes <strong>up to 3 days</strong>. Your vault will
          show as &quot;Redeem in Progress&quot; until complete.
        </Text>

        <div className="bg-surface-container mt-4 rounded-lg p-4">
          <Text variant="body2" className="mb-1 text-accent-secondary">
            Total Amount
          </Text>
          <Text variant="body1" className="font-semibold text-accent-primary">
            {totalAmount.toFixed(8)} {btcConfig.coinSymbol}
          </Text>
          <Text variant="body2" className="mt-2 text-accent-secondary">
            {depositCount} {depositCount === 1 ? "deposit" : "deposits"}
          </Text>
        </div>
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
