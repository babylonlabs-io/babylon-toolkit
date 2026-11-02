/**
 * The charges a new borrow pays on top of the Hub's drawn rate.
 *
 * A borrow reprices the whole position to the risk premium the Spoke computes
 * at that moment. vBTC is a position's only collateral, so that premium is
 * vBTC's `collateralRisk`. It is read from the chain because the indexed value
 * in `useAaveConfig` is not proved on-chain and is not refreshed while the app
 * stays open.
 */

import { useQuery } from "@tanstack/react-query";

import { AaveSpoke } from "../clients";
import { BPS_SCALE } from "../constants";
import { useAaveConfig } from "../context";

import { useInterestFeeBps } from "./useInterestFeeBps";

const QUERY_KEY = "aaveNewBorrowPremiumFraction";
const ONE_MINUTE_MS = 60 * 1000;

export interface NewBorrowAprCharges {
  /** Risk premium as a fraction of drawn interest; null until read or on failure. */
  premiumFraction: number | null;
  /** Adapter interest fee in basis points; null until read or on failure. */
  interestFeeBps: number | null;
}

export function useNewBorrowAprCharges(): NewBorrowAprCharges {
  const { config } = useAaveConfig();
  const spokeAddress = config?.coreSpokeAddress;
  const reserveId = config?.vaultBtcReserveId;

  const interestFeeBps = useInterestFeeBps({ enabled: true });

  const { data, error } = useQuery({
    queryKey: [QUERY_KEY, spokeAddress, reserveId?.toString()],
    queryFn: async () => {
      const vbtcReserve = await AaveSpoke.getReserve(spokeAddress!, reserveId!);
      return vbtcReserve.collateralRisk / BPS_SCALE;
    },
    enabled: !!spokeAddress && reserveId != null,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
  });

  // Same stale-data guard as useAaveBorrowAprs: clear `data` on error.
  return { premiumFraction: error ? null : (data ?? null), interestFeeBps };
}
