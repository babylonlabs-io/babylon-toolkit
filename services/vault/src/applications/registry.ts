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
