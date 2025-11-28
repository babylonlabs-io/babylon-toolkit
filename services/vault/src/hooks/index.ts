/**
 * Custom React hooks for vault operations
 *
 * - Deposit/Peg-in hooks: hooks/deposit/
 * - Redeem hooks: hooks/redeem/ (when implemented)
 *
 */

// Data fetching hooks
export { useApplications } from "./useApplications";
export { useBTCBalance } from "./useBTCBalance";
export type { UseBTCBalanceResult } from "./useBTCBalance";
export { useBTCPrice } from "./useBTCPrice";
export { useBtcPublicKey } from "./useBtcPublicKey";
export { useMarkets } from "./useMarkets";
export { useNetworkFees } from "./useNetworkFees";
export { useSinglePosition } from "./useSinglePosition";
export { useTokenPair } from "./useTokenPair";
export type { UseTokenPairResult } from "./useTokenPair";
export { useUserPositions } from "./useUserPositions";
export type { UseUserPositionsResult } from "./useUserPositions";
export { useUTXOs } from "./useUTXOs";
export { useVaultActivityActions } from "./useVaultActivityActions";
export { useVaultDeposits } from "./useVaultDeposits";
export { VAULTS_QUERY_KEY, useVaults } from "./useVaults";

// Calculation hooks
export { useLtvCalculations } from "./useLtvCalculations";
export type { UseLtvCalculationsResult } from "./useLtvCalculations";
