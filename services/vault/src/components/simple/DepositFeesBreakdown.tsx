import { Hint } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { COPY } from "@/copy";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import {
  formatBasisPointsAsPercent,
  formatBtcAmount,
} from "@/utils/formatting";

const TRANSACTION_RESERVE_TOOLTIP =
  "A small portion of your deposit is reserved in a dedicated output to fund a future protocol claim transaction. It remains locked until claim conditions are met and is returned to you if unused.";

const FORM_COPY = COPY.deposit.form;

/** Basis-points denominator: 10_000 bps = 100%. */
const BPS_DENOMINATOR = 10_000n;

/** Placeholder shown for a fee line whose value isn't known yet. */
const METRIC_PLACEHOLDER = "--";

interface DepositFeesBreakdownProps {
  depositorClaimValue?: bigint;
  btcPrice: number;
  hasPriceFetchError: boolean;
  protocolFeeAmount: string;
  protocolFeePrice: string;
  protocolFeeIsError: boolean;
  /** Entered deposit amount (satoshis) — base for the commission/net figures. */
  amountSats: bigint;
  /** VP commission (bps) for the selected provider; undefined while loading. */
  commissionBps?: number;
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
  protocolFeeAmount,
  protocolFeePrice,
  protocolFeeIsError,
  amountSats,
  commissionBps,
}: DepositFeesBreakdownProps) {
  // Format a satoshi value as a BTC amount plus an optional "($X USD)" suffix,
  // matching the existing fee-line presentation. `null` sats render as the
  // metric placeholder (value not yet known).
  const formatSatsLine = (
    sats: bigint | null,
  ): { amount: string; price: string } => {
    if (sats === null) {
      return { amount: METRIC_PLACEHOLDER, price: "" };
    }
    const btc = satoshiToBtcNumber(sats);
    const hasPrice = !hasPriceFetchError && btcPrice > 0;
    const price = hasPrice
      ? `($${(btc * btcPrice).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USD)`
      : "";
    return { amount: formatBtcAmount(btc), price };
  };

  const transactionReserve = formatSatsLine(
    depositorClaimValue === undefined ? null : depositorClaimValue,
  );

  // VP commission is floor(amount * bps / 10_000), deducted from the payout.
  // Net payout is the deposit minus that commission. Both are unknown until the
  // commission loads, so they show the placeholder until then.
  const { commissionSats, netPayoutSats } = useMemo(() => {
    if (commissionBps === undefined) {
      return { commissionSats: null, netPayoutSats: null };
    }
    const commission = (amountSats * BigInt(commissionBps)) / BPS_DENOMINATOR;
    return {
      commissionSats: commission,
      netPayoutSats: amountSats - commission,
    };
  }, [amountSats, commissionBps]);

  const commission = formatSatsLine(commissionSats);
  const netPayout = formatSatsLine(netPayoutSats);
  const commissionLabel =
    commissionBps === undefined
      ? FORM_COPY.vpCommissionLabel
      : `${FORM_COPY.vpCommissionLabel} (${formatBasisPointsAsPercent(commissionBps)})`;

  return (
    <div className="flex flex-col gap-2">
      <FeeLine
        label="Transaction Reserve"
        tooltip={TRANSACTION_RESERVE_TOOLTIP}
        amount={transactionReserve.amount}
        price={transactionReserve.price}
      />
      <FeeLine
        label="Protocol Fee"
        amount={protocolFeeAmount}
        amountIsError={protocolFeeIsError}
        price={protocolFeePrice}
      />
      <FeeLine
        label={commissionLabel}
        tooltip={FORM_COPY.vpCommissionTooltip}
        amount={commission.amount}
        price={commission.price}
      />
      <FeeLine
        label={FORM_COPY.netPayoutLabel}
        tooltip={FORM_COPY.netPayoutTooltip}
        amount={netPayout.amount}
        price={netPayout.price}
      />
    </div>
  );
}
