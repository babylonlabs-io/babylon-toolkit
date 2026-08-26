import {
  Button,
  Callout,
  Heading,
  Loader,
  Text,
} from "@babylonlabs-io/core-ui";
import { useMemo, type ReactNode } from "react";

import {
  BPS_SCALE,
  WITHDRAW_HF_BLOCK_THRESHOLD,
  WITHDRAW_HF_WARNING_THRESHOLD,
} from "@/applications/aave/constants";
import { getWithdrawHfWarningState } from "@/applications/aave/utils";
import { ReviewDetailRow } from "@/components/shared/DetailRow";
import { BTC_BLOCK_TIME_MINS } from "@/constants";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { useNetworkFees } from "@/hooks/useNetworkFees";
import {
  formatBtcAmount,
  formatDuration,
  formatUsdValue,
} from "@/utils/formatting";

import { HealthFactorDelta } from "./HealthFactorDelta";
import { NominatedAddressValue } from "./NominatedAddressValue";

const REVIEW_COPY = COPY.withdraw.review;

/** A single label/value pair rendered in the review card. */
interface DetailRow {
  label: string;
  value: ReactNode;
  /** Conversion shown on a second, secondary line under the value. */
  secondaryValue?: ReactNode;
}

interface WithdrawReviewContentProps {
  totalAmountBtc: number;
  totalAmountUsd: number;
  /** User's current on-chain health factor (null when no debt). */
  currentHealthFactor: number | null;
  /** Health factor after the selected vaults are withdrawn. Infinity when no debt. */
  projectedHealthFactor: number;
  /**
   * Decoded BTC addresses (deduped) where this withdrawal will be paid out.
   * Sourced from the on-chain registered `depositorPayoutBtcAddress` of each
   * selected vault — not the connected wallet, which can differ if the user
   * switched wallets since deposit.
   */
  payoutAddresses: string[];
  /** Max `timelockAssert` (BTC blocks) across the selected vaults; drives the ETA. */
  assertTimelockBlocks: number;
  isProcessing: boolean;
  /** Last failed-withdraw message, shown inline under the action (null when none). */
  error: string | null;
  onConfirm: () => void;
}

export function WithdrawReviewContent({
  totalAmountBtc,
  totalAmountUsd,
  currentHealthFactor,
  projectedHealthFactor,
  payoutAddresses,
  assertTimelockBlocks,
  isProcessing,
  error,
  onConfirm,
}: WithdrawReviewContentProps) {
  const { defaultFeeRate } = useNetworkFees();
  const { minVpCommissionBps } = useProtocolParamsContext();

  const { wouldBreachHF, isAtRisk } = getWithdrawHfWarningState(
    projectedHealthFactor,
  );

  const rows: DetailRow[] = useMemo(() => {
    const vpCommissionBtc = totalAmountBtc * (minVpCommissionBps / BPS_SCALE);
    const vpCommissionUsd = totalAmountUsd * (minVpCommissionBps / BPS_SCALE);

    const hfRow: DetailRow | null =
      currentHealthFactor === null
        ? null
        : {
            label: REVIEW_COPY.healthFactorLabel,
            value: (
              <HealthFactorDelta
                current={currentHealthFactor}
                projected={projectedHealthFactor}
              />
            ),
          };

    const baseRows: DetailRow[] = [
      {
        label: REVIEW_COPY.withdrawAmountLabel,
        value: formatBtcAmount(totalAmountBtc),
        secondaryValue: formatUsdValue(totalAmountUsd),
      },
      {
        label: REVIEW_COPY.networkFeeRateLabel,
        value:
          defaultFeeRate > 0
            ? `${defaultFeeRate} sats/vB`
            : COPY.common.loading,
      },
      minVpCommissionBps > 0
        ? {
            label: REVIEW_COPY.vpCommissionLabel,
            value: formatBtcAmount(vpCommissionBtc),
            secondaryValue: formatUsdValue(vpCommissionUsd),
          }
        : {
            label: REVIEW_COPY.vpCommissionLabel,
            value: REVIEW_COPY.noCommission,
          },
    ];

    const withHf = hfRow
      ? [baseRows[0], hfRow, ...baseRows.slice(1)]
      : baseRows;

    const estimatedTimeRow: DetailRow | null =
      assertTimelockBlocks > 0
        ? {
            label: COPY.withdraw.estimatedTimeLabel,
            value: `~${formatDuration(
              assertTimelockBlocks * BTC_BLOCK_TIME_MINS,
            )}`,
          }
        : null;

    const nominatedRow: DetailRow | null =
      payoutAddresses.length > 0
        ? {
            label: COPY.withdraw.nominatedAddressLabel,
            value: <NominatedAddressValue addresses={payoutAddresses} />,
          }
        : null;

    const withEta = estimatedTimeRow ? [...withHf, estimatedTimeRow] : withHf;
    return nominatedRow ? [...withEta, nominatedRow] : withEta;
  }, [
    totalAmountBtc,
    totalAmountUsd,
    currentHealthFactor,
    projectedHealthFactor,
    defaultFeeRate,
    minVpCommissionBps,
    assertTimelockBlocks,
    payoutAddresses,
  ]);

  return (
    <div className="w-full">
      <div className="rounded-t-2xl border border-b-0 border-secondary-strokeLight p-6">
        <Heading variant="h5" className="font-normal text-accent-primary">
          {REVIEW_COPY.heading}
        </Heading>
      </div>

      <div className="rounded-b-2xl border border-secondary-strokeLight p-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6">
            {rows.map((row) => (
              <ReviewDetailRow
                key={row.label}
                label={row.label}
                value={row.value}
                secondaryValue={row.secondaryValue}
              />
            ))}
          </div>

          {wouldBreachHF && (
            <Text
              variant="body2"
              className="text-error-main"
              data-testid="withdraw-hf-block-warning"
            >
              {REVIEW_COPY.hfBlockWarning(
                WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1),
              )}
            </Text>
          )}
          {isAtRisk && (
            <Text
              variant="body2"
              className="text-warning-main"
              data-testid="withdraw-hf-at-risk-warning"
            >
              {REVIEW_COPY.hfAtRiskWarning(
                WITHDRAW_HF_WARNING_THRESHOLD.toFixed(1),
              )}
            </Text>
          )}

          {/* This control's data-testid is a real-wallet E2E hook (e2e/real/actions/withdraw.ts) — carry it over if you move or rename the element. */}
          <Button
            variant="contained"
            color="secondary"
            className="w-full"
            disabled={isProcessing || wouldBreachHF}
            onClick={onConfirm}
            data-testid="withdraw-confirm-button"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <Text
                  as="span"
                  variant="body2"
                  className="text-accent-contrast"
                >
                  {REVIEW_COPY.processing}
                </Text>
              </span>
            ) : (
              REVIEW_COPY.confirmButton
            )}
          </Button>

          {error && (
            <Callout variant="error" title={COPY.common.transactionFailedTitle}>
              {error}
            </Callout>
          )}
        </div>
      </div>
    </div>
  );
}
