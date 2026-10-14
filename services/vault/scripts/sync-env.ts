#!/usr/bin/env -S pnpm exec tsx

/**
 * Generates networks/<name>.json from the canonical network config in the
 * private babylonlabs-io/tbv-networks repo.
 *
 * Usage:
 *   pnpm sync-env <name> [--kind production|test|internal]   refresh one profile (kind needed only for a new file)
 *   pnpm sync-env --all                                      refresh every registry-backed profile
 *   pnpm sync-env <name> --check [--soft]                    exit 1 when the committed profile differs from the registry
 *                                                            (--soft prints instead of failing; `pnpm dev` uses it)
 *
 * Every run also removes the registry-derived NEXT_PUBLIC_* keys from a local
 * .env, which the app no longer reads.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  OVERRIDABLE_ENDPOINTS,
  parseNetworkProfile,
  PROFILE_KINDS,
  type NetworkProfile,
  type ProfileKind,
} from "../src/config/network/profile";
import {
  listNetworkProfileNames,
  networkProfilePath,
  NETWORKS_DIR,
  readNetworkProfile,
} from "./lib/networkProfiles";
import { REGISTRY_DERIVED_ENV_KEYS } from "./lib/registryDerivedEnv";

export { REGISTRY_DERIVED_ENV_KEYS };

const NETWORKS_REPO = "babylonlabs-io/tbv-networks";
const FETCH_TIMEOUT_MS = 15_000;
const ENV_PATH = join(NETWORKS_DIR, "..", ".env");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface BuildProfileInput {
  name: string;
  registry: unknown;
  commit: string;
  existing: NetworkProfile | null;
  kind: ProfileKind | undefined;
}

/** Map one registry entry to a profile; `kind` and `overrides` never come from the registry. */
export function buildProfile(input: BuildProfileInput): NetworkProfile {
  const { name, registry, commit, existing } = input;
  if (
    existing !== null &&
    input.kind !== undefined &&
    existing.kind !== input.kind
  ) {
    throw new Error(
      `networks/${name}.json has kind "${existing.kind}"; --kind "${input.kind}" disagrees — edit the file by hand to reclassify`,
    );
  }
  const kind = existing?.kind ?? input.kind;
  if (kind === undefined) {
    throw new Error(
      `networks/${name}.json does not exist yet; pass --kind ${PROFILE_KINDS.join("|")}`,
    );
  }
  if (!isRecord(registry) || !isRecord(registry.contracts)) {
    throw new Error(
      `registry entry for ${name} is not an object with "contracts"`,
    );
  }
  const { contracts } = registry;
  const candidate: Record<string, unknown> = {
    name,
    kind,
    registryCommit: commit,
    btcNetwork: registry.btcNetwork,
    ethChainId: registry.ethChainId,
    ethRpcUrl: registry.ethRpcUrl,
    indexerUrl: registry.indexerUrl,
    vpProxyUrl: registry.vpProxyUrl,
    contracts: {
      btcVaultRegistry: contracts.btcVaultRegistry,
      aaveAdapter: contracts.aaveAdapter,
      aaveAdapterConfig: contracts.aaveAdapterConfig,
      ...(contracts.btcPriceFeed === undefined
        ? {}
        : { btcPriceFeed: contracts.btcPriceFeed }),
    },
  };
  if (existing?.overrides !== undefined) {
    candidate.overrides = existing.overrides;
    // An override may stand in for an endpoint the registry leaves empty.
    for (const key of OVERRIDABLE_ENDPOINTS) {
      const override = existing.overrides[key];
      if (candidate[key] === "" && override !== undefined)
        candidate[key] = override;
    }
  }
  return parseNetworkProfile(candidate);
}

const JSON_INDENT = 2;

/** Fixed key order so regeneration is byte-stable and diffs show only real changes. */
export function serializeProfile(profile: NetworkProfile): string {
  const ordered: Record<string, unknown> = {
    name: profile.name,
    kind: profile.kind,
    registryCommit: profile.registryCommit,
    btcNetwork: profile.btcNetwork,
    ethChainId: profile.ethChainId,
    ethRpcUrl: profile.ethRpcUrl,
    indexerUrl: profile.indexerUrl,
    vpProxyUrl: profile.vpProxyUrl,
    contracts: {
      btcVaultRegistry: profile.contracts.btcVaultRegistry,
      aaveAdapter: profile.contracts.aaveAdapter,
      aaveAdapterConfig: profile.contracts.aaveAdapterConfig,
      ...(profile.contracts.btcPriceFeed === undefined
        ? {}
        : { btcPriceFeed: profile.contracts.btcPriceFeed }),
    },
  };
  if (profile.overrides !== undefined) {
    const { reason, ...endpoints } = profile.overrides;
    ordered.overrides = { reason, ...endpoints };
  }
  return `${JSON.stringify(ordered, null, JSON_INDENT)}\n`;
}

const ENV_LINE = /^([A-Z_][A-Z0-9_]*)=/;

/** Drop the moved keys from a .env file, leaving every other line untouched. */
export function stripRegistryDerivedKeys(envContent: string): {
  content: string;
  removed: string[];
} {
  const removed: string[] = [];
  const kept = envContent.split("\n").filter((line) => {
    const match = ENV_LINE.exec(line);
    if (!match) return true;
    const key = match[1];
    if (!(REGISTRY_DERIVED_ENV_KEYS as readonly string[]).includes(key))
      return true;
    removed.push(key);
    return false;
  });
  return { content: kept.join("\n"), removed };
}

function gh(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf-8",
    timeout: FETCH_TIMEOUT_MS,
  }).trim();
}

function fetchRegistryEntry(name: string): {
  registry: unknown;
  commit: string;
} {
  const path = `${name}/network_info.json`;
  const commit = gh([
    "api",
    `repos/${NETWORKS_REPO}/commits?path=${path}&per_page=1`,
    "--jq",
    ".[0].sha",
  ]);
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(
      `could not read the latest commit for ${path} (got "${commit}")`,
    );
  }
  const content = gh([
    "api",
    `repos/${NETWORKS_REPO}/contents/${path}?ref=${commit}`,
    "--jq",
    ".content",
  ]);
  const registry: unknown = JSON.parse(
    Buffer.from(content, "base64").toString("utf-8"),
  );
  return { registry, commit };
}

function stripLocalEnv(): void {
  if (!existsSync(ENV_PATH)) return;
  const { content, removed } = stripRegistryDerivedKeys(
    readFileSync(ENV_PATH, "utf-8"),
  );
  if (removed.length === 0) return;
  writeFileSync(ENV_PATH, content);
  console.log(
    `sync-env: removed ${removed.join(", ")} from .env — the app reads them from networks/<name>.json now.`,
  );
}

function registryBackedProfiles(): string[] {
  return listNetworkProfileNames().filter(
    (name) => readNetworkProfile(name).registryCommit !== null,
  );
}

interface Args {
  names: string[];
  kind: ProfileKind | undefined;
  check: boolean;
  soft: boolean;
}

function parseArgs(argv: string[]): Args {
  const names: string[] = [];
  let kind: ProfileKind | undefined;
  let all = false;
  let check = false;
  let soft = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") all = true;
    else if (arg === "--check") check = true;
    else if (arg === "--soft") soft = true;
    else if (arg === "--kind") {
      const value = argv[i + 1];
      if (!(PROFILE_KINDS as readonly string[]).includes(value ?? "")) {
        throw new Error(`--kind must be one of ${PROFILE_KINDS.join(", ")}`);
      }
      kind = value as ProfileKind;
      i += 1;
    } else if (arg.startsWith("--")) throw new Error(`unknown flag ${arg}`);
    else names.push(arg);
  }
  if (all && names.length > 0) throw new Error("--all takes no profile name");
  if (!all && names.length === 0) {
    throw new Error("pass a profile name or --all");
  }
  return { names: all ? registryBackedProfiles() : names, kind, check, soft };
}

function main(): void {
  if (process.env.NODE_ENV === "production") {
    console.error("sync-env: this script is for local development only.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  stripLocalEnv();

  let stale = 0;
  for (const name of args.names) {
    const path = networkProfilePath(name);
    const existing = existsSync(path) ? readNetworkProfile(name) : null;
    if (existing !== null && existing.registryCommit === null) {
      throw new Error(
        `networks/${name}.json is hand-written (registryCommit null); not synced`,
      );
    }
    let fetched: { registry: unknown; commit: string };
    try {
      fetched = fetchRegistryEntry(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (args.soft) {
        console.warn(
          `sync-env: could not reach tbv-networks for ${name} (${message}); skipping check.`,
        );
        continue;
      }
      throw new Error(
        `could not fetch ${name}/network_info.json from ${NETWORKS_REPO}: ${message}. Install and authenticate the GitHub CLI (gh auth login).`,
      );
    }
    const next = serializeProfile(
      buildProfile({
        name,
        registry: fetched.registry,
        commit: fetched.commit,
        existing,
        kind: args.kind,
      }),
    );
    const current = existing === null ? null : readFileSync(path, "utf-8");
    if (current === next) {
      console.log(
        `sync-env: networks/${name}.json is up to date with ${NETWORKS_REPO}@${fetched.commit.slice(0, 7)}.`,
      );
      continue;
    }
    if (args.check) {
      stale += 1;
      console.log(
        `sync-env: networks/${name}.json differs from ${NETWORKS_REPO}@${fetched.commit.slice(0, 7)}. Run: pnpm sync-env ${name}`,
      );
      continue;
    }
    writeFileSync(path, next);
    console.log(
      `sync-env: wrote networks/${name}.json from ${NETWORKS_REPO}@${fetched.commit.slice(0, 7)}. Review the diff before committing.`,
    );
    if (existing?.overrides !== undefined) {
      console.warn(
        `sync-env: networks/${name}.json still carries overrides (${existing.overrides.reason}).`,
      );
    }
  }
  if (stale > 0 && !args.soft) process.exit(1);
}

// Vitest imports the pure functions above; only a direct run executes the CLI.
if (process.argv[1]?.endsWith("sync-env.ts")) main();
