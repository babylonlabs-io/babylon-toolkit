import { AmountSlider, Card, Loader, Select } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { depositService } from "@/services/deposit";

const btcConfig = getNetworkConfigBTC();

interface Provider {
  id: string;
  name: string;
}

interface Application {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface DepositFormProps {
  amount: string;
  btcBalance: bigint;
  btcPrice: number;
  hasPriceFetchError: boolean;
  onAmountChange: (value: string) => void;
  onMaxClick: () => void;

  applications: Application[];
  selectedApplication: string;

  providers: Provider[];
  isLoadingProviders: boolean;
  selectedProvider: string;
  onProviderSelect: (providerId: string) => void;

  isValid: boolean;
  isDepositEnabled: boolean;
  isGeoBlocked: boolean;
  onDeposit: () => void;
}

export function DepositForm({
  amount,
  btcBalance,
  btcPrice,
  hasPriceFetchError,
  onAmountChange,
  onMaxClick,
  applications,
  selectedApplication,
  providers,
  isLoadingProviders,
  selectedProvider,
  onProviderSelect,
  isValid,
  isDepositEnabled,
  isGeoBlocked,
  onDeposit,
}: DepositFormProps) {
  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance, 8));
  }, [btcBalance]);

  const sliderMax = btcBalanceFormatted || 1;
  const amountNum = parseFloat(amount) || 0;

  const usdValue = useMemo(() => {
    if (hasPriceFetchError || !btcPrice || !amount || amount === "0") return "";
    const btcNum = parseFloat(amount);
    if (isNaN(btcNum)) return "";
    return `$${(btcNum * btcPrice).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;
  }, [amount, btcPrice, hasPriceFetchError]);

  const selectedApp = applications.find((a) => a.id === selectedApplication);

  const providerOptions = providers.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const fees = useMemo(() => {
    // TODO: wire to real fee calculation hooks
    return [
      { label: "Bitcoin Network Fee", amount: "0 BTC", price: "($0 USD)" },
      { label: "Ethereum Network Fee", amount: "0 ETH", price: "($0 USD)" },
      { label: "Protocol Fee", amount: "0 BTC", price: "($0 USD)" },
    ];
  }, []);

  const ctaLabel = !amount || amount === "0" ? "Enter an amount" : "Deposit";
  const ctaDisabled =
    !isValid || !isDepositEnabled || isGeoBlocked || !amount || amount === "0";

  return (
    <div className="flex w-full flex-col gap-4">
      <Card variant="filled" className="flex flex-col gap-4">
        {/* Amount input with slider */}
        <AmountSlider
          amount={amount}
          currencyIcon={btcConfig.icon}
          currencyName={btcConfig.name}
          onAmountChange={(e) => onAmountChange(e.target.value)}
          sliderValue={amountNum}
          sliderMin={0}
          sliderMax={sliderMax}
          sliderStep={0.001}
          sliderSteps={[]}
          onSliderChange={(value) => onAmountChange(value.toString())}
          sliderVariant="primary"
          leftField={{ label: "Max", value: `${btcBalanceFormatted} BTC` }}
          rightField={{ value: usdValue }}
          onMaxClick={onMaxClick}
        />
      </Card>

      {/* Aave app */}
      {selectedApp && (
        <Card variant="filled" className="flex items-center gap-3">
          <ApplicationLogo
            logoUrl={selectedApp.logoUrl}
            name={selectedApp.name}
            size="small"
          />
          <span className="text-sm text-accent-primary">
            {selectedApp.name}
          </span>
        </Card>
      )}

      {/* Vault provider dropdown */}
      <Card variant="filled" className="py-3">
        {isLoadingProviders ? (
          <div className="flex items-center justify-center py-2">
            <Loader size={24} className="text-primary-main" />
          </div>
        ) : (
          <Select
            className="border-0 bg-transparent"
            options={providerOptions}
            value={selectedProvider}
            placeholder="Select Vault Provider"
            onSelect={(value) => onProviderSelect(value as string)}
          />
        )}
      </Card>

      {/* CTA button */}
      <DepositButton
        variant="contained"
        color="primary"
        size="large"
        fluid
        disabled={ctaDisabled}
        onClick={onDeposit}
      >
        {isDepositEnabled ? ctaLabel : "Depositing Unavailable"}
      </DepositButton>

      {/* Fee breakdown */}
      <div className="flex flex-col gap-4">
        {fees.map((fee) => (
          <div
            key={fee.label}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-accent-primary">{fee.label}</span>
            <span>
              <span className="text-accent-primary">{fee.amount}</span>{" "}
              <span className="text-[#B0B0B0]">{fee.price}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
