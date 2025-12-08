import { registerApplication } from "../registry";

import { getMorphoControllerAddress, MORPHO_APP_ID } from "./config";
import { MorphoRoutes } from "./routes";

export const morphoApp = {
  metadata: {
    id: MORPHO_APP_ID,
    name: "Morpho",
    type: "Lending",
    description:
      "Morpho is a lending protocol that optimizes interest rates by matching lenders and borrowers peer-to-peer while maintaining the liquidity of underlying pools.",
    logoUrl:
      "https://assets.coingecko.com/coins/images/31915/standard/morpho.png",
    websiteUrl: "https://morpho.org",
  },
  Routes: MorphoRoutes,
};

registerApplication(morphoApp, getMorphoControllerAddress());

export { MORPHO_APP_ID, MORPHO_CONTRACTS } from "./config";
export { MorphoRoutes } from "./routes";
