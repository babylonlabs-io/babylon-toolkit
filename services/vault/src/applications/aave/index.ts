import {
  AAVE_FUNCTION_NAMES,
  AaveIntegrationControllerABI,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { registerApplication } from "../registry";
import type { ApplicationRegistration } from "../types";

import { AAVE_APP_ID, getAaveControllerAddress } from "./config";

export const aaveApp: ApplicationRegistration = {
  metadata: {
    id: AAVE_APP_ID,
    name: "Aave V4",
    type: "Lending",
    description:
      "Aave is a decentralized non-custodial liquidity protocol where users can participate as suppliers or borrowers.",
    logoUrl: "/images/aave.svg",
    websiteUrl: "https://aave.com",
  },
  contracts: {
    abi: AaveIntegrationControllerABI,
    functionNames: {
      redeem: AAVE_FUNCTION_NAMES.REDEEM,
    },
  },
};

registerApplication(aaveApp, getAaveControllerAddress());

export { AAVE_APP_ID, AAVE_CONTRACTS } from "./config";
