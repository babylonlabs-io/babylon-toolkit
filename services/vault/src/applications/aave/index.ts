import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { registerApplication } from "../registry";
import type { ApplicationRegistration } from "../types";

import { AAVE_APP_ID, getAaveAdapterAddress } from "./config";

// Aave's reserve detail is rendered as an overlay over the dashboard by the
// router (see AaveOverlayLayout in `src/router.tsx`), so the app contributes no
// standalone routes — only metadata and contract config.
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
