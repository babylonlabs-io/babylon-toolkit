import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { registerApplication } from "../registry";
import type { ApplicationRegistration } from "../types";

import { AAVE_APP_ID, getAaveAdapterAddress } from "./config";

const aaveApp: ApplicationRegistration = {
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
    abi: AaveIntegrationAdapterABI,
  },
};

registerApplication(aaveApp, getAaveAdapterAddress());
