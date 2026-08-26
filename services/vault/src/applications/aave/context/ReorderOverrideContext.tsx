/**
 * Reorder Override Context
 *
 * Holds, in memory only, the vault ordering the user just submitted in a reorder
 * (captured after the tx confirms — at which point the submitted order is the
 * on-chain order). The dashboard sorts the collateral list by this order so the
 * user sees the new order immediately, instead of waiting for the indexer to
 * ingest the `VaultsReordered` event and rewrite `liquidationIndex`.
 *
 * Deliberately NOT persisted (no localStorage): it is best-effort immediate
 * feedback. A page refresh mid-window drops it and the dashboard falls back to
 * indexer ordering. The override is cleared once the indexer reconciles (see
 * useDashboardState) or, as a backstop, after REORDER_OVERRIDE_TIMEOUT_MS.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Hex } from "viem";

/**
 * How long the in-memory post-reorder order override is held before it is
 * auto-cleared, as a backstop in case the indexer never reflects the submitted
 * order (e.g. a concurrent position change). Until then the dashboard shows the
 * submitted order; reconciliation normally clears it sooner, once the indexer
 * catches up. 90s ≈ 3 × the 30s position poll.
 */
const REORDER_OVERRIDE_TIMEOUT_MS = 90 * 1000;

interface ReorderOverrideContextValue {
  /**
   * The submitted (post-confirmation) vault ordering to display while the
   * indexer catches up, or `null` when there is no pending reorder to reflect.
   */
  reorderedOrder: readonly Hex[] | null;
  /** Set the override to the submitted order and (re)arm the auto-clear timer. */
  applyReorderedOrder: (order: readonly Hex[]) => void;
  /** Clear the override (called when the indexer reconciles, or on unmount). */
  clearReorderedOrder: () => void;
}

const ReorderOverrideContext =
  createContext<ReorderOverrideContextValue | null>(null);

export function ReorderOverrideProvider({ children }: { children: ReactNode }) {
  const [reorderedOrder, setReorderedOrder] = useState<readonly Hex[] | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const clearReorderedOrder = useCallback(() => {
    clearTimer();
    setReorderedOrder(null);
  }, [clearTimer]);

  const applyReorderedOrder = useCallback(
    (order: readonly Hex[]) => {
      clearTimer();
      setReorderedOrder(order);
      timerRef.current = setTimeout(() => {
        setReorderedOrder(null);
        timerRef.current = undefined;
      }, REORDER_OVERRIDE_TIMEOUT_MS);
    },
    [clearTimer],
  );

  // Clean up the timer if the provider unmounts mid-window.
  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(
    () => ({ reorderedOrder, applyReorderedOrder, clearReorderedOrder }),
    [reorderedOrder, applyReorderedOrder, clearReorderedOrder],
  );

  return (
    <ReorderOverrideContext.Provider value={value}>
      {children}
    </ReorderOverrideContext.Provider>
  );
}

/**
 * Access the reorder override context. Must be used within a
 * ReorderOverrideProvider.
 */
export function useReorderOverride(): ReorderOverrideContextValue {
  const ctx = useContext(ReorderOverrideContext);
  if (!ctx) {
    throw new Error(
      "useReorderOverride must be used within a ReorderOverrideProvider",
    );
  }
  return ctx;
}
