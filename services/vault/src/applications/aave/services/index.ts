// GraphQL: Aave config
export { fetchAaveConfig, type AaveConfig } from "./fetchConfig";

// GraphQL: Reserves
export {
  fetchAaveReserveById,
  fetchAllAaveReserves,
  fetchBorrowableAaveReserves,
  type AaveReserve,
} from "./fetchReserves";

// GraphQL: Positions
export {
  fetchAaveActivePositions,
  fetchAavePositionById,
  fetchAavePositionCollaterals,
  fetchAavePositionWithCollaterals,
  fetchAaveUserPositions,
  type AavePosition,
  type AavePositionCollateral,
  type AavePositionStatus,
  type AavePositionWithCollaterals,
} from "./fetchPositions";

// GraphQL: Vault status
export {
  fetchAaveVaultStatus,
  fetchAaveVaultStatuses,
  filterAvailableVaults,
  isVaultAvailableForAave,
  type AaveVaultStatus,
  type AaveVaultUsageStatus,
} from "./fetchVaultStatus";

// Position service (hybrid indexer + RPC)
export {
  canWithdrawCollateral,
  getPositionWithLiveData,
  getUserPositionForReserve,
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
} from "./positionService";

// Reserve service
export {
  getAvailableReserves,
  getBorrowableReserves,
  getCoreSpokeAddress,
  getReserveById,
  getVbtcReserve,
  getVbtcReserveId,
  type AaveReserveWithMetadata,
} from "./reserveService";

// Position transactions
export {
  addCollateral,
  approveForRepay,
  borrow,
  canWithdraw,
  redeemVault,
  repay,
  withdrawAllCollateral,
  type AddCollateralResult,
} from "./positionTransactions";
