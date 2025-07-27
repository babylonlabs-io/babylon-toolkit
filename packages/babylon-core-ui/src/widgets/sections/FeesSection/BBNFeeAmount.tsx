import { FeeItem } from "./FeeItem";
import { BBN_DECIMAL_PLACES } from "../../../utils/constants";

interface BBNFeeAmountProps {
  amount: number | string;
  coinSymbol: string;
  hint?: string;
  title?: string;
  className?: string;
  decimals?: number;
}

export function BBNFeeAmount({ amount, coinSymbol, hint, title, className, decimals = BBN_DECIMAL_PLACES }: BBNFeeAmountProps) {
  const formattedAmount = typeof amount === "number" ? amount.toFixed(decimals) : amount;

  return (
    <FeeItem title={title ?? `${coinSymbol} Network Fee`} hint={hint} className={className}>
      {formattedAmount} {coinSymbol}
    </FeeItem>
  );
}
