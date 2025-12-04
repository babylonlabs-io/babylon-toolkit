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
import { useEffect, useMemo } from "react";

import { useDepositForm } from "@/hooks/deposit/useDepositForm";
import { useBTCPrice } from "@/hooks/useBTCPrice";
import { depositService } from "@/services/deposit";

interface CollateralDepositModalProps {
  open: boolean;
  onClose: () => void;
  onDeposit: (amount: bigint, providers: string[]) => void;
  btcBalance?: bigint;
}

export function CollateralDepositModal({
  open,
  onClose,
  onDeposit,
  btcBalance: propBtcBalance,
}: CollateralDepositModalProps) {
  // Fetch real-time BTC price from Chainlink
  const { btcPriceUSD } = useBTCPrice();

  // Use the new deposit form hook
  const {
    formData,
    setFormData,
    errors,
    isValid,
    btcBalance,
    providers,
    isLoadingProviders,
    amountSats,
    // estimatedFees, // TODO: Display estimated fees in UI
    validateForm,
    resetForm,
  } = useDepositForm();

  // Use prop balance if provided, otherwise use wallet balance from hook
  const displayBalance = propBtcBalance ?? btcBalance;

  // Format balance for display
  const btcBalanceFormatted = useMemo(() => {
    if (!displayBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(displayBalance, 8));
  }, [displayBalance]);

  // Calculate USD value
  const amountUsd = useMemo(() => {
    if (!btcPriceUSD || !formData.amountBtc || formData.amountBtc === "0")
      return "";
    const btcNum = parseFloat(formData.amountBtc);
    if (isNaN(btcNum)) return "";
    const usdValue = btcNum * btcPriceUSD;
    return `$${usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [formData.amountBtc, btcPriceUSD]);

  // Handler: Toggle provider selection
  const handleToggleProvider = (providerId: string) => {
    const newProvider =
      providerId === formData.selectedProvider ? "" : providerId;
    setFormData({
      selectedProvider: newProvider,
    });
  };

  // Handler: Amount input change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ amountBtc: e.target.value });
  };

  // Handler: Balance click to auto-fill max amount
  const handleBalanceClick = () => {
    if (btcBalanceFormatted > 0) {
      const maxAmount = btcBalanceFormatted.toString();
      setFormData({ amountBtc: maxAmount });
    }
  };

  // Handler: Deposit button click
  const handleDeposit = () => {
    if (validateForm()) {
      // Use amount in satoshis from the hook
      onDeposit(
        amountSats,
        formData.selectedProvider ? [formData.selectedProvider] : [],
      );
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
    resetForm();
    onClose();
  };

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

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
              amount={formData.amountBtc}
              amountUsd={amountUsd}
              currencyIcon="/images/btc.png"
              currencyName="Bitcoin"
              placeholder="0"
              displayBalance={true}
              balanceDetails={{
                balance: btcBalanceFormatted,
                symbol: "BTC",
                price: btcPriceUSD,
                displayUSD: true,
                decimals: 4,
              }}
              min="0"
              step="any"
              autoFocus
              onChange={handleAmountChange}
              onKeyDown={handleKeyDown}
              onMaxClick={handleBalanceClick}
              subtitle={errors.amount ? errors.amount : ""}
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
            ) : providers.length === 0 ? (
              <div className="rounded-lg bg-secondary-highlight p-4">
                <Text variant="body2" className="text-sm text-accent-secondary">
                  No vault providers available at this time.
                </Text>
              </div>
            ) : (
              providers.map((provider) => {
                const shortId =
                  provider.id.length > 14
                    ? `${provider.id.slice(0, 8)}...${provider.id.slice(-6)}`
                    : provider.id;
                return (
                  <ProviderCard
                    key={provider.id}
                    id={provider.id}
                    name={provider.name || shortId}
                    icon={
                      <Text
                        variant="body2"
                        className="text-sm font-medium text-accent-contrast"
                      >
                        {provider.id.slice(2, 3).toUpperCase()}
                      </Text>
                    }
                    isSelected={formData.selectedProvider === provider.id}
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
          {formData.selectedProvider ? "1 Selected" : "0 Selected"}
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
