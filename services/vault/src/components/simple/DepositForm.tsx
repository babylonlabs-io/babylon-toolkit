import {
  AmountSlider,
  Card,
  Loader,
  Select,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useBtcFeeDisplay } from "@/hooks/deposit/useBtcFeeDisplay";
import { depositService } from "@/services/deposit";
import type { AllocationStrategy } from "@/services/vault";

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
  amountSats: bigint;
  btcBalance: bigint;
  minDeposit: bigint;
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
  estimatedFeeSats: bigint | null;
  estimatedFeeRate: number;
  isLoadingFee: boolean;
  feeError: string | null;
  isDepositEnabled: boolean;
  isGeoBlocked: boolean;
  onDeposit: () => void;

  // Partial liquidation
  isPartialLiquidation: boolean;
  onPartialLiquidationChange: (checked: boolean) => void;
  allocationStrategy: AllocationStrategy | null;
  canSplit: boolean;
  feeNote: string | null;
}

export function DepositForm({
  amount,
  amountSats,
  btcBalance,
  minDeposit,
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
  estimatedFeeSats,
  estimatedFeeRate,
  isLoadingFee,
  feeError,
  isDepositEnabled,
  isGeoBlocked,
  onDeposit,
  isPartialLiquidation,
  onPartialLiquidationChange,
  allocationStrategy,
  canSplit,
  feeNote,
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

  const {
    btcFee,
    feeAmount,
    feePrice,
    isError: isFeeError,
  } = useBtcFeeDisplay({
    estimatedFeeSats,
    btcPrice,
    hasPriceFetchError,
    isLoadingFee,
    feeError,
    hasAmount: !!amount && amount !== "0",
  });

  const hasAmount = !!amount && amount !== "0";
  const feeDisabled = isLoadingFee || estimatedFeeRate <= 0 || btcFee === null;

  const ctaLabel = isFeeError
    ? (feeError ?? "Fee estimate unavailable")
    : depositService.getDepositButtonLabel({
        amountSats,
        minDeposit,
        btcBalance,
      });
  const ctaDisabled =
    !isValid || !isDepositEnabled || isGeoBlocked || !hasAmount || feeDisabled;

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

      {/* Partial liquidation checkbox */}
      <Card variant="filled" className="flex flex-col gap-1 px-4 py-3">
        <label
          className={`flex items-center gap-2 ${!canSplit ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            checked={isPartialLiquidation}
            disabled={!canSplit}
            onChange={(e) => onPartialLiquidationChange(e.target.checked)}
            className="h-4 w-4 accent-primary-main"
          />
          <Text as="span" variant="body2" className="text-accent-primary">
            Enable partial liquidation
          </Text>
        </label>
        <Text as="span" variant="body2" className="ml-6 text-accent-secondary">
          {!canSplit
            ? "Insufficient balance to split into 2 vaults"
            : allocationStrategy === "MULTI_INPUT"
              ? "Your BTC will be deposited into 2 vaults using existing UTXOs (no extra transaction)"
              : allocationStrategy === "SPLIT"
                ? "Your BTC will be split into 2 vaults via an additional Bitcoin transaction"
                : "Your BTC will be deposited into 2 vaults"}
        </Text>
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
      <div className="flex items-center justify-between text-sm">
        <span className="text-accent-primary">Bitcoin Network Fee</span>
        <span>
          <span
            className={isFeeError ? "text-error-main" : "text-accent-primary"}
          >
            {feeAmount}
          </span>{" "}
          <span className="text-accent-secondary">
            {feePrice}
            {feeNote && ` ${feeNote}`}
          </span>
        </span>
      </div>
    </div>
  );
}
