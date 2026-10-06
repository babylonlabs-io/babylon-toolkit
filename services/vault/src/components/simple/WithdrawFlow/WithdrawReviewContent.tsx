import {
  Button,
  Callout,
  Checkbox,
  Heading,
  Loader,
  Text,
  WarningIcon,
} from "@babylonlabs-io/core-ui";
import { useMemo, type ReactNode } from "react";

import {
  WITHDRAW_HF_BLOCK_THRESHOLD,
  WITHDRAW_HF_WARNING_THRESHOLD,
} from "@/applications/aave/constants";
import { getWithdrawHfWarningState } from "@/applications/aave/utils";
import { ReviewDetailRow } from "@/components/shared/DetailRow";
import { BTC_BLOCK_TIME_MINS } from "@/constants";
import { COPY } from "@/copy";
import { useNetworkFees } from "@/hooks/useNetworkFees";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import {
  formatBtcAmount,
  formatDuration,
  formatUsdValue,
} from "@/utils/formatting";

import { HealthFactorDelta } from "./HealthFactorDelta";
import { NominatedAddressValue } from "./NominatedAddressValue";
import type { WithdrawCommission } from "./useWithdrawCommission";

const REVIEW_COPY = COPY.withdraw.review;
const SELECT_COPY = COPY.withdraw.select;

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
  /** VP commission at each selected vault's own frozen rate. */
  vpCommission: WithdrawCommission;
  isProcessing: boolean;
  /** Last failed-withdraw message, shown inline under the action (null when none). */
  error: string | null;
  /**
   * Why a hub would reject the withdrawal (null when none): the collateral's
   * hub, or an inactive hub where the user has debt. Blocks the confirm button.
   */
  hubBlockMessage: string | null;
  /** The at-risk acknowledgement, keyed to the displayed projection; see WithdrawFlow. */
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  onConfirm: () => void;
}

export function WithdrawReviewContent({
  totalAmountBtc,
  totalAmountUsd,
  currentHealthFactor,
  projectedHealthFactor,
  payoutAddresses,
  assertTimelockBlocks,
  vpCommission,
  isProcessing,
  error,
  hubBlockMessage,
  acknowledged,
  onAcknowledgedChange,
  onConfirm,
}: WithdrawReviewContentProps) {
  const { defaultFeeRate } = useNetworkFees();

  const { wouldBreachHF, isAtRisk } = getWithdrawHfWarningState(
    projectedHealthFactor,
  );

  const rows: DetailRow[] = useMemo(() => {
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
      vpCommissionRow(vpCommission, totalAmountBtc, totalAmountUsd),
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
    vpCommission,
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

          {/* This banner's data-testid is a real-wallet E2E hook (e2e/real/actions/withdraw.ts) — carry it over if you move or rename the element. */}
          {wouldBreachHF && (
            <Callout
              variant="error"
              title={REVIEW_COPY.hfBlockTitle}
              icon={<WarningIcon color="text-accent-contrast" />}
              data-testid="withdraw-hf-block-warning"
            >
              {REVIEW_COPY.hfBlockWarning(
                WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1),
              )}
            </Callout>
          )}
          {/* This message's data-testid is a real-wallet E2E hook (e2e/real/actions/withdraw.ts) — carry it over if you move or rename the element. */}
          {vpCommission.status === "error" && (
            <Text
              variant="body2"
              className="text-error-main"
              data-testid="withdraw-commission-error"
            >
              {REVIEW_COPY.vpCommissionError}
            </Text>
          )}
          {hubBlockMessage && (
            <Text
              variant="body2"
              className="text-error-main"
              data-testid="withdraw-hub-block-warning"
            >
              {hubBlockMessage}
            </Text>
          )}
          {isAtRisk && (
            <div className="flex flex-col gap-4">
              <Text
                variant="body2"
                className="text-warning-main"
                data-testid="withdraw-hf-at-risk-warning"
              >
                {REVIEW_COPY.hfAtRiskWarning(
                  WITHDRAW_HF_WARNING_THRESHOLD.toFixed(1),
                )}
              </Text>
              <label className="flex w-full cursor-pointer items-center gap-4">
                {/* This control's data-testid is a real-wallet E2E hook
                    (e2e/real/actions/withdraw.ts) — carry it over if you move
                    or rename the element. */}
                <Checkbox
                  checked={acknowledged}
                  onChange={() => onAcknowledgedChange(!acknowledged)}
                  variant="default"
                  showLabel={false}
                  data-testid="withdraw-review-acknowledge"
                />
                <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                  {SELECT_COPY.continueAnyway}
                </span>
              </label>
            </div>
          )}

          {/* This control's data-testid is a real-wallet E2E hook (e2e/real/actions/withdraw.ts) — carry it over if you move or rename the element. */}
          <Button
            variant="contained"
            color="secondary"
            className="w-full"
            disabled={
              isProcessing ||
              vpCommission.status !== "ready" ||
              wouldBreachHF ||
              hubBlockMessage !== null ||
              (isAtRisk && !acknowledged)
            }
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

function vpCommissionRow(
  vpCommission: WithdrawCommission,
  totalAmountBtc: number,
  totalAmountUsd: number,
): DetailRow {
  const label = REVIEW_COPY.vpCommissionLabel;
  if (vpCommission.status === "loading") {
    return { label, value: COPY.common.loading };
  }
  if (vpCommission.status === "error") {
    return { label, value: REVIEW_COPY.vpCommissionUnavailable };
  }
  const commissionBtc = satoshiToBtcNumber(vpCommission.commissionSats);
  const commissionUsd =
    totalAmountBtc > 0 ? totalAmountUsd * (commissionBtc / totalAmountBtc) : 0;
  return {
    label,
    value: formatBtcAmount(commissionBtc),
    secondaryValue: formatUsdValue(commissionUsd),
  };
}
