#!/usr/bin/env -S pnpm exec tsx

/** Fails when source reads, the release workflow and project.json disagree with env-manifest.json. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  evaluateManifest,
  extractEnvNames,
  readEnvManifest,
} from "./lib/envManifest";
import { NETWORKS_DIR } from "./lib/networkProfiles";

const VAULT_ROOT = join(NETWORKS_DIR, "..");
const REPO_ROOT = join(VAULT_ROOT, "..", "..");
const WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github",
  "workflows",
  "service-release-vault.yml",
);
const PROJECT_JSON_PATH = join(VAULT_ROOT, "project.json");

/** Where the app or its build reads NEXT_PUBLIC_* from. */
const SCAN_ROOTS = ["src", "e2e", "scripts"];
const SCAN_FILES = [
  "index.html",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "playwright.visual.config.ts",
  "sentry.client.config.ts",
];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".html"];
/** The moved-names list is data about removed variables, not a read. */
const SKIP_FILES = new Set([
  "scripts/lib/registryDerivedEnv.ts",
  "scripts/check-env-manifest.ts",
]);

const SKIPPED_DIRS = new Set(["node_modules", "dist", "__tests__"]);
const TEST_FILE = /\.test\.tsx?$/;

/** Tests hold fixture names, not reads, so `__tests__` directories and *.test.ts(x) files are skipped. */
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (
      SCAN_EXTENSIONS.some((ext) => path.endsWith(ext)) &&
      !TEST_FILE.test(path)
    )
      yield path;
  }
}

function sourceNames(): string[] {
  const files = [
    ...SCAN_ROOTS.flatMap((root) => [...walk(join(VAULT_ROOT, root))]),
    ...SCAN_FILES.map((file) => join(VAULT_ROOT, file)),
  ];
  const names = new Set<string>();
  for (const file of files) {
    if (SKIP_FILES.has(relative(VAULT_ROOT, file))) continue;
    for (const name of extractEnvNames(readFileSync(file, "utf-8")))
      names.add(name);
  }
  return [...names].sort();
}

const BUILD_STEP_START = /^\s+- name: Build project\s*$/;
const STEP_START = /^\s+- name: /;
const ENV_KEY = /^\s+(NEXT_PUBLIC_[A-Z0-9_]+):/;

/** NEXT_PUBLIC_* keys of the publish job's build step env block. */
function workflowNames(): string[] {
  const lines = readFileSync(WORKFLOW_PATH, "utf-8").split("\n");
  const names: string[] = [];
  let inBuildStep = false;
  for (const line of lines) {
    if (BUILD_STEP_START.test(line)) {
      inBuildStep = true;
      continue;
    }
    if (inBuildStep && STEP_START.test(line)) break;
    const match = inBuildStep ? ENV_KEY.exec(line) : null;
    if (match) names.push(match[1]);
  }
  if (names.length === 0)
    throw new Error(
      `no NEXT_PUBLIC_* keys found under "Build project" in ${WORKFLOW_PATH}`,
    );
  return names;
}

function nxInputNames(): string[] {
  const project = JSON.parse(readFileSync(PROJECT_JSON_PATH, "utf-8")) as {
    targets?: { build?: { inputs?: unknown[] } };
  };
  const inputs = project.targets?.build?.inputs ?? [];
  return inputs.flatMap((input) =>
    typeof input === "object" &&
    input !== null &&
    "env" in input &&
    typeof input.env === "string"
      ? [input.env]
      : [],
  );
}

const violations = evaluateManifest({
  manifest: readEnvManifest(),
  sourceNames: sourceNames(),
  workflowNames: workflowNames(),
  nxInputNames: nxInputNames(),
});
if (violations.length > 0) {
  for (const violation of violations)
    console.error(`env-manifest: ${violation}`);
  process.exit(1);
}
console.log(
  "env-manifest: source, workflow and Nx inputs agree with env-manifest.json.",
);
