import { KeyValueList, SubSection, type KeyValueItem } from "@babylonlabs-io/core-ui";

interface LoanSummaryCardProps {
  collateralAmount: number;
  loanAmount: number;
  ltv: number;
  liquidationLtv: number;
}

export function LoanSummaryCard({
  collateralAmount,
  loanAmount,
  ltv,
  liquidationLtv,
}: LoanSummaryCardProps) {
  const items: KeyValueItem[] = [
    {
      label: "Collateral (BTC)",
      value: `${collateralAmount.toFixed(4)} BTC`,
    },
    {
      label: "Loan (USDC)",
      value: `${loanAmount.toLocaleString()} USDC`,
    },
    {
      label: "LTV",
      value: `${ltv.toFixed(1)}%`,
    },
    {
      label: "Liquidation LTV",
      value: `${liquidationLtv}%`,
    },
  ];

  return (
    <SubSection className="w-full flex-col">
      <KeyValueList items={items} showDivider={false} className="w-full" />
    </SubSection>
  );
}
