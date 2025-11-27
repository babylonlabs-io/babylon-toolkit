// GraphQL market data fetching
export {
  fetchMorphoMarketById,
  fetchMorphoMarkets,
  type MorphoMarket,
  type MorphoMarketsResponse,
  type MorphoToken,
} from "./fetchMarkets";

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
