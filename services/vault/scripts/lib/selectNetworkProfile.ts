/**
 * Picks the profile a build or dev server inlines. Pure apart from reading
 * networks/*.json, so vite.config.ts stays a thin caller and this is testable.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  listNetworkProfileNames,
  readResolvedNetworkProfile,
} from "./networkProfiles";
import { REGISTRY_DERIVED_ENV_KEYS } from "./registryDerivedEnv";

export const DEFAULT_LOCAL_NETWORK = "devnet";

interface SelectInput {
  /** Raw NEXT_PUBLIC_TBV_NETWORK from the process env. */
  name: string | undefined;
  isCI: boolean;
  command: "build" | "serve";
}

/** JSON for import.meta.env.TBV_NETWORK_PROFILE. Throws for a build; a dev server gets an error marker. */
export function selectNetworkProfile(input: SelectInput): string {
  const trimmed = input.name?.trim() ?? "";
  if (trimmed.length === 0 && input.isCI) {
    throw new Error(
      `NEXT_PUBLIC_TBV_NETWORK is required in CI. Set it to one of: ${listNetworkProfileNames().join(", ")}`,
    );
  }
  if (trimmed.length === 0) {
    console.warn(
      `NEXT_PUBLIC_TBV_NETWORK is unset; using "${DEFAULT_LOCAL_NETWORK}".`,
    );
  }
  const selected = trimmed.length === 0 ? DEFAULT_LOCAL_NETWORK : trimmed;
  try {
    return JSON.stringify(readResolvedNetworkProfile(selected));
  } catch (error) {
    const message = `Network profile "${selected}": ${error instanceof Error ? error.message : String(error)}`;
    if (input.command === "build") throw new Error(message);
    console.error(message);
    return JSON.stringify({ $error: message });
  }
}

/** Every dotenv name Vite's loadEnv or Nx's task runner reads: `.env`, `.env.*` and `.*.env`. */
const DOTENV_FILE_NAME = /^(?:\.env(?:\..+)?|\..+\.env)$/;
/** An active assignment of the selector; a commented-out line does not count. */
const SELECTOR_ASSIGNMENT = /^\s*(?:export\s+)?NEXT_PUBLIC_TBV_NETWORK\s*=/m;

/**
 * Dotenv files under `dirs` that set the selector. Nx loads a project's and the
 * workspace's dotenv files into every task but hashes the cache key from the
 * process env, so a selector in one would restore the wrong bundle.
 */
export function findDotenvSelector(dirs: string[]): string[] {
  return dirs
    .flatMap((dir) =>
      (existsSync(dir) ? readdirSync(dir) : [])
        .filter((name) => DOTENV_FILE_NAME.test(name))
        .map((name) => join(dir, name))
        .filter(
          (path) =>
            statSync(path).isFile() &&
            SELECTOR_ASSIGNMENT.test(readFileSync(path, "utf-8")),
        ),
    )
    .sort();
}

/** Moved variables that are still set; the app ignores them, the build reports them. */
export function findRegistryDerivedLeftovers(
  processEnv: Record<string, string | undefined>,
  fileEnv: Record<string, string>,
): string[] {
  return REGISTRY_DERIVED_ENV_KEYS.filter(
    (key) => processEnv[key] !== undefined || fileEnv[key] !== undefined,
  );
}
