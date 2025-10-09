import {
  Button,
  ResponsiveDialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
  AmountItem,
  SubSection,
  CounterButton,
  ProviderCard,
} from "@babylonlabs-io/core-ui";
import { useState, useMemo, ReactNode } from "react";
import { bitcoinIcon } from "../../assets";

interface VaultProvider {
  id: string;
  name: string;
  icon?: ReactNode;
  deposits?: string;
  label?: string;
}

interface CollateralDepositModalProps {
  open: boolean;
  onClose: () => void;
  onDeposit: (amount: number, providers: string[]) => void;
  btcBalance?: number; // in satoshis
  btcPrice?: number; // USD price per BTC
  maxProviders?: number; // Max number of providers that can be selected
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
  maxProviders = 4
}: CollateralDepositModalProps) {
  const [amount, setAmount] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Mock vault providers matching the image
  const mockProviders: VaultProvider[] = [
    { 
      id: 'ironclad-btc', 
      name: 'Ironclad BTC',
      icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">I</Text>,
      deposits: '382.7 BTC',
      label: '-'
    },
    { 
      id: 'atlas-custody', 
      name: 'Atlas Custody',
      icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">A</Text>,
      deposits: '510.2 BTC',
      label: '-'
    },
    { 
      id: 'stonewall-capital', 
      name: 'Stonewall Capital',
      icon: <Text variant="body2" className="text-sm font-medium text-accent-contrast">S</Text>,
      deposits: undefined,
      label: undefined
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

      <DialogBody className="no-scrollbar mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 text-accent-primary sm:px-6">
        {/* Bitcoin Amount Section */}
        <div className="flex flex-col gap-2">
          <Text variant="subtitle1" className="text-base font-semibold text-accent-primary sm:text-lg">
            Bitcoin
          </Text>
          <SubSection className="flex w-full flex-col gap-2">
            <AmountItem
              amount={amount}
              amountUsd={amountUsd}
              currencyIcon={bitcoinIcon}
              currencyName="Bitcoin"
              placeholder="0"
              displayBalance={false}
              min="0"
              step="any"
              autoFocus
              onChange={handleAmountChange}
              onKeyDown={handleKeyDown}
              subtitle=""
            />
            
            {/* Clickable Max Balance Display - matches image format */}
            <button
              type="button"
              onClick={handleBalanceClick}
              className="cursor-pointer text-left text-xs text-accent-secondary transition-colors hover:text-primary-main sm:text-sm"
            >
              Max {btcBalanceFormatted.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} BTC
            </button>
          </SubSection>
        </div>

        {/* Vault Provider Selection Section - matches image layout */}
        <div className="flex flex-col gap-4">
          {/* Header with CounterButton */}
          <div className="flex items-center justify-between">
            <Text variant="subtitle1" className="text-base font-semibold text-accent-primary sm:text-lg">
              Select Vault Providers
            </Text>
            <CounterButton 
              counter={selectedProviders.length} 
              max={maxProviders}
              onAdd={() => {}} // No add action needed
              alwaysShowCounter={true}
            />
          </div>

          {/* Provider Cards */}
          <div className="flex flex-col gap-3">
            {mockProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                id={provider.id}
                name={provider.name}
                icon={provider.icon}
                deposits={provider.deposits}
                label={provider.label}
                isSelected={selectedProviders.includes(provider.id)}
                onToggle={handleToggleProvider}
              />
            ))}
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="flex items-center justify-between px-4 pb-6 sm:px-6">
        <Text variant="body2" className="text-sm text-accent-secondary">
          {selectedProviders.length} Vault Provider{selectedProviders.length !== 1 ? 's' : ''} Selected
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

