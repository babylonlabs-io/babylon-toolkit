/**
 * Custom React hooks for vault operations
 *
 * Note: Component-specific hooks have been moved to live next to their components.
 * This directory now only contains truly shared/reusable hooks.
 */

export { useDepositFlow } from "./useDepositFlow";
export type {
  UseDepositFlowParams,
  UseDepositFlowReturn,
} from "./useDepositFlow";
export { useMarkets } from "./useMarkets";
export type { UseMarketsResult } from "./useMarkets";
export { usePeginRequests } from "./usePeginRequests";
export type { UsePeginRequestsResult } from "./usePeginRequests";
export { useVaults, useVault } from "./useVaults";
export type { UseVaultsResult, UseVaultResult } from "./useVaults";
export { useVaultPositions } from "./useVaultPositions";
export { useMarketDetailData } from "./useMarketDetailData";
export type { UseMarketDetailDataResult } from "./useMarketDetailData";
export { useBTCBalance } from "./useBTCBalance";
export type { UseBTCBalanceResult } from "./useBTCBalance";
export { useBTCPrice } from "./useBTCPrice";
export type { UseBTCPriceResult } from "./useBTCPrice";
export { useUserMarketPosition } from "./useUserMarketPosition";
export type { UseUserMarketPositionResult } from "./useUserMarketPosition";
