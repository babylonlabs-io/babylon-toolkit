import {
  Button,
  ResponsiveDialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
  AmountItem,
  SubSection,
  Loader,
} from "@babylonlabs-io/core-ui";
import { useState, useMemo } from "react";
import { bitcoinIcon } from "../../assets";
import { useVaultProviders } from "../../hooks/useVaultProviders";
import { usePeginForm } from "../../hooks/usePeginForm";
import type { VaultProvider } from "../../clients/vault-providers-api";

interface PeginModalProps {
  open: boolean;
  onClose: () => void;
  onPegIn: (amount: number, providers: string[]) => void;
  btcBalance?: number; // BTC balance in satoshis
}

export function PeginModal({ open, onClose, onPegIn, btcBalance = 0 }: PeginModalProps) {
  // Local state for form inputs
  const [amount, setAmount] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Fetch vault providers
  const { data: vaultProvidersData, isLoading: isLoadingProviders, error: providersError } = useVaultProviders();
  const vaultProviders = vaultProvidersData?.providers || [];

  // Hardcoded BTC price - TODO: Replace with real price feed from API
  const btcPrice = 95000; // $95,000 per BTC

  // Use deposit form hook for validation and business logic
  const {
    btcBalanceFormatted,
    calculateUsdValue,
    validateAmount,
    validateProviders,
    validateForm,
    getMaxBalance,
    coinName,
  } = usePeginForm({
    btcBalance,
    btcPrice,
    coinName: 'BTC',
    displayUSD: true,
  });

  // Parse amount as number
  const amountNum = useMemo(() => {
    const parsed = parseFloat(amount || "0");
    return isNaN(parsed) ? 0 : parsed;
  }, [amount]);

  // Calculate USD equivalent
  const amountUsd = useMemo(() => calculateUsdValue(amountNum), [amountNum, calculateUsdValue]);

  // Get validation states from hook
  const amountValidation = useMemo(() => validateAmount(amountNum), [amountNum, validateAmount]);
  const providersValidation = useMemo(() => validateProviders(selectedProviders), [selectedProviders, validateProviders]);
  const isValid = useMemo(() => validateForm(amountNum, selectedProviders), [amountNum, selectedProviders, validateForm]);

  // Determine what error to show
  const showAmountError = amount !== "" && !amountValidation.valid;
  const showProvidersError = amount !== "" && amountNum > 0 && !providersValidation.valid;

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
    const maxBalance = getMaxBalance();
    if (maxBalance > 0) {
      setAmount(maxBalance.toString());
    }
  };

  // Handler: Peg-in button click
  const handlePegIn = () => {
    if (isValid) {
      console.log("Peg-in:", { amount: amountNum, providers: selectedProviders });
      onPegIn(amountNum, selectedProviders);
    }
  };

  // Handler: Prevent arrow keys from changing number input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  // Handler: Reset state when modal closes
  const handleClose = () => {
    setAmount("");
    setSelectedProviders([]);
    onClose();
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title="Deposite BTC"
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
            
            {/* Clickable Balance Display */}
            <button
              type="button"
              onClick={handleBalanceClick}
              className="cursor-pointer text-left text-xs text-accent-secondary transition-colors hover:text-primary-main sm:text-sm"
            >
              Balance: {btcBalanceFormatted.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 8 })} {coinName}
            </button>

            {/* Error Messages */}
            {showAmountError && amountValidation.error && (
              <Text variant="caption" className="text-xs text-error sm:text-sm">
                {amountValidation.error}
              </Text>
            )}
            {showProvidersError && providersValidation.error && (
              <Text variant="caption" className="text-xs text-error sm:text-sm">
                {providersValidation.error}
              </Text>
            )}
          </SubSection>
        </div>

        {/* Vault Provider Selection Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Text variant="subtitle1" className="text-base font-semibold text-accent-primary sm:text-lg">
              Select Vault Providers
            </Text>
            <Text variant="body2" className="text-sm text-accent-secondary sm:text-base">
              Choose one or more providers to secure your BTC
            </Text>
          </div>

          {isLoadingProviders ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={32} className="text-primary-main" />
            </div>
          ) : providersError ? (
            <div className="rounded-lg bg-error/10 p-4">
              <Text variant="body2" className="text-sm text-error">
                Failed to load vault providers. Please try again.
              </Text>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {vaultProviders.map((provider: VaultProvider) => {
                const isSelected = selectedProviders.includes(provider.id);
                return (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between rounded-lg bg-secondary-highlight p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary-main">
                        <Text variant="body2" className="text-sm font-medium text-accent-contrast">
                          {provider.name.charAt(0)}
                        </Text>
                      </div>
                      <div className="flex flex-col">
                        <Text variant="body1" className="text-sm font-medium text-accent-primary sm:text-base">
                          {provider.name}
                        </Text>
                        {provider.apy && (
                          <Text variant="caption" className="text-xs text-accent-secondary">
                            APY: {provider.apy}%
                          </Text>
                        )}
                      </div>
                    </div>
                    <Button
                      size="small"
                      variant={isSelected ? "contained" : "outlined"}
                      color="primary"
                      onClick={() => handleToggleProvider(provider.id)}
                      className="min-w-[80px] text-xs sm:text-sm"
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          variant="contained"
          color="primary"
          disabled={!isValid}
          onClick={handlePegIn}
          className="w-full text-sm sm:text-base"
        >
         Deposit
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}