import { useMemo } from "react";

import { FeeDetailRow } from "@/components/shared/DetailRow";
import { COPY } from "@/copy";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import {
  formatBasisPointsAsPercent,
  formatBtcAmount,
} from "@/utils/formatting";

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
   * Per-vault deposit amounts (satoshis) the protocol charges commission on.
   * `undefined` while a two-vault split's per-vault amounts are loading.
   */
  commissionBaseValues?: readonly bigint[];
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
  commissionBaseValues,
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

  // The protocol charges commission on the vault deposit amount only —
  // `floor(peginAmount × bps / 10000)` per vault, where the basis is the
  // PegIn output value = the deposit (btc-vault
  // `transactions/mod.rs::build_payout_outputs`; claim value, PegIn fee,
  // and the P2A anchor are NOT part of the basis). Split deposits floor
  // each vault independently, mirroring the per-payout computation.
  // Net payout is the deposit minus that commission.
  const { commissionSats, netPayoutSats } = useMemo(() => {
    if (commissionBps === undefined || commissionBaseValues === undefined) {
      return { commissionSats: null, netPayoutSats: null };
    }
    const bps = BigInt(commissionBps);
    const commission = commissionBaseValues.reduce(
      (total, baseValue) => total + (baseValue * bps) / BPS_DENOMINATOR,
      0n,
    );
    return {
      commissionSats: commission,
      netPayoutSats: amountSats - commission,
    };
  }, [amountSats, commissionBaseValues, commissionBps]);

  const commission = formatSatsLine(commissionSats);
  const netPayout = formatSatsLine(netPayoutSats);
  const commissionLabel =
    commissionBps === undefined
      ? FORM_COPY.vpCommissionLabel
      : `${FORM_COPY.vpCommissionLabel} (${formatBasisPointsAsPercent(commissionBps)})`;

  return (
    <div className="flex flex-col gap-2">
      <FeeDetailRow
        label={FORM_COPY.transactionReserveLabel}
        tooltip={FORM_COPY.transactionReserveTooltip}
        value={transactionReserve.amount}
        secondaryValue={transactionReserve.price}
      />
      <FeeDetailRow
        label={FORM_COPY.depositFeeLabel}
        tooltip={FORM_COPY.depositFeeTooltip}
        value={protocolFeeAmount}
        valueIsError={protocolFeeIsError}
        secondaryValue={protocolFeePrice}
      />
      <FeeDetailRow
        label={commissionLabel}
        tooltip={FORM_COPY.vpCommissionTooltip}
        value={commission.amount}
        secondaryValue={commission.price}
      />
      <FeeDetailRow
        label={FORM_COPY.netPayoutLabel}
        tooltip={FORM_COPY.netPayoutTooltip}
        value={netPayout.amount}
        secondaryValue={netPayout.price}
      />
    </div>
  );
}
