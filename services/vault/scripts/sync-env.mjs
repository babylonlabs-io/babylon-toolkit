#!/usr/bin/env node

/**
 * Syncs .env with the canonical network config from tbv-networks.
 *
 * Fetches network_info.json from GitHub, maps the values to NEXT_PUBLIC_*
 * env vars, and updates .env in-place — preserving any local-only
 * variables (e.g. REOWN_PROJECT_ID, feature flags).
 *
 * Usage:
 *   node scripts/sync-env.mjs [network]    # default: devnet
 *   node scripts/sync-env.mjs --check      # exit 1 if .env is stale (read-only)
 *   node scripts/sync-env.mjs --all        # also update .env.example
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "..", ".env");
const ENV_EXAMPLE_PATH = join(__dirname, "..", ".env.example");
const CACHE_PATH = join(__dirname, "..", "node_modules", ".cache", "sync-env-last-fetch");

const NETWORKS_REPO = "babylonlabs-io/tbv-networks";

/** Skip fetch if last successful sync was less than this many seconds ago. */
const CACHE_TTL_SECONDS = 300; // 5 minutes

/** Timeout for the `gh api` fetch call in milliseconds. */
const FETCH_TIMEOUT_MS = 15_000;

/** Map from network_info.json paths to env var names. */
const FIELD_MAP = {
  btcNetwork: "NEXT_PUBLIC_BTC_NETWORK",
  ethChainId: "NEXT_PUBLIC_ETH_CHAINID",
  ethRpcUrl: "NEXT_PUBLIC_ETH_RPC_URL",
  indexerUrl: "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
  vpProxyUrl: "NEXT_PUBLIC_TBV_VP_PROXY_URL",
  "contracts.btcVaultRegistry": "NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY",
  "contracts.aaveAdapter": "NEXT_PUBLIC_TBV_AAVE_ADAPTER",
  "contracts.btcPriceFeed": "NEXT_PUBLIC_TBV_BTC_PRICE_FEED",
};

/** Keys whose changes warrant a prominent warning — contract addresses and endpoints. */
const SECURITY_CRITICAL_KEYS = new Set([
  "NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY",
  "NEXT_PUBLIC_TBV_AAVE_ADAPTER",
  "NEXT_PUBLIC_TBV_BTC_PRICE_FEED",
  "NEXT_PUBLIC_ETH_RPC_URL",
  "NEXT_PUBLIC_TBV_VP_PROXY_URL",
]);

function formatChange({ key, from }) {
  return `  ${key}: ${from === "(missing)" ? "added" : "changed"}`;
}

function resolve(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function parseEnv(content) {
  const lines = content.split("\n");
  const entries = [];
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
    if (match) {
      entries.push({ key: match[1], value: match[2], raw: line });
    } else {
      entries.push({ raw: line });
    }
  }
  return entries;
}

function serializeEnv(entries) {
  return entries.map((e) => e.raw).join("\n");
}

function fetchNetworkInfo(network) {
  // Use `gh` CLI for authenticated access to private repos.
  // Repo structure: {network}/network_info.json (e.g. devnet/network_info.json)
  const raw = execFileSync(
    "gh",
    ["api", `repos/${NETWORKS_REPO}/contents/${network}/network_info.json`, "--jq", ".content"],
    { encoding: "utf-8", timeout: FETCH_TIMEOUT_MS },
  ).trim();
  const json = Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(json);
}

function isCacheFresh() {
  try {
    const { mtimeMs } = statSync(CACHE_PATH);
    return (Date.now() - mtimeMs) / 1000 < CACHE_TTL_SECONDS;
  } catch {
    return false;
  }
}

function touchCache() {
  try {
    const cacheDir = dirname(CACHE_PATH);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(CACHE_PATH, String(Date.now()));
  } catch {
    // Non-critical — worst case we fetch again next time
  }
}

/**
 * Compute the diff between an env file's content and the remote values.
 * Returns { entries, updated } without writing anything.
 */
function computeDiff(content, remote, network) {
  const entries = parseEnv(content);
  const updated = [];
  const seen = new Set();

  for (const entry of entries) {
    if (entry.key && remote[entry.key] !== undefined) {
      seen.add(entry.key);
      const newValue = remote[entry.key];
      if (entry.value !== newValue) {
        updated.push({ key: entry.key, from: entry.value, to: newValue });
        entry.value = newValue;
        entry.raw = `${entry.key}=${newValue}`;
      }
    }
  }

  // Append any mapped keys that aren't in the file yet
  const missing = Object.entries(remote).filter(([k]) => !seen.has(k));
  if (missing.length > 0) {
    entries.push({ raw: "" });
    entries.push({ raw: `# Added by sync-env from ${network}` });
    for (const [key, value] of missing) {
      entries.push({ key, value, raw: `${key}=${value}` });
      updated.push({ key, from: "(missing)", to: value });
    }
  }

  return { entries, updated };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const includeExample = args.includes("--all");
  const network = args.find((a) => !a.startsWith("--")) ?? "devnet";

  // In dev mode (not --check, not --all), skip if we fetched recently
  if (!checkOnly && !includeExample && isCacheFresh() && existsSync(ENV_PATH)) {
    return;
  }

  // Fetch remote config via `gh` CLI (handles private repo auth)
  let config;
  try {
    config = fetchNetworkInfo(network);
  } catch (err) {
    if (checkOnly) {
      console.error(`sync-env: could not fetch ${network}/network_info.json — cannot verify .env.`);
      console.error("  Install the GitHub CLI and authenticate: brew install gh && gh auth login");
      process.exit(1);
    }
    // Don't block dev — but distinguish "not found" from "auth failure".
    // GitHub returns 404 for both unauthenticated private repo access and
    // genuinely missing paths, so check for auth-related patterns first.
    const combined = `${err?.stderr ?? ""}${err?.message ?? ""}`;
    const isAuthError = /authentication|credentials|401|gh auth/i.test(combined);
    const isNotFound = !isAuthError && (combined.includes("Not Found") || combined.includes("404"));
    if (isNotFound) {
      console.error(`sync-env: network "${network}" not found in tbv-networks repo.`);
      process.exit(1);
    }
    console.warn(`⚠ sync-env: could not fetch ${network}/network_info.json. Skipping.`);
    console.warn("  To enable automatic .env sync, install the GitHub CLI and authenticate:");
    console.warn("    brew install gh && gh auth login");
    process.exit(0);
  }

  // Build desired key-value pairs from remote
  const remote = {};
  const missingPaths = [];
  for (const [jsonPath, envKey] of Object.entries(FIELD_MAP)) {
    const value = resolve(config, jsonPath);
    if (value !== undefined) {
      remote[envKey] = String(value);
    } else {
      missingPaths.push(jsonPath);
    }
  }
  if (missingPaths.length > 0) {
    console.warn(`⚠ sync-env: network_info.json is missing expected fields: ${missingPaths.join(", ")}`);
    console.warn("  The upstream schema may have changed — check tbv-networks and update FIELD_MAP.");
  }

  // --check mode: read-only, never write files
  if (checkOnly) {
    if (!existsSync(ENV_PATH)) {
      console.error("sync-env: .env does not exist.");
      process.exit(1);
    }
    const { updated } = computeDiff(readFileSync(ENV_PATH, "utf-8"), remote, network);
    if (updated.length === 0) {
      console.log(`sync-env: .env is up to date with ${network}.`);
      return;
    }
    console.log(`sync-env: .env is stale (${updated.length} values differ from ${network}):`);
    for (const change of updated) {
      console.log(formatChange(change));
    }
    process.exit(1);
  }

  // Ensure .env exists (copy from .env.example if missing)
  if (!existsSync(ENV_PATH)) {
    if (existsSync(ENV_EXAMPLE_PATH)) {
      writeFileSync(ENV_PATH, readFileSync(ENV_EXAMPLE_PATH, "utf-8"));
      console.log("sync-env: created .env from .env.example");
    } else {
      const lines = Object.entries(remote).map(([k, v]) => `${k}=${v}`);
      writeFileSync(ENV_PATH, lines.join("\n") + "\n");
      console.log("sync-env: created .env from network_info.json");
      touchCache();
      return;
    }
  }

  // Build target list: always .env, optionally .env.example with --all
  const targets = [{ path: ENV_PATH, label: ".env" }];
  if (includeExample && existsSync(ENV_EXAMPLE_PATH)) {
    targets.push({ path: ENV_EXAMPLE_PATH, label: ".env.example" });
  }

  let totalUpdated = 0;

  for (const { path, label } of targets) {
    const content = readFileSync(path, "utf-8");
    const { entries, updated } = computeDiff(content, remote, network);

    if (updated.length === 0) continue;

    writeFileSync(path, serializeEnv(entries));
    console.log(`sync-env: updated ${updated.length} value(s) in ${label} from ${network}:`);
    for (const change of updated) {
      console.log(formatChange(change));
    }

    const criticalChanges = updated.filter(({ key }) => SECURITY_CRITICAL_KEYS.has(key));
    if (criticalChanges.length > 0) {
      const names = criticalChanges.map(({ key }) => key).join(", ");
      console.error(`\n⚠ sync-env: security-critical values changed: ${names}`);
      console.error("  Verify these are expected. If not, restore .env from git: git checkout -- .env\n");
    }

    totalUpdated += updated.length;
  }

  if (totalUpdated === 0) {
    console.log(`sync-env: .env is up to date with ${network}.`);
  }

  touchCache();
}

main();
