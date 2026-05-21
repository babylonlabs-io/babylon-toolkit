import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";

export interface SigningProgressProps {
  /** Number of signing steps completed */
  completed: number;
  /** Total number of claimers */
  totalClaimers: number;
  /** Current deposit flow step. Optional for standalone use. */
  step?: DepositFlowStep;
  /** Whether we're in a waiting/polling state. Optional for standalone use. */
  isWaiting?: boolean;
}
