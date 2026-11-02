import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import {
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

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
  /** Usable BTC/USD price; null renders the max-to-borrow placeholder. */
  btcPriceUsd: number | null;
}

export function CollateralFactorRow({
  collateralFactor,
  amountBtc,
  btcPriceUsd,
}: CollateralFactorRowProps) {
  if (collateralFactor === null) return null;

  // Same formatter as the collateral-factor fee row on this screen, so a
  // fractional basis-point value cannot read 78.25% in one row and 78% in the
  // other. The values themselves can differ for a user with a position after
  // the reserve's config key rotates: this row takes the current key, which
  // `borrow()` applies, and the fee row the position's stored key.
  const percent = formatBasisPointsAsPercent(collateralFactor * BPS_SCALE);

  const maxBorrowUsd =
    btcPriceUsd === null
      ? null
      : computeMaxBorrowUsd(amountBtc, btcPriceUsd, collateralFactor);

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
        <Hint
          tooltip={FORM_COPY.maxToBorrowTooltip(MIN_HEALTH_FACTOR_FOR_BORROW)}
          icon={<InfoIcon size={16} className="text-accent-secondary" />}
        />
      </span>
    </div>
  );
}
