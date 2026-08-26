import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { computeMaxBorrowUsd } from "@/utils/collateral";
import { formatCompactUsd } from "@/utils/formatting";

const PERCENT_SCALE = 100;

const FORM_COPY = COPY.deposit.form;

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
      <span className="text-accent-primary">{FORM_COPY.maxToBorrowLabel}</span>
      <span>
        <span className="text-accent-primary">
          {maxBorrowUsd !== null
            ? `${formatCompactUsd(maxBorrowUsd)} USD`
            : "--"}
        </span>
        <span className="text-accent-secondary">
          {" "}
          {FORM_COPY.cfParenthetical(percent)}
        </span>
        {/* attach-to-children keeps the markup inline-valid inside this
            span (a bare Hint would nest a div inside it). */}
        <Hint tooltip={COPY.tooltips.collateralFactor} attachToChildren>
          <InfoIcon size={16} className="text-accent-secondary" />
        </Hint>
      </span>
    </div>
  );
}
