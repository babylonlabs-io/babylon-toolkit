import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";

import { HeartIcon, InfoIcon } from "@/components/shared";

import { HEALTH_FACTOR_WARNING_THRESHOLD } from "../../../../constants";

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
  const isHealthy = (value: number | undefined): boolean =>
    value !== undefined && value >= HEALTH_FACTOR_WARNING_THRESHOLD;

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
      value: healthFactorOriginal ? (
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-accent-secondary">
            <HeartIcon isHealthy={isHealthy(healthFactorOriginalValue)} />
            {healthFactorOriginal}
          </span>
          <span className="text-accent-secondary">→</span>
          <span className="flex items-center gap-1">
            <HeartIcon isHealthy={isHealthy(healthFactorValue)} />
            {healthFactor}
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <HeartIcon isHealthy={isHealthy(healthFactorValue)} />
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
