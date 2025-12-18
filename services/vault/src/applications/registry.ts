import type { Address } from "viem";

import type { ApplicationRegistration } from "./types";

const applicationRegistry = new Map<string, ApplicationRegistration>();
const controllerToAppId = new Map<string, string>();

export function registerApplication(
  app: ApplicationRegistration,
  controllerAddress?: Address,
): void {
  const id = app.metadata.id.toLowerCase();
  applicationRegistry.set(id, app);

  if (controllerAddress) {
    controllerToAppId.set(controllerAddress.toLowerCase(), id);
  }
}

export function getApplication(
  appId: string,
): ApplicationRegistration | undefined {
  return applicationRegistry.get(appId.toLowerCase());
}

export function getAppIdByController(
  controllerAddress: string,
): string | undefined {
  return controllerToAppId.get(controllerAddress.toLowerCase());
}

export function getAllApplications(): ApplicationRegistration[] {
  return Array.from(applicationRegistry.values());
}

export function getEnabledAppIds(): string[] {
  const whitelist = process.env.NEXT_PUBLIC_ENABLED_APPS;
  if (!whitelist || typeof whitelist !== "string") {
    return Array.from(applicationRegistry.keys());
  }
  return whitelist
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

export function getEnabledApplications(): ApplicationRegistration[] {
  const enabledIds = getEnabledAppIds();
  return enabledIds
    .map((id) => applicationRegistry.get(id))
    .filter((app): app is ApplicationRegistration => app !== undefined);
}

export function isApplicationEnabled(appId: string): boolean {
  const enabledIds = getEnabledAppIds();
  return enabledIds.includes(appId.toLowerCase());
}

/**
 * Get application metadata by controller address
 * Used to enrich GraphQL data with local metadata
 */
export function getApplicationMetadataByController(
  controllerAddress: string,
): ApplicationRegistration["metadata"] | undefined {
  const appId = getAppIdByController(controllerAddress);
  if (!appId) return undefined;
  const app = applicationRegistry.get(appId);
  return app?.metadata;
}

/**
 * Get full application registration by controller address
 * Used for contract interactions (ABI, function names)
 */
export function getApplicationByController(
  controllerAddress: string,
): ApplicationRegistration | undefined {
  const appId = getAppIdByController(controllerAddress);
  if (!appId) return undefined;
  return applicationRegistry.get(appId);
}
