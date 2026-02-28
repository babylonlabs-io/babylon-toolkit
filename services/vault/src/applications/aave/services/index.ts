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
  fetchAaveActivePositionsWithCollaterals,
  fetchAavePositionByDepositor,
  fetchAavePositionCollaterals,
  fetchAavePositionWithCollaterals,
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
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
  type DebtPosition,
  type GetUserPositionsOptions,
} from "./positionService";

// Position transactions
export {
  borrow,
  repay,
  repayFull,
  repayPartial,
  withdrawAllCollateral,
} from "./positionTransactions";
