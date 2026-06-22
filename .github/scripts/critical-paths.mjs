#!/usr/bin/env node
/**
 * Critical-path manifest tooling.
 *
 * `.github/critical-paths.json` is the single source of truth for the
 * CRITICAL PATHS listed in CLAUDE.md. This script keeps the derived
 * consumers in sync with it:
 *   --write   regenerate the CODEOWNERS critical-path block from the manifest
 *   --check   fail if the manifest, CODEOWNERS, CLAUDE.md, or disk disagree
 *
 * critical-paths-consistency.yml runs `--check` on every PR.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const MANIFEST = resolve(repoRoot, ".github/critical-paths.json");
const CODEOWNERS = resolve(repoRoot, ".github/CODEOWNERS");
const CLAUDE_MD = resolve(repoRoot, "CLAUDE.md");

const BEGIN =
  "# >>> critical-paths: generated from .github/critical-paths.json - do not edit by hand (run `node .github/scripts/critical-paths.mjs --write`) >>>";
const END = "# <<< critical-paths <<<";

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

function allPaths(manifest) {
  return manifest.groups.flatMap((group) => group.paths);
}

function generateBlock(manifest) {
  const lines = [BEGIN];
  for (const group of manifest.groups) {
    const owners = (group.owners ?? manifest.defaultOwners).join(" ");
    lines.push(`# ${group.id}. ${group.title}`);
    for (const path of group.paths) {
      lines.push(`/${path} ${owners}`);
    }
  }
  lines.push(END);
  return lines.join("\n");
}

function write() {
  const manifest = loadManifest();
  const block = generateBlock(manifest);
  const content = readFileSync(CODEOWNERS, "utf8");
  const beginIdx = content.indexOf(BEGIN);
  const endIdx = content.indexOf(END);

  const next =
    beginIdx !== -1 && endIdx !== -1
      ? content.slice(0, beginIdx) + block + content.slice(endIdx + END.length)
      : `${content.trimEnd()}\n\n${block}\n`;

  writeFileSync(CODEOWNERS, next);
  console.log("Updated CODEOWNERS critical-path block from the manifest.");
}

function check() {
  const manifest = loadManifest();
  const paths = allPaths(manifest);
  const errors = [];

  for (const path of paths) {
    if (!existsSync(resolve(repoRoot, path))) {
      errors.push(`Manifest path does not exist on disk: ${path}`);
    }
  }

  const block = generateBlock(manifest);
  const codeowners = readFileSync(CODEOWNERS, "utf8");
  const beginIdx = codeowners.indexOf(BEGIN);
  const endIdx = codeowners.indexOf(END);
  if (beginIdx === -1 || endIdx === -1) {
    errors.push("CODEOWNERS is missing the generated critical-paths markers.");
  } else if (codeowners.slice(beginIdx, endIdx + END.length) !== block) {
    errors.push(
      "CODEOWNERS critical-path block is out of sync with the manifest. Run `node .github/scripts/critical-paths.mjs --write`.",
    );
  }

  const claudeMd = readFileSync(CLAUDE_MD, "utf8");
  for (const path of paths) {
    if (!claudeMd.includes(path)) {
      errors.push(`Critical path is not referenced in CLAUDE.md: ${path}`);
    }
  }

  if (errors.length > 0) {
    console.error("Critical-path consistency check FAILED:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  console.log(
    `Critical-path consistency check passed (${paths.length} paths across ${manifest.groups.length} groups).`,
  );
}

const mode = process.argv[2];
if (mode === "--write") {
  write();
} else if (mode === "--check") {
  check();
} else {
  console.error("Usage: node .github/scripts/critical-paths.mjs --check | --write");
  process.exit(2);
}
