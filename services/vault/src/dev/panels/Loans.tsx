/**
 * "Loans" god-mode tab (dev / QA only): the v3 /loans summary overrides — a
 * health factor in each production band, and the borrow-capacity cards while
 * their read is loading or has failed. The row list itself is driven by
 * "Loan" mocks on the Deposit & Vaults tab.
 *
 * `LoansSummaryOverrideControls` also renders on the Position tab: the
 * health-factor override feeds the Overview dashboard's own health-factor
 * display (`DashboardPage.tsx`), not just this page, so both surfaces share
 * one control instead of two independent stores.
 */
import { useEffect } from "react";

import {
  setBorrowCapacityOverride,
  setHealthFactorOverride,
} from "@/overrides/borrowCapacity";
import { setBorrowReserveLimitOverride } from "@/overrides/borrowReserveLimit";

import {
  DEBUG_HEALTH_FACTORS,
  type DebugBorrowCapacityState,
  setDebugBorrowCapacityStateOverride,
  setDebugBorrowReserveLimitOverride,
  setDebugHealthFactorOverride,
  useDebugBorrowCapacity,
  useDebugBorrowCapacityStateOverride,
  useDebugBorrowReserveLimitOverride,
  useDebugHealthFactorOverride,
} from "../debugPositionStore";
import { PANEL_SECTION_TITLE_CLASS } from "../panelChrome";

import { SegmentButton } from "./segmentButton";

/** Caps the panel offers: the launch value, and one above it to prove the
 *  surfaces read the number rather than assuming 1. */
const DEBUG_BORROW_RESERVE_LIMITS = [1, 2] as const;

const BORROW_CAPACITY_LABELS: Record<DebugBorrowCapacityState, string> = {
  loading: "Loading",
  error: "Error",
};

export function LoansSummaryOverrideControls() {
  const healthFactorOverride = useDebugHealthFactorOverride();
  const borrowCapacityOverride = useDebugBorrowCapacityStateOverride();
  // Resolved {loading, error} | null snapshot — see debugPositionStore's
  // DEBUG_BORROW_CAPACITY_SNAPSHOTS for why the Error stays dev-only there.
  const resolvedBorrowCapacity = useDebugBorrowCapacity();
  const borrowReserveLimitOverride = useDebugBorrowReserveLimitOverride();

  useEffect(() => {
    setHealthFactorOverride(healthFactorOverride);
  }, [healthFactorOverride]);

  useEffect(() => {
    setBorrowCapacityOverride(resolvedBorrowCapacity);
  }, [resolvedBorrowCapacity]);

  useEffect(() => {
    setBorrowReserveLimitOverride(borrowReserveLimitOverride);
  }, [borrowReserveLimitOverride]);

  return (
    <div className="space-y-2">
      <div className={PANEL_SECTION_TITLE_CLASS}>Loans summary</div>

      <div className="space-y-1">
        <div className="text-xs text-zinc-400">Health factor</div>
        <div className="flex gap-2">
          <SegmentButton
            label="Live"
            active={healthFactorOverride === null}
            onClick={() => setDebugHealthFactorOverride(null)}
          />
          {DEBUG_HEALTH_FACTORS.map(({ value, label }) => (
            <SegmentButton
              key={label}
              label={`${label} (${value})`}
              active={healthFactorOverride === value}
              onClick={() => setDebugHealthFactorOverride(value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-zinc-400">Borrow capacity</div>
        <div className="flex gap-2">
          <SegmentButton
            label="Live"
            active={borrowCapacityOverride === null}
            onClick={() => setDebugBorrowCapacityStateOverride(null)}
          />
          {(
            Object.keys(BORROW_CAPACITY_LABELS) as DebugBorrowCapacityState[]
          ).map((state) => (
            <SegmentButton
              key={state}
              label={BORROW_CAPACITY_LABELS[state]}
              active={borrowCapacityOverride === state}
              onClick={() => setDebugBorrowCapacityStateOverride(state)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-zinc-400">Borrow assets per position</div>
        <div className="flex gap-2">
          <SegmentButton
            label="Live"
            active={borrowReserveLimitOverride === null}
            onClick={() => setDebugBorrowReserveLimitOverride(null)}
          />
          {DEBUG_BORROW_RESERVE_LIMITS.map((limit) => (
            <SegmentButton
              key={limit}
              label={String(limit)}
              active={borrowReserveLimitOverride === limit}
              onClick={() => setDebugBorrowReserveLimitOverride(limit)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoansPanel() {
  return <LoansSummaryOverrideControls />;
}
