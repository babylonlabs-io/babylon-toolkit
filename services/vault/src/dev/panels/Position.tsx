/**
 * "Position" god-mode tab (dev / QA only): the Overview dashboard's own
 * health-factor / borrow-capacity summary plus the shared liquidation-cascade
 * simulator and its banner preview. Gated in `../registry.ts` behind the same
 * double flag the old standalone position-notifications section used — see
 * `positionDebugGate` there for why gating the whole tab costs no capability.
 */
import { CascadeSimulator } from "./CascadeSimulator";
import { LoansSummaryOverrideControls } from "./Loans";

export function PositionPanel() {
  return (
    <div className="space-y-4">
      <LoansSummaryOverrideControls />
      <CascadeSimulator />
    </div>
  );
}
