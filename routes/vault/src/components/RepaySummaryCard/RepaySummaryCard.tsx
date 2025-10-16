import { KeyValueList, SubSection, type KeyValueItem } from "@babylonlabs-io/core-ui";

interface RepaySummaryCardProps {
  currentLoanAmount: number;
  repayAmount: number;
  ltv: number;
  liquidationLtv: number;
}

export function RepaySummaryCard({
  currentLoanAmount,
  repayAmount,
  ltv,
  liquidationLtv,
}: RepaySummaryCardProps) {
  const remainingLoanAmount = currentLoanAmount - repayAmount;

  const items: KeyValueItem[] = [
    {
      label: "Loan (USDC)",
      value: `${remainingLoanAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC`,
    },
    {
      label: "LTV",
      value: `${ltv.toFixed(1)} %`,
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

