import { registerApplication } from "../registry";

import { AAVE_APP_ID, getAaveControllerAddress } from "./config";
import { AaveRoutes } from "./routes";

export const aaveApp = {
  metadata: {
    id: AAVE_APP_ID,
    name: "Aave V4",
    type: "Lending",
    description:
      "Aave is a decentralized non-custodial liquidity protocol where users can participate as suppliers or borrowers.",
    logoUrl:
      "https://assets.coingecko.com/coins/images/12645/standard/aave-token-round.png",
    websiteUrl: "https://aave.com",
  },
  Routes: AaveRoutes,
};

registerApplication(aaveApp, getAaveControllerAddress());

export { AAVE_APP_ID, AAVE_CONTRACTS } from "./config";
export { AaveRoutes } from "./routes";
