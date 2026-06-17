import { Hint, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

interface RepayDetailsCardProps {
  /** Outstanding debt after the repayment (or current debt when not repaying). */
  debt: string;
  /** Current debt, shown before the arrow when a repay amount is entered. */
  debtOriginal?: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

const ROW_CLASS = "flex w-full items-center justify-between text-sm";

/**
 * RepayDetailsCard - Displays the outstanding debt and health factor for the
 * selected reserve, each with a before → after indicator when a repay amount
 * is entered.
 */
export function RepayDetailsCard({
  debt,
  debtOriginal,
  healthFactor,
  healthFactorValue,
  healthFactorOriginal,
  healthFactorOriginalValue,
}: RepayDetailsCardProps) {
  const status = getHealthFactorStatusFromValue(healthFactorValue);
  const color = getHealthFactorColor(status);
  const originalStatus =
    healthFactorOriginalValue !== undefined
      ? getHealthFactorStatusFromValue(healthFactorOriginalValue)
      : undefined;
  const originalColor = originalStatus
    ? getHealthFactorColor(originalStatus)
    : undefined;

  return (
    <SubSection className="w-full flex-col gap-4 !bg-secondary-highlight">
      <div className={ROW_CLASS}>
        <div className="flex items-center gap-1 text-accent-secondary">
          {COPY.loans.debtLabel}
          <Hint tooltip={COPY.loans.debtTooltip} />
        </div>
        <span className="text-accent-primary">
          {debtOriginal ? (
            <span className="flex items-center gap-2">
              <span className="text-accent-secondary">{debtOriginal}</span>
              <span className="text-accent-secondary">→</span>
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
          <Hint tooltip={COPY.loans.healthFactorTooltip} />
        </div>
        <span className="flex items-center gap-2 text-accent-primary">
          {healthFactorOriginal && originalColor ? (
            <>
              <span className="flex items-center gap-1 text-accent-secondary">
                <HeartIcon color={originalColor} />
                {healthFactorOriginal}
              </span>
              <span className="text-accent-secondary">→</span>
              <span className="flex items-center gap-1">
                <HeartIcon color={color} />
                {healthFactor}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1">
              <HeartIcon color={color} />
              {healthFactor}
            </span>
          )}
        </span>
      </div>
    </SubSection>
  );
}
