export type {
  ApplicationContractConfig,
  ApplicationFunctionNames,
  ApplicationMetadata,
  ApplicationRegistration,
} from "./types";

export {
  getAllApplications,
  getAppIdByController,
  getApplication,
  getApplicationByController,
  getApplicationMetadataByController,
  registerApplication,
} from "./registry";

import "./aave";
