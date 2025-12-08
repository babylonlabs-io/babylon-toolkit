// GraphQL market data fetching
export {
  fetchMorphoMarketById,
  fetchMorphoMarkets,
  type MorphoMarket,
  type MorphoMarketsResponse,
  type MorphoToken,
} from "./fetchMarkets";

// GraphQL position data fetching
export {
  fetchMorphoActivePositions,
  fetchMorphoPositionCollaterals,
  fetchMorphoPositionWithCollaterals,
  fetchMorphoUserPositions,
  type MorphoPositionCollateralItem,
  type MorphoPositionFromIndexer,
  type MorphoPositionStatus,
  type MorphoUserPositionsResponse,
} from "./fetchPositions";

// Position service - hybrid indexer + RPC approach
export {
  getUserPositionForMarket,
  getUserPositionsOptimized,
  type PositionWithMorphoOptimized,
} from "./positionService";

// Position transactions (borrow, repay, withdraw)
export {
  addCollateralWithMarketId,
  approveLoanTokenForRepay,
  borrowMoreFromPosition,
  repayDebtFull,
  repayDebtPartial,
  withdrawAllCollateralFromPosition,
  type AddCollateralResult,
} from "./positionTransactions";

// Market operations (cached params + on-chain data)
export {
  clearMarketParamsCache,
  getBasicMarketParams,
  getMarketData,
  getUserMarketPosition,
  validateMarket,
  type BasicMarketParams,
  type MarketWithValidation,
  type MarketsWithValidationResult,
  type MorphoMarketSummary,
  type MorphoUserPosition,
} from "./marketContract";
