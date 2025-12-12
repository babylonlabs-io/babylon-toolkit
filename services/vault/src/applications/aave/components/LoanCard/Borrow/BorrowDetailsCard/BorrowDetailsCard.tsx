import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";

import { HeartIcon, InfoIcon } from "@/components/shared";

interface KeyValueItem {
  label: string | React.ReactNode;
  value: string | React.ReactNode;
}

interface BorrowDetailsCardProps {
  borrowRate: string;
  collateral: string;
  healthFactor: string;
  healthFactorOriginal?: string;
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
 * BorrowDetailsCard - Displays borrow rate, collateral, and LTV
 */
export function BorrowDetailsCard({
  borrowRate,
  collateral,
  healthFactor,
  healthFactorOriginal,
}: BorrowDetailsCardProps) {
  const items: KeyValueItem[] = [
    {
      label: <LabelWithInfo>Borrow rate</LabelWithInfo>,
      value: borrowRate,
    },
    {
      label: <LabelWithInfo>Collateral</LabelWithInfo>,
      value: collateral,
    },
    {
      label: <LabelWithInfo>Health factor</LabelWithInfo>,
      value: healthFactorOriginal ? (
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-accent-secondary">
            <HeartIcon isHealthy={false} />
            {healthFactorOriginal}
          </span>
          <span className="text-accent-secondary">→</span>
          <span className="flex items-center gap-1">
            <HeartIcon isHealthy={healthFactor !== "-"} />
            {healthFactor}
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <HeartIcon isHealthy={healthFactor !== "-"} />
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
