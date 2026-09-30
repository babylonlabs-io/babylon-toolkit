/**
 * Hub errors a depositor can hit on borrow, repay or withdraw. Neither the
 * adapter nor the Spoke ABI declares them, and the SDK's `AaveHub.abi.json` is
 * kept to the rate read, so the Aave paths list them with the call's own ABIs.
 */
export const HUB_ERROR_ABI = [
  {
    type: "error",
    name: "AddCapExceeded",
    inputs: [{ name: "addCap", type: "uint256" }],
  },
  {
    type: "error",
    name: "DrawCapExceeded",
    inputs: [{ name: "drawCap", type: "uint256" }],
  },
  {
    type: "error",
    name: "InsufficientLiquidity",
    inputs: [{ name: "liquidity", type: "uint256" }],
  },
  { type: "error", name: "SpokeNotActive", inputs: [] },
  { type: "error", name: "SpokeHalted", inputs: [] },
  { type: "error", name: "InvalidPremiumChange", inputs: [] },
] as const;
