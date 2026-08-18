import { Avatar, Hint } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

export function CollateralInfoCard({
  assetIcon,
  assetName,
  collateralFactor,
}: {
  assetIcon: string;
  assetName: string;
  /** Pre-formatted, e.g. "75%", or COPY.common.emptyValue. */
  collateralFactor: string;
}) {
  return (
    <div
      className="flex w-full flex-col gap-4 rounded-2xl bg-background-secondary p-6"
      data-testid="collateral-info-card"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-secondary">
          {COPY.marketData.collateral.assetLabel}
        </span>
        <div className="flex items-center gap-1">
          <Avatar
            url={assetIcon}
            alt={assetName}
            size="small"
            variant="circular"
            className="h-6 w-6 shrink-0 rounded-full bg-white"
          />
          <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
            {assetName}
          </span>
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-secondary">
            {COPY.marketData.collateral.factorLabel}
          </span>
          <Hint tooltip={COPY.tooltips.collateralFactor} />
        </div>
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {collateralFactor}
        </span>
      </div>
    </div>
  );
}
