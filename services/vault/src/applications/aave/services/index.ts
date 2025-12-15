// GraphQL: Aave config
export {
  fetchAaveAppConfig,
  fetchAaveConfig,
  type AaveAppConfig,
  type AaveConfig,
  type AaveReserveConfig,
} from "./fetchConfig";

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
  fetchAaveActivePositionsWithCollaterals,
  fetchAavePositionById,
  fetchAavePositionCollaterals,
  fetchAavePositionWithCollaterals,
  fetchAaveUserPositions,
  type AavePosition,
  type AavePositionCollateral,
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
  getCoreSpokeAddress,
  getReserveById,
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
