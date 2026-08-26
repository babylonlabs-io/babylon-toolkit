import { FeeItem } from "../../../components/FeeItem/FeeItem";
import { BTC_DECIMAL_PLACES } from "../../../utils/constants";

interface BTCFeeAmountProps {
  amount: number | string;
  coinSymbol: string;
  hint?: string;
  title?: string;
  className?: string;
  decimals?: number;
}

export function BTCFeeAmount({ amount, coinSymbol, hint, title, className, decimals = BTC_DECIMAL_PLACES }: BTCFeeAmountProps) {
  let formattedAmount: string;

  if (typeof amount === "number") {
    if (amount === 0) {
      formattedAmount = "0";
    } else {
      const str = amount.toFixed(decimals);
      formattedAmount = str.replace(/\.?0+$/, "");
    }
  } else {
    formattedAmount = amount;
  }

  return (
    <FeeItem title={title ?? `${coinSymbol} Network Fee`} hint={hint} className={className}>
      {formattedAmount} {coinSymbol}
    </FeeItem>
  );
}
