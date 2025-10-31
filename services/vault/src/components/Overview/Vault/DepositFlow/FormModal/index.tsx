import {
  AmountItem,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ProviderCard,
  ResponsiveDialog,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { useVaultProviders } from "../../../../../hooks/useVaultProviders";
import {
  btcStringToSatoshi,
  satoshiToBtcNumber,
} from "../../../../../utils/btcConversion";

interface CollateralDepositModalProps {
  open: boolean;
  onClose: () => void;
  onDeposit: (amount: bigint, providers: string[]) => void;
  btcBalance?: bigint;
  btcPrice?: number; // USD price per BTC
}

export function CollateralDepositModal({
  open,
  onClose,
  onDeposit,
  btcBalance, // Use actual wallet balance
  // TODO: Fetch BTC price from oracle service
  // The price oracle is available at services/vault/src/clients/eth-contract/oracle
  // - Use getOraclePrice(oracleAddress) to get price with 36 decimals
  // - Use convertOraclePriceToUSD(oraclePrice) to convert to USD per BTC
  // - Oracle address should be exposed via a service layer (not yet implemented)
  // - Create a service in services/vault/src/services/oracle/ if it doesn't exist
  btcPrice = 97833.68, // Default: ~$97,834 (to match $489,168.43 for 5 BTC)
}: CollateralDepositModalProps) {
  const [amount, setAmount] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Fetch real vault providers from API
  const {
    providers: vaultProviders,
    loading: isLoadingProviders,
    error: providersError,
  } = useVaultProviders();

  // Conversion and validation
  const btcBalanceFormatted = useMemo(() => {
    if (btcBalance === undefined || btcBalance === null) return 0;
    return satoshiToBtcNumber(btcBalance);
  }, [btcBalance]);
  const amountNum = useMemo(() => {
    const parsed = parseFloat(amount || "0");
    return isNaN(parsed) ? 0 : parsed;
  }, [amount]);

  const amountUsd = useMemo(() => {
    if (!btcPrice || amountNum === 0) return "";
    const usdValue = amountNum * btcPrice;
    return `$${usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [amountNum, btcPrice]);

  const isValid = amountNum > 0 && selectedProviders.length > 0;

  // Handler: Toggle provider selection
  const handleToggleProvider = (providerId: string) => {
    setSelectedProviders((prev) =>
      prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId],
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
      // Convert BTC string input to satoshis (bigint)
      const amountSats = btcStringToSatoshi(amount);
      onDeposit(amountSats, selectedProviders);
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
              currencyIcon="/images/btc.png"
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
            <Text
              variant="subtitle1"
              className="text-base font-semibold text-accent-primary"
            >
              Select Vault Providers
            </Text>
            <Text variant="body2" className="text-accent-secondary">
              Choose one or more providers to secure your BTC.
            </Text>
          </div>

          {/* Provider Cards */}
          <div className="flex flex-col gap-3">
            {isLoadingProviders ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={32} className="text-primary-main" />
              </div>
            ) : providersError ? (
              <div className="bg-error/10 rounded-lg p-4">
                <Text variant="body2" className="text-error text-sm">
                  Failed to load vault providers. Please try again.
                </Text>
              </div>
            ) : vaultProviders.length === 0 ? (
              <div className="rounded-lg bg-secondary-highlight p-4">
                <Text variant="body2" className="text-sm text-accent-secondary">
                  No vault providers available at this time.
                </Text>
              </div>
            ) : (
              vaultProviders.map((provider) => {
                const shortId =
                  provider.id.length > 14
                    ? `${provider.id.slice(0, 8)}...${provider.id.slice(-6)}`
                    : provider.id;
                return (
                  <ProviderCard
                    key={provider.id}
                    id={provider.id}
                    name={shortId}
                    icon={
                      <Text
                        variant="body2"
                        className="text-sm font-medium text-accent-contrast"
                      >
                        {provider.id.slice(2, 3).toUpperCase()}
                      </Text>
                    }
                    isSelected={selectedProviders.includes(provider.id)}
                    onToggle={handleToggleProvider}
                  />
                );
              })
            )}
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
