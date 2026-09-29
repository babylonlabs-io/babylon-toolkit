import { Hint, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
  HEALTH_FACTOR_COLORS,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";
import type { HubIdentity } from "@/services/aave/hubRegistry";

import { HubLabel } from "../../../HubLabel";

interface RepayDetailsCardProps {
  /** Hub the debt is owed to. */
  hub: HubIdentity;
  /** Outstanding debt after the repayment (or current debt when not repaying). */
  debt: string;
  /** Current debt, shown before the arrow when a repay amount is entered. */
  debtOriginal?: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
}

const ROW_CLASS = "flex w-full items-center justify-between text-sm";

/**
 * RepayDetailsCard - Displays the hub, outstanding debt and health factor for
 * the selected reserve, the last two with a before → after indicator when a
 * repay amount is entered. The hub comes first: the same token can be owed to
 * two hubs, and this repays only one of them.
 */
export function RepayDetailsCard({
  hub,
  debt,
  debtOriginal,
  healthFactor,
  healthFactorValue,
  healthFactorOriginal,
}: RepayDetailsCardProps) {
  const status = getHealthFactorStatusFromValue(healthFactorValue);
  const color = getHealthFactorColor(status);

  return (
    <SubSection className="w-full flex-col gap-4 !bg-secondary-highlight">
      <div className={ROW_CLASS}>
        <span className="text-accent-secondary">{COPY.loans.hub.label}</span>
        <HubLabel hub={hub} className="text-accent-primary" />
      </div>

      <div className={ROW_CLASS}>
        <span className="text-accent-secondary">{COPY.loans.debtLabel}</span>
        <span className="text-accent-primary">
          {debtOriginal ? (
            <span className="flex items-center gap-2">
              <span className="text-accent-secondary">{debtOriginal}</span>
              <span className="text-accent-secondary">
                {COPY.common.valueTransitionArrow}
              </span>
              <span>{debt}</span>
            </span>
          ) : (
            debt
          )}
        </span>
      </div>

      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.healthFactorLabel}
          <Hint tooltip={COPY.tooltips.healthFactor} />
        </div>
        <span className="flex items-center gap-2 text-accent-primary">
          {healthFactorOriginal ? (
            <>
              <span className="flex items-center gap-1 text-accent-secondary">
                {healthFactorOriginal}
                <HeartIcon color={HEALTH_FACTOR_COLORS.GRAY} />
              </span>
              <span className="text-accent-secondary">
                {COPY.common.valueTransitionArrow}
              </span>
              <span className="flex items-center gap-1">
                {healthFactor}
                <HeartIcon color={color} />
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1">
              {healthFactor}
              <HeartIcon color={color} />
            </span>
          )}
        </span>
      </div>
    </SubSection>
  );
}
