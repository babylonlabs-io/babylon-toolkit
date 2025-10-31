/**
 * DepositFlow - Collateral deposit flow components
 *
 * Organized following the LoanCard pattern:
 * - Each modal step is a separate component with its own directory
 * - Component-specific hooks are co-located with their components
 * - Clear flow structure: Form → Review → Sign → Success
 */

export { CollateralDepositModal } from "./FormModal";
export { CollateralDepositReviewModal } from "./ReviewModal";
export { CollateralDepositSignModal } from "./SignModal";
export { CollateralDepositSuccessModal } from "./SuccessModal";
