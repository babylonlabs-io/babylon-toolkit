import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatus,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HeartIcon, InfoIcon } from "@/components/shared";

interface KeyValueItem {
  label: string | React.ReactNode;
  value: string | React.ReactNode;
}

interface BorrowDetailsCardProps {
  borrowRatio: string;
  borrowRatioOriginal?: string;
  healthFactor: string;
  healthFactorValue: number;
  healthFactorOriginal?: string;
  healthFactorOriginalValue?: number;
}

function LabelWithInfo({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {children}
      <InfoIcon />
    </span>
  );
}

/**
 * Get health factor status for preview calculations
 * Note: For preview values, we assume there is debt if the value > 0
 */
function getPreviewHealthFactorStatus(value: number): HealthFactorStatus {
  const hasDebt = value > 0;
  const healthFactor = value > 0 ? value : null;
  return getHealthFactorStatus(healthFactor, hasDebt);
}

/**
 * BorrowDetailsCard - Displays borrow rate and health factor with before → after indicators
 */
export function BorrowDetailsCard({
  borrowRatio,
  borrowRatioOriginal,
  healthFactor,
  healthFactorValue,
  healthFactorOriginal,
  healthFactorOriginalValue,
}: BorrowDetailsCardProps) {
  const status = getPreviewHealthFactorStatus(healthFactorValue);
  const color = getHealthFactorColor(status);
  const originalStatus =
    healthFactorOriginalValue !== undefined
      ? getPreviewHealthFactorStatus(healthFactorOriginalValue)
      : undefined;
  const originalColor = originalStatus
    ? getHealthFactorColor(originalStatus)
    : undefined;

  const items: KeyValueItem[] = [
    {
      label: <LabelWithInfo>Borrow rate</LabelWithInfo>,
      value: borrowRatioOriginal ? (
        <span className="flex items-center gap-2">
          <span className="text-accent-secondary">{borrowRatioOriginal}</span>
          <span className="text-accent-secondary">→</span>
          <span>{borrowRatio}</span>
        </span>
      ) : (
        borrowRatio
      ),
    },
    {
      label: <LabelWithInfo>Health factor</LabelWithInfo>,
      value:
        healthFactorOriginal && originalColor ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-accent-secondary">
              <HeartIcon color={originalColor} />
              {healthFactorOriginal}
            </span>
            <span className="text-accent-secondary">→</span>
            <span className="flex items-center gap-1">
              <HeartIcon color={color} />
              {healthFactor}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <HeartIcon color={color} />
            {healthFactor}
          </span>
        ),
    },
  ];

  return (
    <SubSection className="w-full flex-col">
      <KeyValueList
        items={items as any}
        showDivider={false}
        className="w-full"
        textSize="small"
      />
    </SubSection>
  );
}
