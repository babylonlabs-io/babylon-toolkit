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
  getEnabledAppIds,
  getEnabledApplications,
  isApplicationEnabled,
  registerApplication,
} from "./registry";

import "./aave";
import "./morpho";
