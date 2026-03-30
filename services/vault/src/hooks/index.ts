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
export { useBtcPublicKey } from "./useBtcPublicKey";
export {
  ERC20_BALANCE_QUERY_KEY,
  useERC20Balance,
  type UseERC20BalanceResult,
} from "./useERC20Balance";
export { toIdentity, useLogos, type UseLogosResult } from "./useLogos";
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
export { UTXOS_QUERY_KEY, useUTXOs } from "./useUTXOs";
export { useVaultDeposits } from "./useVaultDeposits";
export { VAULTS_QUERY_KEY, useVaults } from "./useVaults";
export { useWithLogos } from "./useWithLogos";
