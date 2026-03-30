import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AmountSlider,
  Card,
  Loader,
  Select,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { IoCheckmark, IoChevronUp } from "react-icons/io5";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useBtcFeeDisplay } from "@/hooks/deposit/useBtcFeeDisplay";
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

interface PartialLiquidationProps {
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  canSplit: boolean;
  strategy: "SINGLE" | "MULTI_INPUT" | "SPLIT" | null;
  isPlanning: boolean;
  splitRatioLabel: string | null;
}

interface DepositFormProps {
  amount: string;
  amountSats: bigint;
  btcBalance: bigint;
  minDeposit: bigint;
  maxDeposit?: bigint;
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
  isDepositDisabled: boolean;
  isGeoBlocked: boolean;
  onDeposit: () => void;

  partialLiquidation?: PartialLiquidationProps;
}

export function DepositForm({
  amount,
  amountSats,
  btcBalance,
  minDeposit,
  maxDeposit,
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
  isDepositDisabled,
  isGeoBlocked,
  onDeposit,
  partialLiquidation,
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

  const splitStatusText = useMemo(() => {
    if (!partialLiquidation?.canSplit) {
      if (partialLiquidation?.isPlanning) return "Computing allocation...";
      return amountSats > 0n
        ? "Deposit amount too low for 2-vault split"
        : null;
    }
    if (partialLiquidation.isPlanning) return "Computing allocation...";
    if (partialLiquidation.strategy === "SPLIT")
      return "Your BTC will be split into 2 vaults via an additional Bitcoin transaction";
    if (partialLiquidation.strategy === "MULTI_INPUT")
      return "Your BTC will be deposited into 2 vaults using existing UTXOs";
    return null;
  }, [partialLiquidation, amountSats]);

  const splitNotReady =
    partialLiquidation?.isEnabled &&
    !partialLiquidation?.canSplit &&
    !partialLiquidation?.isPlanning;

  const splitSummaryLabel = partialLiquidation?.splitRatioLabel
    ? `2 UTXO Split - ${partialLiquidation.splitRatioLabel} (Recommended)`
    : "2 UTXO Split (Recommended)";

  const ctaLabel = splitNotReady
    ? "Deposit amount too low for 2-vault split"
    : isFeeError
      ? (feeError ?? "Fee estimate unavailable")
      : depositService.getDepositButtonLabel({
          amountSats,
          minDeposit,
          maxDeposit,
          btcBalance,
        });
  const ctaDisabled =
    !isValid ||
    isDepositDisabled ||
    isGeoBlocked ||
    !hasAmount ||
    feeDisabled ||
    splitNotReady;

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

      {/* Partial liquidation split selector */}
      {partialLiquidation && (
        <Card variant="filled" className="py-0">
          <Accordion>
            <AccordionSummary
              className="flex items-center justify-between px-0 py-3"
              iconProps={{
                variant: "outlined",
                size: "small",
                className:
                  "border-0 !text-secondary-strokeDark !static !translate-y-0",
              }}
              renderIcon={(expanded) => (
                <IoChevronUp
                  className={`transition-transform ${expanded ? "" : "rotate-180"}`}
                />
              )}
            >
              <span
                className={`text-sm ${partialLiquidation.canSplit ? "text-accent-primary" : "text-accent-secondary"}`}
              >
                {partialLiquidation.isEnabled
                  ? splitSummaryLabel
                  : "Do not split UTXO"}
              </span>
            </AccordionSummary>
            <AccordionDetails className="flex flex-col px-0 pb-3">
              <p className="mb-3 text-xs text-accent-secondary">
                Splitting your BTC into multiple vaults gives your position more
                flexibility. If liquidation occurs, it may allow only part of
                your collateral to be affected instead of the full amount.
              </p>

              <button
                type="button"
                className="flex w-full items-center justify-between py-3 text-sm text-accent-primary"
                onClick={() => partialLiquidation.onChange(false)}
              >
                Do not split UTXO
                {!partialLiquidation.isEnabled && (
                  <IoCheckmark className="text-secondary-main" size={20} />
                )}
              </button>

              <button
                type="button"
                className={`flex w-full items-center justify-between py-3 text-sm ${partialLiquidation.canSplit ? "text-accent-primary" : "text-accent-secondary"}`}
                onClick={() => partialLiquidation.onChange(true)}
              >
                {partialLiquidation.splitRatioLabel
                  ? `2 UTXO Split - ${partialLiquidation.splitRatioLabel} (Recommended)`
                  : "2 UTXO Split (Recommended)"}
                {partialLiquidation.isEnabled && (
                  <IoCheckmark className="text-secondary-main" size={20} />
                )}
              </button>

              {splitStatusText && (
                <span className="block pt-1 text-xs text-accent-secondary">
                  {splitStatusText}
                </span>
              )}
            </AccordionDetails>
          </Accordion>
        </Card>
      )}

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
        ) : providers.length === 0 ? (
          <p className="px-4 py-2 text-sm text-accent-secondary">
            No vault providers available at this time.
          </p>
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
        {isDepositDisabled ? "Depositing Unavailable" : ctaLabel}
      </DepositButton>

      {/* Fee breakdown */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-accent-primary">
          Bitcoin Network Fee
          {partialLiquidation?.isEnabled &&
            partialLiquidation.strategy === "SPLIT" && (
              <span className="text-accent-secondary">
                {" "}
                (includes split tx)
              </span>
            )}
        </span>
        <span>
          <span
            className={isFeeError ? "text-error-main" : "text-accent-primary"}
          >
            {feeAmount}
          </span>{" "}
          <span className="text-accent-secondary">{feePrice}</span>
        </span>
      </div>
    </div>
  );
}
