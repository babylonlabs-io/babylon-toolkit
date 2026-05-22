import { Hint } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { formatBtcAmount } from "@/utils/formatting";

const TRANSACTION_RESERVE_TOOLTIP =
  "A small portion of your deposit is reserved in a dedicated output to fund a future protocol claim transaction. It remains locked until claim conditions are met and is returned to you if unused.";

interface DepositFeesBreakdownProps {
  depositorClaimValue?: bigint;
  btcPrice: number;
  hasPriceFetchError: boolean;
  bitcoinNetworkFeeAmount: string;
  bitcoinNetworkFeePrice: string;
  bitcoinNetworkFeeIsError: boolean;
  ethereumNetworkFeeAmount: string;
  ethereumNetworkFeePrice: string;
  ethereumNetworkFeeIsError: boolean;
  protocolFeeAmount: string;
  protocolFeePrice: string;
  protocolFeeIsError: boolean;
}

interface FeeLineProps {
  label: string;
  tooltip?: string;
  amount: string;
  amountIsError?: boolean;
  price: string;
}

function FeeLine({
  label,
  tooltip,
  amount,
  amountIsError,
  price,
}: FeeLineProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      {tooltip ? (
        <Hint
          tooltip={tooltip}
          attachToChildren
          className="text-accent-primary"
        >
          <span>{label}</span>
        </Hint>
      ) : (
        <span className="text-accent-primary">{label}</span>
      )}
      <span>
        <span
          className={amountIsError ? "text-error-main" : "text-accent-primary"}
        >
          {amount}
        </span>
        {price && <span className="text-accent-secondary"> {price}</span>}
      </span>
    </div>
  );
}

export function DepositFeesBreakdown({
  depositorClaimValue,
  btcPrice,
  hasPriceFetchError,
  bitcoinNetworkFeeAmount,
  bitcoinNetworkFeePrice,
  bitcoinNetworkFeeIsError,
  ethereumNetworkFeeAmount,
  ethereumNetworkFeePrice,
  ethereumNetworkFeeIsError,
  protocolFeeAmount,
  protocolFeePrice,
  protocolFeeIsError,
}: DepositFeesBreakdownProps) {
  const transactionReserve = useMemo(() => {
    if (depositorClaimValue === undefined) {
      return { amount: "--", price: "" };
    }
    const btc = satoshiToBtcNumber(depositorClaimValue);
    const hasPrice = !hasPriceFetchError && btcPrice > 0;
    const price = hasPrice
      ? `($${(btc * btcPrice).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USD)`
      : "";
    return { amount: formatBtcAmount(btc), price };
  }, [depositorClaimValue, btcPrice, hasPriceFetchError]);

  return (
    <div className="flex flex-col gap-2">
      <FeeLine
        label="Transaction Reserve"
        tooltip={TRANSACTION_RESERVE_TOOLTIP}
        amount={transactionReserve.amount}
        price={transactionReserve.price}
      />
      <FeeLine
        label="Bitcoin Network Fee"
        amount={bitcoinNetworkFeeAmount}
        amountIsError={bitcoinNetworkFeeIsError}
        price={bitcoinNetworkFeePrice}
      />
      <FeeLine
        label="Ethereum Network Fee"
        amount={ethereumNetworkFeeAmount}
        amountIsError={ethereumNetworkFeeIsError}
        price={ethereumNetworkFeePrice}
      />
      <FeeLine
        label="Protocol Fee"
        amount={protocolFeeAmount}
        amountIsError={protocolFeeIsError}
        price={protocolFeePrice}
      />
    </div>
  );
}
