import {
  AmountItem,
  Card,
  CheckIcon,
  SubSection,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";
import { getNetworkConfigBTC } from "@/config";

import { PriceWarningBanner } from "../../shared";

const btcConfig = getNetworkConfigBTC();

interface DepositAmountSectionProps {
  amount: string;
  btcBalanceFormatted: number;
  btcPrice: number;
  error?: string;
  completed?: boolean;
  onAmountChange: (value: string) => void;
  onAmountBlur?: () => void;
  onMaxClick: () => void;
  priceMetadata?: Record<string, PriceMetadata>;
  hasStalePrices?: boolean;
  hasPriceFetchError?: boolean;
}

export function DepositAmountSection({
  amount,
  btcBalanceFormatted,
  btcPrice,
  error,
  completed,
  onAmountChange,
  onAmountBlur,
  onMaxClick,
  priceMetadata = {},
  hasStalePrices = false,
  hasPriceFetchError = false,
}: DepositAmountSectionProps) {
  const amountUsd = useMemo(() => {
    // Don't show USD if price fetch failed
    if (hasPriceFetchError) return "";
    if (!btcPrice || !amount || amount === "0") return "";
    const btcNum = parseFloat(amount);
    if (isNaN(btcNum)) return "";
    const usdValue = btcNum * btcPrice;
    return `$${usdValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [amount, btcPrice, hasPriceFetchError]);

  const showPriceWarning = hasStalePrices || hasPriceFetchError;

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
        1. Deposit
        {completed && <CheckIcon size={26} variant="success" />}
      </h3>
      <SubSection className="flex w-full flex-col gap-2">
        {showPriceWarning && (
          <PriceWarningBanner
            metadata={priceMetadata}
            hasPriceFetchError={hasPriceFetchError}
            hasStalePrices={hasStalePrices}
          />
        )}
        {/* Wrapper div captures blur from AmountItem's internal input */}
        <div onBlur={onAmountBlur}>
          <AmountItem
            amount={amount}
            amountUsd={amountUsd}
            currencyIcon={btcConfig.icon}
            currencyName={btcConfig.name}
            placeholder="Enter amount"
            displayBalance={true}
            balanceDetails={{
              balance: btcBalanceFormatted,
              symbol: btcConfig.coinSymbol,
              price: btcPrice,
              displayUSD: btcConfig.displayUSD && !hasPriceFetchError,
              decimals: 4,
            }}
            autoFocus={false}
            onChange={(e) => onAmountChange(e.target.value)}
            onMaxClick={onMaxClick}
          />
        </div>
        {error && <p className="text-sm text-error-main">{error}</p>}
      </SubSection>
    </Card>
  );
}
