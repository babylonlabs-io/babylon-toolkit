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

import {
  DEBUG_HEALTH_FACTORS,
  type DebugBorrowCapacityState,
  setDebugBorrowCapacityStateOverride,
  setDebugHealthFactorOverride,
  useDebugBorrowCapacity,
  useDebugBorrowCapacityStateOverride,
  useDebugHealthFactorOverride,
} from "../debugPositionStore";
import { PANEL_SECTION_TITLE_CLASS } from "../panelChrome";

import { SegmentButton } from "./segmentButton";

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

  useEffect(() => {
    setHealthFactorOverride(healthFactorOverride);
  }, [healthFactorOverride]);

  useEffect(() => {
    setBorrowCapacityOverride(resolvedBorrowCapacity);
  }, [resolvedBorrowCapacity]);

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
    </div>
  );
}

export function LoansPanel() {
  return <LoansSummaryOverrideControls />;
}
