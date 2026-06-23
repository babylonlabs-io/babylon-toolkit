/**
 * Reserve Detail Modal Context
 *
 * Holds, in memory only, which reserve (token symbol) + mode (borrow/repay) the
 * borrow/repay full-screen flow is showing, or null when closed. Replaces the
 * former deep-linkable `/app/aave/reserve/:reserveId/{borrow,repay}` route: the
 * flow is now a modal, like deposit. Deliberately not persisted — a refresh
 * closes it and returns to the dashboard.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { LoanTab } from "../constants";

export interface ActiveReserve {
  /** Token symbol (lowercased), e.g. "usdc". NOT the Aave bigint reserveId. */
  reserveSymbol: string;
  tab: LoanTab;
}

interface ReserveDetailModalContextValue {
  activeReserve: ActiveReserve | null;
  openReserveDetail: (reserveSymbol: string, tab: LoanTab) => void;
  closeReserveDetail: () => void;
}

const ReserveDetailModalContext =
  createContext<ReserveDetailModalContextValue | null>(null);

export function ReserveDetailModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeReserve, setActiveReserve] = useState<ActiveReserve | null>(
    null,
  );

  const openReserveDetail = useCallback(
    (reserveSymbol: string, tab: LoanTab) => {
      setActiveReserve({ reserveSymbol: reserveSymbol.toLowerCase(), tab });
    },
    [],
  );

  const closeReserveDetail = useCallback(() => setActiveReserve(null), []);

  const value = useMemo(
    () => ({ activeReserve, openReserveDetail, closeReserveDetail }),
    [activeReserve, openReserveDetail, closeReserveDetail],
  );

  return (
    <ReserveDetailModalContext.Provider value={value}>
      {children}
    </ReserveDetailModalContext.Provider>
  );
}

export function useReserveDetailModal(): ReserveDetailModalContextValue {
  const ctx = useContext(ReserveDetailModalContext);
  if (!ctx) {
    throw new Error(
      "useReserveDetailModal must be used within a ReserveDetailModalProvider",
    );
  }
  return ctx;
}
