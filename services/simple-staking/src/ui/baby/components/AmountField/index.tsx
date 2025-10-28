import { AmountSubsection } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

const { logo, coinSymbol, displayUSD } = getNetworkConfigBBN();

interface AmountFieldProps {
  balance?: number;
  price?: number;
}

export const AmountField = ({ balance, price }: AmountFieldProps) => {
  // Only create balanceDetails if balance is provided (price is optional)
  const balanceDetails =
    balance !== undefined
      ? {
          displayUSD,
          symbol: coinSymbol,
          balance,
          price,
          decimals: 2,
        }
      : undefined;

  return (
    <AmountSubsection
      autoFocus={false}
      displayBalance
      fieldName="amount"
      currencyIcon={logo}
      currencyName={coinSymbol}
      placeholder="Enter Amount"
      {...(balanceDetails && { balanceDetails })}
    />
  );
};
