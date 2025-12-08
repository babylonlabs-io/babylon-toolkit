export type { ApplicationMetadata, ApplicationRegistration } from "./types";

export {
  getAllApplications,
  getAppIdByController,
  getApplication,
  getEnabledAppIds,
  getEnabledApplications,
  isApplicationEnabled,
  registerApplication,
} from "./registry";

import "./morpho";
