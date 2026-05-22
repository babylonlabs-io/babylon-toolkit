// GraphQL: Aave config
export {
  fetchAaveAppConfig,
  type AaveAppConfig,
  type AaveConfig,
  type AaveReserveConfig,
} from "./fetchConfig";

// GraphQL: Positions
export {
  type AavePosition,
  type AavePositionCollateral,
  type AavePositionWithCollaterals,
} from "./fetchPositions";

// Position service (hybrid indexer + RPC)
export {
  getUserPositionsWithLiveData,
  type AavePositionWithLiveData,
  type DebtPosition,
  type GetUserPositionsOptions,
} from "./positionService";

// Position transactions
export {
  borrow,
  reorderVaultOrder,
  repayFull,
  repayMaxCapped,
  repayPartial,
  withdrawSelectedCollateral,
} from "./positionTransactions";

// On-chain integrity guards
export {
  PositionChangedError,
  assertReorderBaseline,
  assertReorderMembership,
  assertSuggestedOrderMatchesOnChain,
  type ReorderVerificationContext,
} from "./assertReorderMatchesOnChain";
export {
  ReserveMismatchError,
  assertReserveMatchesOnChain,
} from "./assertReserveMatchesOnChain";
