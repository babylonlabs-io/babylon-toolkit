/**
 * The loan reserves the address currently owes on, frozen or paused ones
 * included. Read from the same position query the loan screens use (React
 * Query dedupes it); empty while the position is loading or absent.
 */

import { useMemo } from "react";

import { useAaveConfig } from "../context";
import type { AaveReserveConfig } from "../services/fetchConfig";

import { useAaveUserPosition } from "./useAaveUserPosition";

export function useDebtReserves(
  address: string | undefined,
): AaveReserveConfig[] {
  const { allBorrowReserves } = useAaveConfig();
  const { position } = useAaveUserPosition(address);
  return useMemo(
    () =>
      allBorrowReserves.filter((r) =>
        position?.debtPositions?.has(r.reserveId),
      ),
    [allBorrowReserves, position],
  );
}
