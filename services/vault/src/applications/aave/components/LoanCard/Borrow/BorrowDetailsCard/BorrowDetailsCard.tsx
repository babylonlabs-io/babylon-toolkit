import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";

import {
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
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
  const status = getHealthFactorStatusFromValue(healthFactorValue);
  const color = getHealthFactorColor(status);
  const originalStatus =
    healthFactorOriginalValue !== undefined
      ? getHealthFactorStatusFromValue(healthFactorOriginalValue)
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
