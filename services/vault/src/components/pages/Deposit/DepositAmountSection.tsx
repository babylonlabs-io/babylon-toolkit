import {
  AmountItem,
  Card,
  CheckIcon,
  SubSection,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { depositService } from "../../../services/deposit";

const BTC_ICON_PATH = "/images/btc.png";

interface DepositAmountSectionProps {
  amount: string;
  btcBalance: bigint;
  btcPrice: number;
  error?: string;
  completed?: boolean;
  onAmountChange: (value: string) => void;
  onMaxClick: () => void;
}

export function DepositAmountSection({
  amount,
  btcBalance,
  btcPrice,
  error,
  completed,
  onAmountChange,
  onMaxClick,
}: DepositAmountSectionProps) {
  const btcBalanceFormatted = useMemo(() => {
    if (!btcBalance) return 0;
    return Number(depositService.formatSatoshisToBtc(btcBalance, 8));
  }, [btcBalance]);

  const amountUsd = useMemo(() => {
    if (!btcPrice || !amount || amount === "0") return "";
    const btcNum = parseFloat(amount);
    if (isNaN(btcNum)) return "";
    const usdValue = btcNum * btcPrice;
    return `$${usdValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [amount, btcPrice]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-4 text-2xl font-normal capitalize text-accent-primary md:mb-6">
        1. Deposit
        {completed && <CheckIcon size={26} variant="success" />}
      </h3>
      <SubSection className="flex w-full flex-col gap-2">
        <AmountItem
          amount={amount}
          amountUsd={amountUsd}
          currencyIcon={BTC_ICON_PATH}
          currencyName="Bitcoin"
          placeholder="Enter amount"
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
          autoFocus={false}
          onChange={(e) => onAmountChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onMaxClick={onMaxClick}
          subtitle={error || ""}
        />
      </SubSection>
    </Card>
  );
}
