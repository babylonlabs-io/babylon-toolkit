export type { ApplicationMetadata, ApplicationRegistration } from "./types";

export {
  getAllApplications,
  getAppIdByController,
  getApplication,
  getApplicationMetadataByController,
  getEnabledAppIds,
  getEnabledApplications,
  isApplicationEnabled,
  registerApplication,
} from "./registry";

import "./aave";
import "./morpho";
