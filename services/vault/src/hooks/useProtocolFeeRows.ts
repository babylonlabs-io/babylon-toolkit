import { formatSatoshisToBtc } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  computeMinDepositForSplit,
  computeSeizedFraction,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import type { FeeRow } from "@/components/simple/FeesSection";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { getBtcSymbol } from "@/utils/formatting";

import {
  useVaultSplitParams,
  type VaultSplitParams,
} from "../applications/aave/hooks/useVaultSplitParams";

const PERCENT_SCALE = 100;

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

    rows.push({
      label: COPY.protocolFees.ltv.label,
      value: `${(CF * PERCENT_SCALE).toFixed(0)}%`,
      tooltip: COPY.tooltips.collateralFactor,
    });

    rows.push({
      label: COPY.protocolFees.splitTargetHealthFactor.label,
      value: THF.toFixed(2),
      tooltip: COPY.protocolFees.splitTargetHealthFactor.tooltip,
    });

    const bonusPercent = (maxLB - 1) * PERCENT_SCALE;
    rows.push({
      label: COPY.protocolFees.maxLiquidationPenalty.label,
      value: `${bonusPercent.toFixed(0)}%`,
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
