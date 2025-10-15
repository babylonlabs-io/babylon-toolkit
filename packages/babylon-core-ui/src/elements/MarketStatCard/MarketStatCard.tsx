import { splitAmountUnit } from "../../utils/formatAmount";

interface MarketStatCardProps {
  title: string;
  amount: string;
  subtitle?: string;
}

export function MarketStatCard({ title, amount, subtitle }: MarketStatCardProps) {
  const { value, unit } = splitAmountUnit(amount);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] font-normal text-accent-secondary">
        {title}
      </p>
      <div className="flex items-baseline gap-0.5">
        <span className="text-[24px] font-normal text-accent-primary">
          {value}
        </span>
        {unit && (
          <span className="text-[24px] font-normal text-accent-secondary">
            {unit}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-[14px] font-normal text-accent-secondary">
          {subtitle}
        </p>
      )}
    </div>
  );
}

