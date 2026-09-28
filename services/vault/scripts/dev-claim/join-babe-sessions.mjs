#!/usr/bin/env node
// Replaces the placeholder `babe_sessions` in the driver's artifacts file
// with the real sessions from the vault provider's response, byte for byte.
// The browser cannot hold the real sessions (~1.4 GB), so the driver signs
// and assembles with a one-entry-per-challenger "00" placeholder and this
// script produces the file the watchtower runs from.
//
// Usage:
//   node join-babe-sessions.mjs --artifacts artifacts.placeholder.json \
//     --vp <vp-artifacts.json> --slim <x.slim.json> --vault 0x<vaultId> \
//     --out artifacts.json
//
// Dev-only tooling for the delegated-claim devnet run; never shipped.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { pipeline } from "node:stream/promises";

import { scanJson } from "./jsonScan.mjs";

const PLACEHOLDER_DECRYPTOR_HEX = "00";
// The fields btc-vault's ArtifactsMirror requires (crates/vault/src/
// delegated_claim.rs @ 82a660c3, struct ArtifactsMirror).
const REQUIRED_TOP_LEVEL_KEYS = [
  "tx_graph",
  "claim_tx",
  "signatures",
  "verifying_key",
  "claimable_event_block_number",
  "prover_circuit_version",
  "vault_id",
  "babe_sessions",
];

const { values: args } = parseArgs({
  options: {
    artifacts: { type: "string" },
    vp: { type: "string" },
    slim: { type: "string" },
    vault: { type: "string" },
    out: { type: "string" },
  },
});
for (const name of ["artifacts", "vp", "slim", "vault", "out"]) {
  if (!args[name]) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
}

const normalizeHex = (value) => value.toLowerCase().replace(/^0x/, "");
const fail = (message) => {
  throw new Error(message);
};

// 1. The VP file is the one the slim file was cut from.
const vpPath = resolve(args.vp);
const slim = JSON.parse(await readFile(resolve(args.slim), "utf8"));
const vpStat = await stat(vpPath);
if (vpStat.size !== slim.source.size || vpStat.mtimeMs !== slim.source.mtimeMs) {
  fail(`${vpPath} changed since it was slimmed (size/mtime differ); re-run slim-vp-artifacts.mjs`);
}

// 2. The placeholder file is this vault's, built from this graph and key,
//    and still carries only placeholders.
const placeholderBytes = await readFile(resolve(args.artifacts));
const placeholder = JSON.parse(placeholderBytes.toString("utf8"));
if (normalizeHex(String(placeholder.vault_id)) !== normalizeHex(args.vault)) {
  fail(`artifacts vault_id ${placeholder.vault_id} is not --vault ${args.vault}`);
}
if (!isDeepStrictEqual(JSON.parse(placeholder.tx_graph), JSON.parse(slim.tx_graph_json))) {
  fail("artifacts tx_graph differs from the graph in the slim file");
}
if (normalizeHex(String(placeholder.verifying_key)) !== normalizeHex(slim.verifying_key_hex)) {
  console.warn(
    "WARNING: artifacts verifying_key differs from the VP-served key. Expected only when a " +
      "trusted key from the prover was used and the VP served a different one — investigate.",
  );
}
const placeholderSessions = placeholder.babe_sessions;
const placeholderKeys = Object.keys(placeholderSessions).sort();
if (!isDeepStrictEqual(placeholderKeys, [...slim.babe_challengers].sort())) {
  fail(
    `artifacts babe_sessions keys [${placeholderKeys}] differ from the VP's [${slim.babe_challengers}]`,
  );
}
for (const [key, session] of Object.entries(placeholderSessions)) {
  if (session?.decryptor_artifacts_hex !== PLACEHOLDER_DECRYPTOR_HEX) {
    fail(`artifacts babe_sessions["${key}"] is not the placeholder; refusing to overwrite it`);
  }
}
if (String(placeholder.claimable_event_block_number) === "0") {
  fail("artifacts claimable_event_block_number is 0 (a dry-run file); the watchtower refuses it");
}

// 3. Locate the placeholder map's bytes.
let placeholderRange;
await scanJson(placeholderBytes, ({ path, start, end }) => {
  if (path.length === 1 && path[0] === "babe_sessions") placeholderRange = [start, end];
});
if (!placeholderRange) fail("could not locate babe_sessions in the artifacts file");

// 4. Splice: head of the placeholder, the VP's sessions verbatim, the tail.
const outPath = resolve(args.out);
const out = createWriteStream(outPath);
out.write(placeholderBytes.subarray(0, placeholderRange[0]));
await pipeline(
  createReadStream(vpPath, { start: slim.source.babeStart, end: slim.source.babeEnd - 1 }),
  out,
  { end: false },
);
out.end(placeholderBytes.subarray(placeholderRange[1]));
await new Promise((resolveClose, rejectClose) => {
  out.on("finish", resolveClose);
  out.on("error", rejectClose);
});

// 5. Re-scan the output: required keys, session coverage, no placeholder left.
const topLevelKeys = [];
const sessionRanges = new Map();
const hash = createHash("sha256");
for await (const chunk of createReadStream(outPath)) hash.update(chunk);
const outSize = await scanJson(outPath, ({ path, start, end }) => {
  if (path.length === 1) topLevelKeys.push(path[0]);
  if (path.length === 3 && path[0] === "babe_sessions") sessionRanges.set(path[1], [start, end]);
});
const missingKeys = REQUIRED_TOP_LEVEL_KEYS.filter((key) => !topLevelKeys.includes(key));
if (missingKeys.length > 0 || new Set(topLevelKeys).size !== topLevelKeys.length) {
  fail(`output top-level keys [${topLevelKeys}] miss [${missingKeys}] or repeat one`);
}
if (!isDeepStrictEqual([...sessionRanges.keys()].sort(), placeholderKeys)) {
  fail("output babe_sessions keys differ from the placeholder's");
}
const outHandle = await open(outPath, "r");
for (const [key, [start, end]] of sessionRanges) {
  // Smallest real session is megabytes; a "00" literal is 4 bytes.
  if (end - start <= PLACEHOLDER_DECRYPTOR_HEX.length + 2) {
    fail(`output babe_sessions["${key}"] is still the placeholder`);
  }
  const head = Buffer.alloc(Math.min(66, end - start));
  await outHandle.read(head, 0, head.length, start);
  if (!/^"[0-9a-f]+/.test(head.toString("latin1"))) {
    fail(`output babe_sessions["${key}"] does not start as a hex string`);
  }
}
await outHandle.close();

console.log(`Wrote ${outPath}`);
console.log(`  size   ${outSize} bytes`);
console.log(`  sha256 ${hash.digest("hex")}`);
console.log(`  vault  ${placeholder.vault_id}`);
console.log(`  claimable_event_block_number ${placeholder.claimable_event_block_number}`);
console.log(`  babe_sessions ${sessionRanges.size} challengers joined`);
