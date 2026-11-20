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
      "Aave V4 is a third-party lending protocol governed by the Aave DAO, which sets borrowing rates and risk parameters.",
    logoUrl: "/images/aave.svg",
    websiteUrl: "https://aave.com",
  },
  contracts: {
    abi: AaveIntegrationAdapterABI,
  },
};

registerApplication(aaveApp, getAaveAdapterAddress());
