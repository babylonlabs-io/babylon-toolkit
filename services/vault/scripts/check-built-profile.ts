#!/usr/bin/env -S pnpm exec tsx

/** CI post-build gate: dist inlines the selected profile's registry address and no other profile's. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  listNetworkProfileNames,
  NETWORKS_DIR,
  readResolvedNetworkProfile,
} from "./lib/networkProfiles";

const [name, distArg] = process.argv.slice(2);
if (!name) {
  console.error("usage: check-built-profile.ts <name> [distDir]");
  process.exit(1);
}
const distDir = distArg ?? join(NETWORKS_DIR, "..", "dist");

function* jsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (path.endsWith(".js")) yield path;
  }
}

const bundle = [...jsFiles(distDir)]
  .map((file) => readFileSync(file, "utf-8"))
  .join("\n");
const expected = readResolvedNetworkProfile(name);
if (!bundle.includes(expected.contracts.btcVaultRegistry)) {
  console.error(
    `check-built-profile: ${distDir} does not contain ${name}'s registry ${expected.contracts.btcVaultRegistry}.`,
  );
  process.exit(1);
}
for (const other of listNetworkProfileNames()) {
  if (other === name) continue;
  const registry = readResolvedNetworkProfile(other).contracts.btcVaultRegistry;
  if (
    registry !== expected.contracts.btcVaultRegistry &&
    bundle.includes(registry)
  ) {
    console.error(
      `check-built-profile: ${distDir} also contains ${other}'s registry ${registry}; the build inlined more than one profile.`,
    );
    process.exit(1);
  }
}
console.log(
  `check-built-profile: ${distDir} inlines ${name} (registry ${expected.contracts.btcVaultRegistry}).`,
);
