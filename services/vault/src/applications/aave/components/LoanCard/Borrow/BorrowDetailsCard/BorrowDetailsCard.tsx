import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";
import { HeartIcon, InfoIcon } from "@/components/shared";

interface KeyValueItem {
  label: string | React.ReactNode;
  value: string | React.ReactNode;
}

interface BorrowDetailsCardProps {
  borrowRate: string;
  netApy: string;
  netApyOriginal?: string;
  netBalance: string;
  netBalanceOriginal?: string;
  netCollateral: string;
  netCollateralOriginal?: string;
  riskPremium: string;
  riskPremiumOriginal?: string;
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
 * BorrowDetailsCard - Displays borrow details including health factor with dynamic heart icon
 */
export function BorrowDetailsCard({
  borrowRate,
  netApy,
  netApyOriginal,
  netBalance,
  netBalanceOriginal,
  netCollateral,
  netCollateralOriginal,
  riskPremium,
  riskPremiumOriginal,
  healthFactor,
  healthFactorOriginal,
}: BorrowDetailsCardProps) {
  const renderTransition = (
    original: string | undefined,
    current: string
  ): string | JSX.Element => {
    if (!original) {
      return current;
    }
    return (
      <span className="flex items-center gap-2">
        <span className="text-accent-secondary">{original}</span>
        <span className="text-accent-secondary">→</span>
        <span>{current}</span>
      </span>
    );
  };

  const items: KeyValueItem[] = [
    {
      label: <LabelWithInfo>Borrow rate</LabelWithInfo>,
      value: borrowRate,
    },
    {
      label: <LabelWithInfo>Net APY</LabelWithInfo>,
      value: renderTransition(netApyOriginal, netApy),
    },
    {
      label: <LabelWithInfo>Net balance</LabelWithInfo>,
      value: renderTransition(netBalanceOriginal, netBalance),
    },
    {
      label: <LabelWithInfo>Net collateral</LabelWithInfo>,
      value: renderTransition(netCollateralOriginal, netCollateral),
    },
    {
      label: <LabelWithInfo>Risk premium</LabelWithInfo>,
      value: renderTransition(riskPremiumOriginal, riskPremium),
    },
    {
      label: <LabelWithInfo>Health factor</LabelWithInfo>,
      value: healthFactorOriginal ? (
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-accent-secondary">
            {healthFactorOriginal}
            <HeartIcon isHealthy={false} />
          </span>
          <span className="text-accent-secondary">→</span>
          <span className="flex items-center gap-1">
            {healthFactor}
            <HeartIcon isHealthy={healthFactor !== "-"} />
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {healthFactor}
          <HeartIcon isHealthy={healthFactor !== "-"} />
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
