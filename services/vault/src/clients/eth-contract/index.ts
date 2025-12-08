// ETH smart contract client - re-exports for all contract modules

// Shared client
export { ethClient } from "./client";

// BTC Vaults Manager
export * as BTCVaultsManagerTx from "./btc-vaults-manager/transaction";

// Chainlink Oracle (for independent BTC/USD price)
export * as ChainlinkOracle from "./chainlink";
export type { ChainlinkRoundData } from "./chainlink";

// ERC20
export * as ERC20 from "./erc20";

// Morpho clients - re-exported from morpho application for backward compatibility
export {
  Morpho,
  MorphoController,
  MorphoControllerTx,
  type MarketParams,
  type MarketPosition,
  type MorphoMarketSummary,
  type MorphoUserPosition,
} from "../../applications/morpho/clients";
