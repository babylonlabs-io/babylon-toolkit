import {
  KeyValueList,
  SubSection,
  type KeyValueItem,
} from "@babylonlabs-io/core-ui";

interface LoanSummaryCardProps {
  collateralAmount: number;
  collateralSymbol?: string;
  loanAmount: number;
  loanSymbol?: string;
  ltv: number;
  liquidationLtv: number;
}

export function LoanSummaryCard({
  collateralAmount,
  collateralSymbol = "BTC",
  loanAmount,
  loanSymbol = "USDC",
  ltv,
  liquidationLtv,
}: LoanSummaryCardProps) {
  const items: KeyValueItem[] = [
    {
      label: `Collateral (${collateralSymbol})`,
      value: `${collateralAmount.toFixed(4)} ${collateralSymbol}`,
    },
    {
      label: `Loan (${loanSymbol})`,
      value: `${loanAmount.toLocaleString()} ${loanSymbol}`,
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
      <KeyValueList
        items={items}
        showDivider={false}
        className="w-full"
        textSize="small"
      />
    </SubSection>
  );
}
