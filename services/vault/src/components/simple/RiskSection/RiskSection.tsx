import { Heading, Hint, InfoIcon } from "@babylonlabs-io/core-ui";

import {
  formatHealthFactor,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

import { RiskPriceRail } from "./RiskPriceRail";
import { getRiskDisplayState, type RiskDisplayState } from "./railLayout";

interface RiskSectionProps {
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  hasPosition: boolean;
  liquidationPriceText: string;
  btcPriceText: string;
  pctToLiquidationText: string;
  collateralFactorText: string;
  collateralFactorLoading: boolean;
  btcPriceUsd: number | null;
  liquidationPriceUsd: number | null;
}

const STATE_STYLE: Record<
  RiskDisplayState,
  { textClass: string; colorCss: string }
> = {
  noPosition: {
    textClass: "text-risk-muted",
    colorCss: "rgb(var(--risk-muted))",
  },
  verySafe: {
    textClass: "text-risk-green",
    colorCss: "rgb(var(--risk-green))",
  },
  safe: { textClass: "text-risk-green", colorCss: "rgb(var(--risk-green))" },
  moderate: {
    textClass: "text-risk-amber",
    colorCss: "rgb(var(--risk-amber))",
  },
  liquidatable: {
    textClass: "text-risk-red",
    colorCss: "rgb(var(--risk-red))",
  },
};

function StatCell({
  label,
  value,
  tooltip,
  loading,
}: {
  label: string;
  value: string;
  tooltip?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
      <span className="flex items-center gap-1 whitespace-nowrap text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
        {tooltip ? (
          <Hint
            tooltip={tooltip}
            icon={<InfoIcon size={16} className="text-accent-secondary" />}
          >
            <span className="text-accent-secondary">{label}</span>
          </Hint>
        ) : (
          label
        )}
      </span>
      {loading ? (
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-secondary">
          {COPY.common.loading}
        </span>
      ) : (
        <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {value}
        </span>
      )}
    </div>
  );
}

export function RiskSection({
  healthFactor,
  healthFactorStatus,
  hasPosition,
  liquidationPriceText,
  btcPriceText,
  pctToLiquidationText,
  collateralFactorText,
  collateralFactorLoading,
  btcPriceUsd,
  liquidationPriceUsd,
}: RiskSectionProps) {
  const state = getRiskDisplayState(
    healthFactorStatus,
    healthFactor,
    hasPosition,
  );
  const { textClass, colorCss } = STATE_STYLE[state];

  let hfValueText: string;
  if (state === "noPosition") {
    hfValueText = COPY.common.emptyValue;
  } else if (state === "verySafe") {
    hfValueText = COPY.risk.healthFactorInfinity;
  } else {
    hfValueText = formatHealthFactor(healthFactor);
  }

  return (
    <div className="space-y-2">
      <Heading variant="h6" as="h2" className="font-normal text-accent-primary">
        {COPY.risk.title}
      </Heading>

      <div className="rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-6 dark:bg-[#202020]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 xl:max-w-[560px]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                  {COPY.risk.healthFactorTitle}
                </span>
                <span className="max-w-[442px] text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
                  {COPY.risk.healthFactorDescription}
                </span>
              </div>
              <div className="mt-3 flex shrink-0 items-center gap-2">
                <span
                  className={`text-xl leading-[1.6] tracking-[0.15px] ${textClass}`}
                >
                  {hfValueText}
                </span>
                <HeartIcon color={colorCss} className="size-6" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: colorCss }}
              />
              <span
                className={`text-base leading-[1.5] tracking-[0.15px] ${textClass}`}
              >
                {COPY.risk.status[state]}
              </span>
            </div>

            <div className="flex items-stretch rounded-lg border border-secondary-strokeLight">
              <StatCell
                label={COPY.risk.liquidationBtcPriceLabel}
                value={liquidationPriceText}
              />
              <div className="h-14 w-px shrink-0 self-center bg-secondary-strokeLight" />
              <StatCell
                label={COPY.risk.currentBtcPriceLabel}
                value={btcPriceText}
              />
              <div className="h-14 w-px shrink-0 self-center bg-secondary-strokeLight" />
              <StatCell
                label={COPY.risk.collateralFactorLabel}
                value={collateralFactorText}
                tooltip={COPY.risk.collateralFactorTooltip}
                loading={collateralFactorLoading}
              />
            </div>
          </div>

          <div className="w-full shrink-0 xl:w-[460px]">
            <RiskPriceRail
              state={state}
              currentPriceUsd={btcPriceUsd}
              liquidationPriceUsd={liquidationPriceUsd}
              currentPriceText={btcPriceText}
              liquidationPriceText={liquidationPriceText}
              pctToLiquidationText={pctToLiquidationText}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
