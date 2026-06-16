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
  /** Entered deposit amount (satoshis) — base for the net-payout figure. */
  amountSats: bigint;
  /** VP commission (bps) for the selected provider; undefined while loading. */
  commissionBps?: number;
  /**
   * Full HTLC output values the protocol charges commission on, one per vault.
   * `undefined` while the reserve / PegIn-fee inputs are still loading.
   */
  commissionHtlcValues?: readonly bigint[];
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
  commissionHtlcValues,
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

  // The protocol charges commission on the full HTLC output value
  // (`htlcValue = deposit + depositorClaimValue + minPeginFee`), not on the
  // entered deposit alone — see `payout.ts` (commission cap on
  // `peginPrevOut.value`). For split deposits, each HTLC is floored
  // independently by the payout cap, so mirror that rather than flooring the
  // summed value once. Net payout is the deposit minus that commission.
  // All inputs must be known to size the HTLC values, so the lines show the
  // placeholder until the commission, reserve, and PegIn fee have all loaded.
  const { commissionSats, netPayoutSats } = useMemo(() => {
    if (commissionBps === undefined || commissionHtlcValues === undefined) {
      return { commissionSats: null, netPayoutSats: null };
    }
    const bps = BigInt(commissionBps);
    const commission = commissionHtlcValues.reduce(
      (total, htlcValue) => total + (htlcValue * bps) / BPS_DENOMINATOR,
      0n,
    );
    return {
      commissionSats: commission,
      netPayoutSats: amountSats - commission,
    };
  }, [amountSats, commissionHtlcValues, commissionBps]);

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
