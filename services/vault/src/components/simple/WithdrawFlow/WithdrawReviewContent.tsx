import { Button, Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import {
  BPS_SCALE,
  WITHDRAW_HF_BLOCK_THRESHOLD,
  WITHDRAW_HF_WARNING_THRESHOLD,
} from "@/applications/aave/constants";
import { getWithdrawHfWarningState } from "@/applications/aave/utils";
import { type DetailRow } from "@/components/shared";
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
            label: "Health factor",
            value: (
              <HealthFactorDelta
                current={currentHealthFactor}
                projected={projectedHealthFactor}
              />
            ),
          };

    const baseRows: DetailRow[] = [
      {
        label: "Withdrawal amount",
        value: (
          <span>
            {formatBtcAmount(totalAmountBtc)}{" "}
            <span className="text-accent-secondary">
              {formatUsdValue(totalAmountUsd)}
            </span>
          </span>
        ),
      },
      {
        label: "Network fee rate",
        value: defaultFeeRate > 0 ? `${defaultFeeRate} sats/vB` : "Loading...",
      },
      {
        label: "VP commission",
        value:
          minVpCommissionBps > 0 ? (
            <span>
              {formatBtcAmount(vpCommissionBtc)}{" "}
              <span className="text-accent-secondary">
                {formatUsdValue(vpCommissionUsd)}
              </span>
            </span>
          ) : (
            "None"
          ),
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
          Review withdrawal
        </Heading>
      </div>

      <div className="rounded-b-2xl border border-secondary-strokeLight p-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-6"
              >
                <Text variant="body1" className="text-accent-primary">
                  {row.label}
                </Text>
                <div className="flex flex-col items-end text-right text-base text-accent-primary">
                  {row.value}
                </div>
              </div>
            ))}
          </div>

          {wouldBreachHF && (
            <Text
              variant="body2"
              className="text-error-main"
              data-testid="withdraw-hf-block-warning"
            >
              This withdrawal would drop your health factor below{" "}
              {WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1)} and be rejected on-chain.
              Reduce the selection or repay debt first.
            </Text>
          )}
          {isAtRisk && (
            <Text
              variant="body2"
              className="text-warning-main"
              data-testid="withdraw-hf-at-risk-warning"
            >
              Your position will be at risk of liquidation after this withdrawal
              (health factor below {WITHDRAW_HF_WARNING_THRESHOLD.toFixed(1)}).
              Consider withdrawing less or repaying debt.
            </Text>
          )}

          <Button
            variant="contained"
            color="secondary"
            className="w-full"
            disabled={isProcessing || wouldBreachHF}
            onClick={onConfirm}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <Text
                  as="span"
                  variant="body2"
                  className="text-accent-contrast"
                >
                  Processing
                </Text>
              </span>
            ) : (
              "Confirm"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
