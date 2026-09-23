import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import { BPS_SCALE } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { COPY } from "@/copy";
import { computeMaxBorrowUsd } from "@/utils/collateral";
import {
  formatBasisPointsAsPercent,
  formatCompactUsd,
} from "@/utils/formatting";

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

  // Same formatter as the collateral-factor fee row on this screen, so a
  // fractional basis-point value cannot read 78.25% in one row and 78% in the
  // other.
  const percent = formatBasisPointsAsPercent(collateralFactor * BPS_SCALE);

  const maxBorrowUsd = hasPriceFetchError
    ? null
    : computeMaxBorrowUsd(amountBtc, btcPrice, collateralFactor);

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-accent-primary">{FORM_COPY.maxToBorrowLabel}</span>
      <span className="inline-flex items-center gap-1">
        <span className="text-accent-primary">
          {maxBorrowUsd !== null
            ? `${formatCompactUsd(maxBorrowUsd)} USD`
            : "--"}
        </span>
        <span className="text-accent-secondary">
          {FORM_COPY.cfParenthetical(percent)}
        </span>
        <Hint tooltip={COPY.tooltips.collateralFactor} attachToChildren>
          <InfoIcon size={16} className="text-accent-secondary" />
        </Hint>
      </span>
    </div>
  );
}
