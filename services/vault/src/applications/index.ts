export type {
  ApplicationContractConfig,
  ApplicationMetadata,
  ApplicationRegistration,
} from "./types";

export {
  getAllApplications,
  getAppIdByController,
  getApplication,
  getApplicationMetadataByController,
} from "./registry";

import "./aave";
