import {
  computeMinDepositForSplit,
  computeSeizedFraction,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useMemo } from "react";

import type { FeeRow } from "@/components/simple/FeesSection";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { formatSatoshisToBtc } from "@/utils/btcConversion";

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

  const minDepositBtc = formatSatoshisToBtc(minDepositSats);
  rows.push({
    label: "Min deposit (MIN_PEGIN)",
    value: `${minDepositBtc} BTC`,
    tooltip:
      "Minimum BTC deposit required to create a vault, set by the protocol.",
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
        label: "Effective minimum for split",
        value: `~${minForSplitBtc} BTC`,
        tooltip:
          "Minimum deposit for a 2-vault split. Both vaults must meet the minimum deposit requirement.",
      });
    }

    rows.push({
      label: "LTV / Collateral Factor",
      value: `${(CF * PERCENT_SCALE).toFixed(0)}%`,
      tooltip:
        "Maximum percentage of collateral value that can be borrowed against.",
    });

    rows.push({
      label: "Liquidation threshold (THF)",
      value: THF.toFixed(2),
      tooltip: "Target health factor at which liquidation becomes profitable.",
    });

    const bonusPercent = (LB - 1) * PERCENT_SCALE;
    rows.push({
      label: "Liquidation Bonus (LB)",
      value: `${bonusPercent.toFixed(0)}%`,
      tooltip: "Bonus percentage awarded to liquidators on seized collateral.",
    });
  }

  return rows;
}

export function useProtocolFeeRows(connectedAddress?: string): {
  rows: FeeRow[];
  isLoading: boolean;
} {
  const { minDeposit } = useProtocolParamsContext();
  const { params, isLoading } = useVaultSplitParams(connectedAddress);

  const rows = useMemo(
    () => buildFeeRows(minDeposit, params),
    [minDeposit, params],
  );

  return { rows, isLoading };
}
