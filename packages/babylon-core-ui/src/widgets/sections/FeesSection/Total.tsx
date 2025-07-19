import { Text } from "../../../components/Text";
import { twMerge } from "tailwind-merge";

interface TotalProps {
  total: number | string;
  coinSymbol: string;
  hint?: string;
  title?: string;
  className?: string;
  decimals?: number;
}

export function Total({ total, coinSymbol, hint, title = "Total", className, decimals = 8 }: TotalProps) {
  const formattedTotal =
    typeof total === "number"
      ? total === 0
        ? "0"
        : (() => {
            const str = total.toFixed(decimals);
            return str.replace(/0+$/, "").replace(/\.$/, "");
          })()
      : total;

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
