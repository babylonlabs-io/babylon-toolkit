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
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  VAULT_SPLIT_SAFETY_MARGIN,
} from "../applications/aave/constants";
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
    const { CF, LB, THF } = splitParams;

    const seizedFraction = computeSeizedFraction(
      CF,
      LB,
      THF,
      EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
    );
    const minForSplit = computeMinDepositForSplit({
      minPegin: minDepositSats,
      seizedFraction,
      safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
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
      tooltip: COPY.protocolFees.ltv.tooltip,
    });

    rows.push({
      label: COPY.protocolFees.liquidationThreshold.label,
      value: THF.toFixed(2),
      tooltip: COPY.protocolFees.liquidationThreshold.tooltip,
    });

    const bonusPercent = (LB - 1) * PERCENT_SCALE;
    rows.push({
      label: COPY.protocolFees.liquidationBonus.label,
      value: `${bonusPercent.toFixed(0)}%`,
      tooltip: COPY.protocolFees.liquidationBonus.tooltip,
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
