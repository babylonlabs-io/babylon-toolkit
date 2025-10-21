import {
  Button,
  ResponsiveDialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
  Heading,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

interface Deposit {
  id: string;
  amount: number;
  vaultProvider: {
    name: string;
    icon: string;
  };
  status: string;
}

interface RedeemCollateralReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  depositIds: string[];
  btcPrice?: number;
}

// Hardcoded deposit data matching DepositOverview
const HARDCODED_DEPOSITS: Deposit[] = [
  {
    id: "1",
    amount: 5,
    vaultProvider: {
      name: "Ironclad BTC",
      icon: "",
    },
    status: "In Use",
  },
  {
    id: "2",
    amount: 2,
    vaultProvider: {
      name: "Atlas Custody",
      icon: "",
    },
    status: "Available",
  },
  {
    id: "3",
    amount: 3,
    vaultProvider: {
      name: "Ironclad BTC",
      icon: "",
    },
    status: "Available",
  },
];

// Hardcoded fees
const BTC_FEE = 0.00000001;
const BTC_FEE_USD = 10.20;
const ETH_FEE = 0.001;
const ETH_FEE_USD = 10.20;

export function RedeemCollateralReviewModal({
  open,
  onClose,
  onConfirm,
  depositIds,
  btcPrice = 97833.68,
}: RedeemCollateralReviewModalProps) {
  // Get selected deposits
  const selectedDeposits = useMemo(
    () => HARDCODED_DEPOSITS.filter((d) => depositIds.includes(d.id)),
    [depositIds]
  );

  // Calculate total amount
  const totalAmount = useMemo(
    () => selectedDeposits.reduce((sum, d) => sum + d.amount, 0),
    [selectedDeposits]
  );

  // Calculate USD value
  const totalUsd = totalAmount * btcPrice;

  // Get unique providers
  const uniqueProviders = useMemo(() => {
    const providerNames = new Set(selectedDeposits.map((d) => d.vaultProvider.name));
    return Array.from(providerNames);
  }, [selectedDeposits]);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Review"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          Review the details before confirming your redemption
        </Text>

        {/* Redeem Amount - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Redeem Amount
          </Text>
          <div className="flex flex-col items-end">
            <Text variant="body1" className="font-medium">
              {totalAmount} BTC
            </Text>
            <Text variant="body2" className="text-accent-secondary">
              (${totalUsd.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              USD)
            </Text>
          </div>
        </div>

        {/* Vault Providers - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Vault Provider(s)
          </Text>
          <div className="flex flex-col items-end gap-1">
            {uniqueProviders.map((provider) => (
              <Text key={provider} variant="body1">
                {provider}
              </Text>
            ))}
          </div>
        </div>

        {/* Fees - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Fees
          </Text>
          <div className="flex flex-col items-end gap-1">
            <Text variant="body2">
              {BTC_FEE} BTC (${BTC_FEE_USD.toFixed(2)})
            </Text>
            <Text variant="body2">
              {ETH_FEE} ETH (${ETH_FEE_USD.toFixed(2)})
            </Text>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-divider" />

        {/* Attention Section */}
        <div className="flex flex-col gap-3">
          <Heading variant="h6" className="text-base font-semibold">
            Attention!
          </Heading>
          <Text variant="body2" className="text-sm text-accent-secondary">
            After submission, your redemption will be processed. This may take up to 5 hours,
            during which your deposits will be unlocked and BTC transferred back to your wallet.
            The transaction will need to be confirmed on both the Bitcoin and Ethereum networks.
          </Text>
        </div>
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          variant="contained"
          color="primary"
          onClick={onConfirm}
          fluid
        >
          Confirm
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}

