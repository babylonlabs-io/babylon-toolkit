/**
 * Node-side access to the committed profiles in services/vault/networks.
 * Used by vite.config.ts, the scripts and the real-wallet E2E CLI; never by
 * browser code (which gets the selected profile inlined at build time).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseNetworkProfile,
  resolveNetworkProfile,
  type NetworkProfile,
} from "../../src/config/network/profile";

export const NETWORKS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "networks",
);

const PROFILE_EXTENSION = ".json";

export function listNetworkProfileNamesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(PROFILE_EXTENSION))
    .map((file) => basename(file, PROFILE_EXTENSION))
    .sort();
}

export function readNetworkProfileFrom(
  dir: string,
  name: string,
): NetworkProfile {
  const path = join(dir, `${name}${PROFILE_EXTENSION}`);
  if (!existsSync(path)) {
    throw new Error(
      `Unknown network profile "${name}": ${path} does not exist. Known: ${listNetworkProfileNamesIn(dir).join(", ")}`,
    );
  }
  const profile = parseNetworkProfile(JSON.parse(readFileSync(path, "utf-8")));
  if (profile.name !== name) {
    throw new Error(
      `networks/${name}.json declares name "${profile.name}"; the name must equal the file name`,
    );
  }
  return profile;
}

export function readResolvedNetworkProfileFrom(
  dir: string,
  name: string,
): NetworkProfile {
  return resolveNetworkProfile(readNetworkProfileFrom(dir, name));
}

export function networkProfilePath(name: string): string {
  return join(NETWORKS_DIR, `${name}${PROFILE_EXTENSION}`);
}

export function listNetworkProfileNames(): string[] {
  return listNetworkProfileNamesIn(NETWORKS_DIR);
}

export function readNetworkProfile(name: string): NetworkProfile {
  return readNetworkProfileFrom(NETWORKS_DIR, name);
}

export function readResolvedNetworkProfile(name: string): NetworkProfile {
  return readResolvedNetworkProfileFrom(NETWORKS_DIR, name);
}
