/**
 * Position State Machine
 *
 * Centralized definition of lending position types and available actions.
 * This acts as the single source of truth for:
 * - Position types (based on collateral and debt)
 * - Available user actions (repay, borrow more, withdraw)
 * - Action validation (LTV checks, liquidation checks)
 *
 * A position is created when vaults are locked as collateral in a Morpho lending market.
 * This is separate from the peg-in state machine (which tracks vault deposits).
 */

// ============================================================================
// State Definitions
// ============================================================================

/**
 * Position type based on collateral and debt
 */
export enum PositionType {
  /** Active borrowing position (debt > 0, collateral > 0) */
  ACTIVE_BORROWING = "ACTIVE_BORROWING",
  /** Collateral only, no debt (debt = 0, collateral > 0) */
  COLLATERAL_ONLY = "COLLATERAL_ONLY",
  /** Liquidated position (collateral = 0, debt > 0) */
  LIQUIDATED = "LIQUIDATED",
  /** Empty position (should not exist in practice) */
  EMPTY = "EMPTY",
}

/**
 * Available actions user can take on a position
 */
export enum PositionAction {
  /** Repay debt (reduce or eliminate borrowed amount) */
  REPAY = "REPAY",
  /** Borrow more against existing collateral */
  BORROW_MORE = "BORROW_MORE",
  /** Withdraw collateral (only when debt = 0) */
  WITHDRAW = "WITHDRAW",
}

// ============================================================================
// State Machine Logic
// ============================================================================

/**
 * Parameters for determining position type and actions
 */
export interface PositionParams {
  /** Collateral amount in token's smallest unit (e.g., wei for ETH, satoshis for BTC) */
  collateral: bigint;
  /** Debt amount in token's smallest unit */
  debt: bigint;
  /** Current LTV ratio (0-1 scale, e.g., 0.85 = 85%) - optional, used for validation */
  currentLTV?: number;
  /** Liquidation LTV threshold (0-1 scale, e.g., 0.86 = 86%) - optional, used for validation */
  liquidationLTV?: number;
}

/**
 * Get position type based on collateral and debt
 *
 * @param params - Position parameters
 * @returns Position type
 */
export function getPositionType(params: PositionParams): PositionType {
  const { collateral, debt } = params;

  // Liquidated: No collateral but has debt
  if (collateral === 0n && debt > 0n) {
    return PositionType.LIQUIDATED;
  }

  // Collateral only: Has collateral but no debt
  if (debt === 0n && collateral > 0n) {
    return PositionType.COLLATERAL_ONLY;
  }

  // Empty: No collateral and no debt
  if (collateral === 0n && debt === 0n) {
    return PositionType.EMPTY;
  }

  // Active borrowing: Has both collateral and debt
  return PositionType.ACTIVE_BORROWING;
}

/**
 * Get available actions for a position
 *
 * @param params - Position parameters
 * @returns Array of available actions
 */
export function getAvailableActions(params: PositionParams): PositionAction[] {
  const positionType = getPositionType(params);

  // Liquidated positions: no actions
  if (positionType === PositionType.LIQUIDATED) {
    return [];
  }

  // Collateral-only positions: can only withdraw
  if (positionType === PositionType.COLLATERAL_ONLY) {
    return [PositionAction.WITHDRAW];
  }

  // Empty positions: no actions
  if (positionType === PositionType.EMPTY) {
    return [];
  }

  // Active borrowing positions: check LTV for available actions
  const { currentLTV, liquidationLTV } = params;

  // If LTV data not available, allow all actions
  if (currentLTV === undefined || liquidationLTV === undefined) {
    return [PositionAction.REPAY, PositionAction.BORROW_MORE];
  }

  // Underwater (LTV >= liquidation): no actions allowed
  if (currentLTV >= liquidationLTV) {
    return [];
  }

  // At risk (LTV >= 90% of liquidation): only repay
  const warningLTV = liquidationLTV * 0.9;
  if (currentLTV >= warningLTV) {
    return [PositionAction.REPAY];
  }

  // Healthy: can repay or borrow more
  return [PositionAction.REPAY, PositionAction.BORROW_MORE];
}

/**
 * Check if a specific action is available
 */
export function canPerformAction(
  params: PositionParams,
  action: PositionAction,
): boolean {
  const availableActions = getAvailableActions(params);
  return availableActions.includes(action);
}

/**
 * Get action buttons configuration for UI
 *
 * Returns an array of button configs in priority order.
 */
export function getActionButtons(params: PositionParams): Array<{
  label: string;
  action: PositionAction;
  variant: "primary" | "secondary";
}> {
  const availableActions = getAvailableActions(params);
  const buttons: Array<{
    label: string;
    action: PositionAction;
    variant: "primary" | "secondary";
  }> = [];

  // Repay button (secondary unless at risk)
  if (availableActions.includes(PositionAction.REPAY)) {
    const isAtRisk =
      params.currentLTV !== undefined &&
      params.liquidationLTV !== undefined &&
      params.currentLTV >= params.liquidationLTV * 0.9;
    buttons.push({
      label: "Repay",
      action: PositionAction.REPAY,
      variant: isAtRisk ? "primary" : "secondary",
    });
  }

  // Borrow more button (primary)
  if (availableActions.includes(PositionAction.BORROW_MORE)) {
    buttons.push({
      label: "Borrow More",
      action: PositionAction.BORROW_MORE,
      variant: "primary",
    });
  }

  // Withdraw button (primary)
  if (availableActions.includes(PositionAction.WITHDRAW)) {
    buttons.push({
      label: "Withdraw",
      action: PositionAction.WITHDRAW,
      variant: "primary",
    });
  }

  return buttons;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validation: Check if position can be repaid
 *
 * @throws Error with user-friendly message if repayment is not allowed
 */
export function validateRepayAction(params: PositionParams): void {
  const positionType = getPositionType(params);

  if (positionType === PositionType.LIQUIDATED) {
    throw new Error(
      "Position has been liquidated. All collateral has been seized to cover the debt.",
    );
  }

  if (!canPerformAction(params, PositionAction.REPAY)) {
    // Check if underwater
    if (
      params.currentLTV !== undefined &&
      params.liquidationLTV !== undefined
    ) {
      if (params.currentLTV >= params.liquidationLTV) {
        throw new Error(
          "Cannot repay: Position is underwater (LTV exceeds liquidation threshold). " +
            "The position may be in the process of liquidation.",
        );
      }
    }
    throw new Error("Repayment is not available for this position.");
  }
}

/**
 * Validation: Check if position can borrow more
 *
 * @throws Error with user-friendly message if borrowing is not allowed
 */
export function validateBorrowMoreAction(params: PositionParams): void {
  const positionType = getPositionType(params);

  if (positionType === PositionType.LIQUIDATED) {
    throw new Error("Cannot borrow: Position has been liquidated.");
  }

  if (!canPerformAction(params, PositionAction.BORROW_MORE)) {
    // Check specific failure reasons
    if (
      params.currentLTV !== undefined &&
      params.liquidationLTV !== undefined
    ) {
      if (params.currentLTV >= params.liquidationLTV) {
        throw new Error(
          "Cannot borrow more: Position is underwater (LTV exceeds liquidation threshold).",
        );
      }
      if (params.currentLTV >= params.liquidationLTV * 0.9) {
        throw new Error(
          "Cannot borrow more: Position is at risk of liquidation. Please repay debt first.",
        );
      }
    }
    throw new Error("Borrowing more is not available for this position.");
  }
}

/**
 * Validation: Check if position can withdraw collateral
 *
 * @throws Error with user-friendly message if withdrawal is not allowed
 */
export function validateWithdrawAction(params: PositionParams): void {
  const positionType = getPositionType(params);

  if (positionType !== PositionType.COLLATERAL_ONLY) {
    throw new Error(
      "Cannot withdraw: Position has outstanding debt. Please repay all debt before withdrawing collateral.",
    );
  }

  if (!canPerformAction(params, PositionAction.WITHDRAW)) {
    throw new Error("Withdrawal is not available for this position.");
  }
}
