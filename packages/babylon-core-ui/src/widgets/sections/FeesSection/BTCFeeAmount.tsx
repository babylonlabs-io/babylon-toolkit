import { FeeItem } from "./FeeItem";

interface BTCFeeAmountProps {
  amount: number | string;
  coinSymbol: string;
  hint?: string;
  title?: string;
  className?: string;
  decimals?: number;
}

export function BTCFeeAmount({ amount, coinSymbol, hint, title, className, decimals = 8 }: BTCFeeAmountProps) {
  const formattedAmount =
    typeof amount === "number"
      ? amount === 0
        ? "0"
        : (() => {
            const str = amount.toFixed(decimals);
            return str.replace(/0+$/, "").replace(/\.$/, "");
          })()
      : amount;

  return (
    <FeeItem title={title ?? `${coinSymbol} Network Fee`} hint={hint} className={className}>
      {formattedAmount} {coinSymbol}
    </FeeItem>
  );
}
