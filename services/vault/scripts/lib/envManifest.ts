/**
 * env-manifest.json lists every NEXT_PUBLIC_* name the vault app reads, by
 * class. evaluateManifest() is the rule set; check-env-manifest.ts feeds it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NETWORKS_DIR } from "./networkProfiles";

export const MANIFEST_CLASSES = [
  "release-required",
  "release-optional",
  "build-only",
  "dev-test-only",
  "removed",
] as const;
export type ManifestClass = (typeof MANIFEST_CLASSES)[number];
export type EnvManifest = Record<ManifestClass, string[]>;

export const MANIFEST_PATH = join(NETWORKS_DIR, "..", "env-manifest.json");

const ENV_NAME = /\bNEXT_PUBLIC_[A-Z0-9_]+\b/g;

export function readEnvManifest(): EnvManifest {
  const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  if (typeof raw !== "object" || raw === null)
    throw new Error("env-manifest.json must be an object");
  const manifest = raw as Record<string, unknown>;
  for (const cls of MANIFEST_CLASSES) {
    const list = manifest[cls];
    if (!Array.isArray(list) || !list.every((n) => typeof n === "string")) {
      throw new Error(`env-manifest.json: "${cls}" must be a list of names`);
    }
  }
  return manifest as EnvManifest;
}

/** Names in a source text; a trailing underscore marks a prefix mention, not a variable. */
export function extractEnvNames(text: string): string[] {
  return [...new Set(text.match(ENV_NAME) ?? [])].filter(
    (n) => !n.endsWith("_"),
  );
}

interface EvaluateInput {
  manifest: EnvManifest;
  sourceNames: string[];
  workflowNames: string[];
  nxInputNames: string[];
}

export function evaluateManifest(input: EvaluateInput): string[] {
  const { manifest } = input;
  const violations: string[] = [];
  const classOf = new Map<string, ManifestClass>();
  for (const cls of MANIFEST_CLASSES) {
    for (const name of manifest[cls]) {
      if (classOf.has(name)) {
        violations.push(
          `${name} appears in more than one class of env-manifest.json`,
        );
        continue;
      }
      classOf.set(name, cls);
    }
  }

  for (const name of input.sourceNames) {
    const cls = classOf.get(name);
    if (cls === undefined)
      violations.push(
        `${name} is read by the app but not listed in env-manifest.json`,
      );
    else if (cls === "removed")
      violations.push(`${name} is listed as removed but still read by the app`);
  }

  const workflow = new Set(input.workflowNames);
  for (const name of manifest["release-required"]) {
    if (!workflow.has(name)) {
      violations.push(
        `${name} is release-required but service-release-vault.yml does not pass it`,
      );
    }
  }
  for (const name of input.workflowNames) {
    const cls = classOf.get(name);
    if (cls === undefined)
      violations.push(
        `${name} is passed by service-release-vault.yml but not listed in env-manifest.json`,
      );
    else if (cls === "removed" || cls === "dev-test-only") {
      violations.push(
        `${name} is ${cls} but service-release-vault.yml passes it`,
      );
    }
  }

  const expectedInputs = [
    ...manifest["release-required"],
    ...manifest["release-optional"],
    ...manifest["build-only"],
  ];
  const nx = new Set(input.nxInputNames);
  const missing = expectedInputs.filter((n) => !nx.has(n));
  const extra = input.nxInputNames.filter((n) => !expectedInputs.includes(n));
  if (missing.length > 0 || extra.length > 0) {
    const parts = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
      extra.length > 0 ? `extra: ${extra.join(", ")}` : "",
    ].filter(Boolean);
    violations.push(
      `project.json build inputs must list exactly the release-required, release-optional and build-only names; ${parts.join("; ")}`,
    );
  }
  return violations;
}
