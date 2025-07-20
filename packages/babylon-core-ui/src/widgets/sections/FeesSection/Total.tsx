import { Text } from "../../../components/Text";
import { twMerge } from "tailwind-merge";
import { BTC_DECIMAL_PLACES } from "../../../utils/constants";

interface TotalProps {
  total: number | string;
  coinSymbol: string;
  hint?: string;
  title?: string;
  className?: string;
  decimals?: number;
}

export function Total({ total, coinSymbol, hint, title = "Total", className, decimals = BTC_DECIMAL_PLACES }: TotalProps) {
  let formattedTotal;
  if (typeof total === "number") {
    if (total === 0) {
      formattedTotal = "0";
    } else {
      const str = total.toFixed(decimals);
      formattedTotal = str.replace(/0+$/, "").replace(/\.$/, "");
    }
  } else {
    formattedTotal = total;
  }

  return (
    <div className={twMerge("flex flex-row items-start justify-between text-accent-primary", className)}>
      <Text variant="body1" className="font-bold">
        {title}
      </Text>

      <div className="flex flex-col items-end justify-center">
        <Text variant="body1" className="font-bold">
          {formattedTotal} {coinSymbol}
        </Text>
        {hint && (
          <Text variant="body1" className="text-sm text-accent-secondary">
            {hint}
          </Text>
        )}
      </div>
    </div>
  );
}
