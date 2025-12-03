/**
 * Morpho-specific hooks
 *
 * Hooks for interacting with Morpho lending protocol.
 * All Morpho-related React hooks should be exported from here.
 */

export { useMarkets } from "./useMarkets";
export { useUserPositions } from "./useUserPositions";
export type { UseUserPositionsResult } from "./useUserPositions";

// Re-export types from services for convenience
export type { PositionWithMorphoOptimized } from "../../services/applications/morpho";
