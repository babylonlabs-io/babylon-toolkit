import { KeyValueList, SubSection } from "@babylonlabs-io/core-ui";

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

function HeartIcon({ isHealthy }: { isHealthy: boolean }) {
  const color = isHealthy ? "#00E676" : "#5A5A5A";

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block"
    >
      <path
        d="M8 14.5C7.78333 14.5 7.57083 14.45 7.3625 14.35C5.8625 13.6167 4.5625 12.7417 3.4625 11.725C2.3625 10.7083 1.5 9.55 0.875 8.25C0.291667 6.96667 0 5.66667 0 4.35C0 3.15 0.395833 2.125 1.1875 1.275C1.97917 0.425 2.96667 0 4.15 0C5.01667 0 5.80417 0.225 6.5125 0.675C7.22083 1.125 7.7 1.7 8 2.4C8.3 1.7 8.77917 1.125 9.4875 0.675C10.1958 0.225 10.9833 0 11.85 0C13.0333 0 14.0208 0.425 14.8125 1.275C15.6042 2.125 16 3.15 16 4.35C16 5.66667 15.7083 6.96667 15.125 8.25C14.5 9.55 13.6375 10.7083 12.5375 11.725C11.4375 12.7417 10.1375 13.6167 8.6375 14.35C8.42917 14.45 8.21667 14.5 8 14.5Z"
        fill={color}
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block cursor-help opacity-50"
    >
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" />
      <path
        d="M7 10V6.5M7 4.5H7.005"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
    current: string,
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
