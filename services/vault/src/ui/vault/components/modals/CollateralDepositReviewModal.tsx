import {
  Button,
  ResponsiveDialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
  Heading,
} from "@babylonlabs-io/core-ui";

interface VaultProvider {
  id: string;
  name: string;
  icon?: React.ReactNode;
}

interface CollateralDepositReviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: number;
  providers: string[];
  btcPrice?: number;
}

// Mock provider data matching CollateralDepositModal
const VAULT_PROVIDERS: Record<string, VaultProvider> = {
  "ironclad-btc": {
    id: "ironclad-btc",
    name: "Ironclad BTC",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary">
        <Text variant="body2" className="text-sm font-medium text-accent-contrast">
          I
        </Text>
      </div>
    ),
  },
  "atlas-custody": {
    id: "atlas-custody",
    name: "Atlas Custody",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary">
        <Text variant="body2" className="text-sm font-medium text-accent-contrast">
          A
        </Text>
      </div>
    ),
  },
  "stonewall-capital": {
    id: "stonewall-capital",
    name: "Stonewall Capital",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary">
        <Text variant="body2" className="text-sm font-medium text-accent-contrast">
          S
        </Text>
      </div>
    ),
  },
};

// Hardcoded fees as per requirements
const BTC_FEE = 0.00000001;
const BTC_FEE_USD = 10.20;
const ETH_FEE = 0.001;
const ETH_FEE_USD = 10.20;

export function CollateralDepositReviewModal({
  open,
  onClose,
  onConfirm,
  amount,
  providers,
  btcPrice = 97833.68,
}: CollateralDepositReviewModalProps) {
  // Calculate USD value
  const amountUsd = amount * btcPrice;

  // Get provider details
  const selectedProviders = providers
    .map((id) => VAULT_PROVIDERS[id])
    .filter(Boolean);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Review"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          Review the details before confirming your deposit
        </Text>

        {/* Deposit Amount - Two Column Layout */}
        <div className="flex items-start justify-between">
          <Text variant="body1" className="font-medium">
            Deposit Amount
          </Text>
          <div className="flex flex-col items-end">
            <Text variant="body1" className="font-medium">
              {amount} BTC
            </Text>
            <Text variant="body2" className="text-accent-secondary">
              (${amountUsd.toLocaleString("en-US", {
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
          <div className="flex flex-col items-end gap-3">
            {selectedProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center gap-3"
              >
                {provider.icon}
                <Text variant="body1">{provider.name}</Text>
              </div>
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

        {/* Attention Section - No Border */}
        <div className="flex flex-col gap-3">
          <Heading variant="h6" className="text-base font-semibold">
            Attention!
          </Heading>
          <Text variant="body2" className="text-sm text-accent-secondary">
            1. Your BTC remains secure and cannot be accessed by third parties.
            Only you can withdraw your funds. After submission, your deposit
            will be verified. This may take up to 5 hours, during which your
            deposit will appear as Pending until confirmed on the Bitcoin
            network.
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

