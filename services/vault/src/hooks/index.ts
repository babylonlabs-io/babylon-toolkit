/**
 * Custom React hooks for vault operations
 *
 * - Deposit/Peg-in hooks: hooks/deposit/
 * - Redeem hooks: hooks/redeem/ (when implemented)
 *
 */

// Data fetching hooks
export {
  useMarkets,
  useUserPositions,
  type PositionWithMorphoOptimized,
  type UseUserPositionsResult,
} from "../applications/morpho/hooks";
export { useVaultActions } from "./deposit/useVaultActions";
export { useApplications } from "./useApplications";
export { useBTCBalance, type UseBTCBalanceResult } from "./useBTCBalance";
export { useBTCPrice } from "./useBTCPrice";
export { useBtcPublicKey } from "./useBtcPublicKey";
export {
  useLtvCalculations,
  type UseLtvCalculationsResult,
} from "./useLtvCalculations";
export { useNetworkFees } from "./useNetworkFees";
export { useTokenPair, type UseTokenPairResult } from "./useTokenPair";
export { useUTXOs } from "./useUTXOs";
export { useVaultDeposits } from "./useVaultDeposits";
export { VAULTS_QUERY_KEY, useVaults } from "./useVaults";
