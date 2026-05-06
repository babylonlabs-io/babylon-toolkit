import { computeMaxBorrowUsd } from "@/utils/collateral";
import { formatCompactUsd } from "@/utils/formatting";

const PERCENT_SCALE = 100;

interface CollateralFactorRowProps {
  collateralFactor: number | null;
  amountBtc: string;
  btcPrice: number;
  hasPriceFetchError: boolean;
}

export function CollateralFactorRow({
  collateralFactor,
  amountBtc,
  btcPrice,
  hasPriceFetchError,
}: CollateralFactorRowProps) {
  if (collateralFactor === null) return null;

  const percent = `${Math.round(collateralFactor * PERCENT_SCALE)}%`;

  const maxBorrowUsd = hasPriceFetchError
    ? null
    : computeMaxBorrowUsd(amountBtc, btcPrice, collateralFactor);

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-accent-primary">Collateral Factor:</span>
      <span>
        <span className="text-accent-primary">{percent}</span>
        {maxBorrowUsd !== null && (
          <span className="text-accent-secondary">
            {" "}
            ({formatCompactUsd(maxBorrowUsd)} max USD)
          </span>
        )}
      </span>
    </div>
  );
}
