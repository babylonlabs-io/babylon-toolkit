/**
 * Hub errors a depositor can hit on borrow, repay, withdraw or activation.
 * Neither the adapter nor the Spoke ABI declares them, and the SDK's
 * `AaveHub.abi.json` is kept to the rate read, so without these fragments the
 * revert selectors decode to nothing.
 *
 * Import-free, so the vault activation path can take it without pulling in the
 * Hub read clients.
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
