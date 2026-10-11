#!/usr/bin/env node
/**
 * Regenerates, under `src/tbv/core/contracts/abis/`, `vaultErrors.manifest.json`
 * (every custom error the vault contracts declare across every revision in
 * REVISIONS, tagged with the revisions that declare it) and
 * `vaultErrors.abi.json` (the same errors as a bare ABI, for runtime).
 *
 *   node scripts/generate-vault-error-manifest.mjs <path to vault-contracts-aave-v4>
 *
 * Needs `git` and Foundry's `forge` on PATH, and every `lib/` submodule must
 * hold the commit each revision pins (fetch the submodules' full history, not
 * only the current pin). For each revision it exports the
 * tree (plus the pinned `lib/` submodules) into a temp dir, compiles `src/`
 * together with Aave v4's Spoke and Hub, and collects the error entries of
 * every artifact — so errors that bubble up from linked libraries, Aave and
 * OpenZeppelin are included. It fails if two different signatures share a
 * 4-byte selector, since a decoder could not tell them apart.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toFunctionSelector } from "viem";

/**
 * Contract revisions the dApp decodes: vault-contracts-aave-v4 main, which
 * devnet runs. Update when the dApp moves to a newer contracts revision.
 */
const REVISIONS = [{ rev: "a20b5e0d", note: "main" }];

/** Aave v4 sources compiled alongside `src/` so their errors are collected. */
const AAVE_EXTRA_SOURCES = ["lib/aave-v4/src/spoke/Spoke.sol", "lib/aave-v4/src/hub/Hub.sol"];

/**
 * Mocks are left out: the ones a deployment uses add only errors a depositor's
 * call cannot hit — MockPriceFeed's constructor and admin price checks, and
 * MockAuthority's caller and zero-address checks, whose signatures the protocol already declares.
 */
const EXCLUDED_SOURCE_DIRS = ["src/mocks/"];

const ABIS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/tbv/core/contracts/abis",
);
/** Full record with revisions and selectors, read by tests and reviewers. */
const MANIFEST_OUTPUT = path.join(ABIS_DIR, "vaultErrors.manifest.json");
/** Errors-only ABI the SDK ships at runtime. */
const ABI_OUTPUT = path.join(ABIS_DIR, "vaultErrors.abi.json");

/** Output limits for child processes: forge's build log, and a whole repo archive. */
const COMMAND_OUTPUT_MAX_BYTES = 256 * 1024 * 1024;
const ARCHIVE_MAX_BYTES = 1024 * 1024 * 1024;

/** Code-unit order, so the output does not depend on the machine's locale. */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: COMMAND_OUTPUT_MAX_BYTES, ...opts });
}

/** `git archive <treeish>` from `gitDir`, unpacked into `target` — no shell. */
function extractArchive(gitDir, treeish, target) {
  const archive = execFileSync("git", ["-C", gitDir, "archive", treeish], {
    maxBuffer: ARCHIVE_MAX_BYTES,
  });
  execFileSync("tar", ["-x", "-C", target], { input: archive });
}

function exportRevision(repo, rev, dir) {
  extractArchive(repo, rev, dir);
  for (const line of run("git", ["-C", repo, "ls-tree", rev, "lib/"]).trim().split("\n")) {
    const [mode, , sha, subPath] = line.split(/\s+/);
    if (mode !== "160000") continue;
    const target = path.join(dir, subPath);
    fs.mkdirSync(target, { recursive: true });
    extractArchive(path.join(repo, subPath), sha, target);
  }
}

function listSources(dir) {
  const out = [];
  const walk = (rel) => {
    const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => byCodeUnit(a.name, b.name))) {
      const child = path.join(rel, entry.name);
      if (EXCLUDED_SOURCE_DIRS.some((excluded) => `${child}/`.startsWith(excluded))) continue;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".sol")) out.push(child);
    }
  };
  walk("src");
  for (const extra of AAVE_EXTRA_SOURCES) {
    if (!fs.existsSync(path.join(dir, extra))) throw new Error(`${extra} missing from the export`);
    out.push(extra);
  }
  return out;
}

const canonicalType = (param) =>
  param.type.startsWith("tuple")
    ? `(${param.components.map(canonicalType).join(",")})${param.type.slice("tuple".length)}`
    : param.type;
const signatureOf = (item) => `${item.name}(${item.inputs.map(canonicalType).join(",")})`;

/** Only what a decoder needs, so compiler metadata such as `internalType` cannot vary the output. */
const normalizeParam = ({ name, type, components }) =>
  components ? { name, type, components: components.map(normalizeParam) } : { name, type };

/**
 * Every artifact under `out/`, including the nested folders forge uses when two
 * sources share a file name (`types/Errors.sol`, `utils/Errors.sol`), in
 * code-unit path order.
 */
function listArtifacts(outDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "build-info") walk(full);
      } else if (entry.name.endsWith(".json")) {
        files.push(full);
      }
    }
  };
  walk(outDir);
  return files.sort(byCodeUnit);
}

function collectErrors(outDir) {
  const errors = new Map();
  for (const file of listArtifacts(outDir)) {
    const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
    const compilationTarget = artifact.metadata?.settings?.compilationTarget;
    if (!compilationTarget) throw new Error(`${file} has no compilationTarget; cannot apply the mock filter`);
    const sources = Object.keys(compilationTarget);
    if (sources.some((source) => EXCLUDED_SOURCE_DIRS.some((excluded) => source.startsWith(excluded)))) {
      continue;
    }
    if (!Array.isArray(artifact.abi)) throw new Error(`${file} has no abi; its errors would be missed`);
    for (const item of artifact.abi) {
      if (item.type !== "error") continue;
      const signature = signatureOf(item);
      if (!errors.has(signature)) {
        errors.set(signature, { type: "error", name: item.name, inputs: item.inputs.map(normalizeParam) });
      }
    }
  }
  return errors;
}

function main() {
  const repo = process.argv[2];
  if (!repo) throw new Error("Usage: generate-vault-error-manifest.mjs <path to vault-contracts-aave-v4>");

  const bySignature = new Map();
  for (const { rev } of REVISIONS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vault-errors-${rev}-`));
    try {
      exportRevision(repo, rev, dir);
      run("forge", ["build", "--root", dir, ...listSources(dir)], { stdio: ["ignore", "ignore", "inherit"] });
      for (const [signature, item] of collectErrors(path.join(dir, "out"))) {
        const entry = bySignature.get(signature) ?? { signature, item, revisions: [] };
        entry.revisions.push(rev);
        bySignature.set(signature, entry);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const bySelector = new Map();
  for (const { signature } of bySignature.values()) {
    const selector = toFunctionSelector(signature);
    const clash = bySelector.get(selector);
    if (clash) throw new Error(`Selector ${selector} is shared by ${clash} and ${signature}`);
    bySelector.set(selector, signature);
  }

  const errors = [...bySignature.values()]
    .sort((a, b) => byCodeUnit(a.signature, b.signature))
    .map(({ signature, item, revisions }) => ({
      signature,
      selector: toFunctionSelector(signature),
      revisions,
      abi: item,
    }));

  const manifest = {
    generatedBy: "packages/babylon-ts-sdk/scripts/generate-vault-error-manifest.mjs",
    contractsRepo: "babylonlabs-io/vault-contracts-aave-v4",
    revisions: REVISIONS,
    forgeVersion: run("forge", ["--version"]).trim().split("\n")[0],
    aaveExtraSources: AAVE_EXTRA_SOURCES,
    excludedSourceDirs: EXCLUDED_SOURCE_DIRS,
    errors,
  };
  fs.writeFileSync(MANIFEST_OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(ABI_OUTPUT, `${JSON.stringify(errors.map((entry) => entry.abi))}\n`);
  console.log(`Wrote ${errors.length} errors from ${REVISIONS.length} revisions to ${MANIFEST_OUTPUT} and ${ABI_OUTPUT}`);
}

main();
