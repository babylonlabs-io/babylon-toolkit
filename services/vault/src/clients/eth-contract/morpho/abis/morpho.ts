/**
 * Morpho Blue Contract ABIs
 *
 * Minimal ABIs for interacting with the Morpho Blue protocol.
 * We only include the functions we actually use to keep bundle size small.
 */

/**
 * ABI for idToMarketParams function
 * Returns the market parameters for a given market ID
 */
export const ID_TO_MARKET_PARAMS_ABI = [
  {
    type: "function",
    name: "idToMarketParams",
    inputs: [{ name: "id", type: "bytes32", internalType: "Id" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct MarketParams",
        components: [
          { name: "loanToken", type: "address", internalType: "address" },
          { name: "collateralToken", type: "address", internalType: "address" },
          { name: "oracle", type: "address", internalType: "address" },
          { name: "irm", type: "address", internalType: "address" },
          { name: "lltv", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

/**
 * ABI for market function
 * Returns the market state (supply, borrow, fees, etc.)
 *
 * Note: We only use totalSupplyAssets and totalBorrowAssets,
 * but must include all fields in the ABI to match the contract struct.
 */
export const MARKET_ABI = [
  {
    type: "function",
    name: "market",
    inputs: [{ name: "id", type: "bytes32", internalType: "Id" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Market",
        components: [
          {
            name: "totalSupplyAssets",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "totalSupplyShares",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "totalBorrowAssets",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "totalBorrowShares",
            type: "uint128",
            internalType: "uint128",
          },
          { name: "lastUpdate", type: "uint128", internalType: "uint128" },
          { name: "fee", type: "uint128", internalType: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

/**
 * ABI for position function
 * Returns a user's position in a specific market (supply shares, borrow shares, collateral)
 */
export const POSITION_ABI = [
  {
    type: "function",
    name: "position",
    inputs: [
      { name: "id", type: "bytes32", internalType: "Id" },
      { name: "user", type: "address", internalType: "address" },
    ],
    outputs: [
      { name: "supplyShares", type: "uint256", internalType: "uint256" },
      { name: "borrowShares", type: "uint128", internalType: "uint128" },
      { name: "collateral", type: "uint128", internalType: "uint128" },
    ],
    stateMutability: "view",
  },
] as const;
