import {
  Button,
  ResponsiveDialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
  AmountItem,
  SubSection,
  ProviderCard,
} from "@babylonlabs-io/core-ui";
import { useState, useMemo, ReactNode } from "react";

interface VaultProvider {
  id: string;
  name: string;
  icon?: ReactNode;
}

interface CollateralDepositModalProps {
  open: boolean;
  onClose: () => void;
  onDeposit: (amount: number, providers: string[]) => void;
  btcBalance?: number; // in satoshis
  btcPrice?: number; // USD price per BTC
}

// Helper function to convert satoshis to BTC
const satoshiToBtc = (satoshi: number): number => {
  return satoshi / 100000000;
};

export function CollateralDepositModal({ 
  open, 
  onClose, 
  onDeposit, 
  btcBalance = 1000000000, // Default: 10 BTC (matches image)
  btcPrice = 97833.68, // Default: ~$97,834 (to match $489,168.43 for 5 BTC)
}: CollateralDepositModalProps) {
  const [amount, setAmount] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Mock vault providers matching the image
  const mockProviders: VaultProvider[] = [
    { 
      id: 'ironclad-btc', 
      name: 'Ironclad BTC',
      icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">I</Text>,
    },
    { 
      id: 'atlas-custody', 
      name: 'Atlas Custody',
      icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">A</Text>,
    },
    { 
      id: 'stonewall-capital', 
      name: 'Stonewall Capital',
      icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">S</Text>,
    },
  ];

  // Conversion and validation
  const btcBalanceFormatted = useMemo(() => satoshiToBtc(btcBalance), [btcBalance]);
  const amountNum = useMemo(() => {
    const parsed = parseFloat(amount || "0");
    return isNaN(parsed) ? 0 : parsed;
  }, [amount]);

  const amountUsd = useMemo(() => {
    if (!btcPrice || amountNum === 0) return '';
    const usdValue = amountNum * btcPrice;
    return `$${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [amountNum, btcPrice]);

  const isValid = amountNum > 0 && selectedProviders.length > 0;

  // Handler: Toggle provider selection
  const handleToggleProvider = (providerId: string) => {
    setSelectedProviders((prev) =>
      prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId]
    );
  };

  // Handler: Amount input change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  // Handler: Balance click to auto-fill max amount
  const handleBalanceClick = () => {
    if (btcBalanceFormatted > 0) {
      setAmount(btcBalanceFormatted.toString());
    }
  };

  // Handler: Deposit button click
  const handleDeposit = () => {
    if (isValid) {
      onDeposit(amountNum, selectedProviders);
    }
  };

  // Handler: Prevent arrow keys
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  // Handler: Reset state on close
  const handleClose = () => {
    setAmount("");
    setSelectedProviders([]);
    onClose();
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Deposit BTC"
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto text-accent-primary">
        {/* Bitcoin Amount Section */}
        <div className="flex flex-col gap-2">
          <SubSection className="flex w-full flex-col gap-2">
            <AmountItem
              amount={amount}
              amountUsd={amountUsd}
              currencyIcon="/btc.png"
              currencyName="Bitcoin"
              placeholder="0"
              displayBalance={true}
              balanceDetails={{
                balance: btcBalanceFormatted,
                symbol: "BTC",
                price: btcPrice,
                displayUSD: true,
                decimals: 4,
              }}
              min="0"
              step="any"
              autoFocus
              onChange={handleAmountChange}
              onKeyDown={handleKeyDown}
              onMaxClick={handleBalanceClick}
              subtitle=""
            />
          </SubSection>
        </div>

        {/* Vault Provider Selection Section - matches image layout */}
        <div className="flex flex-col gap-4">
          {/* Header with CounterButton */}
          <div className="flex flex-col gap-2">
            <Text variant="subtitle1" className="text-base font-semibold text-accent-primary">
              Select Vault Providers
            </Text>
            <Text variant="body2" className="text-accent-secondary">
              Choose one or more providers to secure your BTC.
            </Text>
          </div>

          {/* Provider Cards */}
          <div className="flex flex-col gap-3">
            {mockProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                id={provider.id}
                name={provider.name}
                icon={provider.icon}
                isSelected={selectedProviders.includes(provider.id)}
                onToggle={handleToggleProvider}
              />
            ))}
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="flex items-center justify-between pb-6">
        <Text variant="body2" className="text-sm text-accent-secondary">
          {selectedProviders.length} Selected
        </Text>
        <Button
          variant="contained"
          color="primary"
          disabled={!isValid}
          onClick={handleDeposit}
          className="text-sm sm:text-base"
        >
          Deposit
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}

