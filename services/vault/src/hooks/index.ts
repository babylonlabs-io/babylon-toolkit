/**
 * Custom React hooks for vault operations
 *
 * - Deposit/Peg-in hooks: hooks/deposit/
 * - Redeem hooks: hooks/redeem/ (when implemented)
 *
 */

// Data fetching hooks
export { useVaultActions } from "./deposit/useVaultActions";
export { useActivities } from "./useActivities";
export { useActivitiesWithPending } from "./useActivitiesWithPending";
export { useApplications } from "./useApplications";
export {
  BTC_BALANCE_QUERY_KEY,
  useBTCBalance,
  type UseBTCBalanceResult,
} from "./useBTCBalance";
export { useBtcPublicKey } from "./useBtcPublicKey";
export {
  useLtvCalculations,
  type UseLtvCalculationsResult,
} from "./useLtvCalculations";
export { useNetworkFees } from "./useNetworkFees";
export { useOrdinals } from "./useOrdinals";
export { usePrice, usePrices, type UsePricesResult } from "./usePrices";
export {
  useProtocolParams,
  type UseProtocolParamsResult,
} from "./useProtocolParams";
export {
  STATS_QUERY_KEY,
  useStats,
  type StatsData,
  type UseStatsResult,
} from "./useStats";
export { useTokenPair, type UseTokenPairResult } from "./useTokenPair";
export { UTXOS_QUERY_KEY, useUTXOs } from "./useUTXOs";
export { useVaultDeposits } from "./useVaultDeposits";
export { VAULTS_QUERY_KEY, useVaults } from "./useVaults";
