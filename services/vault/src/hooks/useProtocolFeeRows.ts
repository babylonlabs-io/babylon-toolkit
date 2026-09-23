import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  BPS_SCALE,
  computeMinDepositForSplit,
  computeSeizedFraction,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import type { FeeRow } from "@/components/simple/FeesSection";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { formatBasisPointsAsPercent, getBtcSymbol } from "@/utils/formatting";

import {
  useVaultSplitParams,
  type VaultSplitParams,
} from "../applications/aave/hooks/useVaultSplitParams";

function buildFeeRows(
  minDepositSats: bigint,
  splitParams: VaultSplitParams | null,
): FeeRow[] {
  const rows: FeeRow[] = [];
  const btcSymbol = getBtcSymbol();

  const minDepositBtc = formatSatoshisToBtc(minDepositSats);
  rows.push({
    label: COPY.protocolFees.minDeposit.label,
    value: `${minDepositBtc} ${btcSymbol}`,
    tooltip: COPY.protocolFees.minDeposit.tooltip,
  });

  if (splitParams) {
    const { CF, LB, THF, expectedHF, maxLB } = splitParams;

    // Only this row is sized from the bonus at the expected health factor.
    // When the Spoke's curve is out of range there is no figure to show, so
    // it is omitted rather than rendered from a substitute — but the rows
    // below do not read `LB` and must survive, which is the whole reason the
    // bonus is nullable instead of throwing.
    if (LB !== null) {
      const seizedFraction = computeSeizedFraction(CF, LB, THF, expectedHF);
      const minForSplit = computeMinDepositForSplit({
        minPegin: minDepositSats,
        seizedFraction,
      });

      if (minForSplit > 0n) {
        const minForSplitBtc = formatSatoshisToBtc(minForSplit);
        rows.push({
          label: COPY.protocolFees.minForSplit.label,
          value: `${minForSplitBtc} ${btcSymbol}`,
          tooltip: COPY.protocolFees.minForSplit.tooltip,
        });
      }
    }

    rows.push({
      label: COPY.protocolFees.ltv.label,
      // Both percentages keep their basis-point precision: a collateral
      // factor of 7825 BPS is 78.25%, and the dashboard renders it that way
      // from the same contract field.
      value: formatBasisPointsAsPercent(CF * BPS_SCALE),
      tooltip: COPY.tooltips.collateralFactor,
    });

    rows.push({
      label: COPY.protocolFees.splitTargetHealthFactor.label,
      value: THF.toFixed(2),
      tooltip: COPY.protocolFees.splitTargetHealthFactor.tooltip,
    });

    rows.push({
      label: COPY.protocolFees.maxLiquidationPenalty.label,
      value: formatBasisPointsAsPercent((maxLB - 1) * BPS_SCALE),
      tooltip: COPY.protocolFees.maxLiquidationPenalty.tooltip,
    });
  }

  return rows;
}

export function useProtocolFeeRows(connectedAddress?: string): {
  rows: FeeRow[];
  isLoading: boolean;
  collateralFactor: number | null;
} {
  const { minDeposit } = useProtocolParamsContext();
  const { params, isLoading } = useVaultSplitParams(connectedAddress);

  const rows = useMemo(
    () => buildFeeRows(minDeposit, params),
    [minDeposit, params],
  );

  return { rows, isLoading, collateralFactor: params?.CF ?? null };
}
