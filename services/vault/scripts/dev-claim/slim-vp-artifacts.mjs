#!/usr/bin/env node
// Cuts the vault provider's depositor-claimer artifacts response (~1.4 GB)
// down to what the browser driver needs: the graph and the served verifying
// key, plus the byte range of `babe_sessions` so join-babe-sessions.mjs can
// splice the real sessions back in without parsing them.
//
// Usage: node slim-vp-artifacts.mjs <vp-artifacts.json> <out.slim.json>
//
// Dev-only tooling for the delegated-claim devnet run; never shipped.

import { createHash } from "node:crypto";
import { open, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { scanJson } from "./jsonScan.mjs";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error("Usage: node slim-vp-artifacts.mjs <vp-artifacts.json> <out.slim.json>");
  process.exit(1);
}
const inputPath = resolve(inputArg);

const ranges = new Map(); // top-level key -> [start, end)
const challengers = [];
const sessionFields = new Map(); // challenger -> Set of field names

const scanStartedAt = Date.now();
const size = await scanJson(inputPath, ({ path, start, end }) => {
  if (path.length === 1) ranges.set(path[0], [start, end]);
  if (path.length === 2 && path[0] === "babe_sessions") challengers.push(path[1]);
  if (path.length === 3 && path[0] === "babe_sessions") {
    if (!sessionFields.has(path[1])) sessionFields.set(path[1], new Set());
    sessionFields.get(path[1]).add(path[2]);
  }
});
console.log(`Scanned ${size} bytes in ${((Date.now() - scanStartedAt) / 1000).toFixed(1)}s`);

for (const key of ["tx_graph_json", "verifying_key_hex", "babe_sessions"]) {
  if (!ranges.has(key)) throw new Error(`${inputPath} has no top-level "${key}"`);
}
if (challengers.length === 0) throw new Error("babe_sessions is empty");
for (const challenger of challengers) {
  const fields = [...(sessionFields.get(challenger) ?? [])];
  if (fields.length !== 1 || fields[0] !== "decryptor_artifacts_hex") {
    throw new Error(
      `babe_sessions["${challenger}"] has fields [${fields.join(", ")}], expected only decryptor_artifacts_hex`,
    );
  }
}

const handle = await open(inputPath, "r");
const readRange = async ([start, end]) => {
  const buf = Buffer.alloc(end - start);
  await handle.read(buf, 0, buf.length, start);
  return buf.toString("utf8");
};
const graphLiteral = await readRange(ranges.get("tx_graph_json"));
const verifyingKeyLiteral = await readRange(ranges.get("verifying_key_hex"));
await handle.close();

const txGraphJson = JSON.parse(graphLiteral);
const verifyingKeyHex = JSON.parse(verifyingKeyLiteral);
if (typeof txGraphJson !== "string") throw new Error("tx_graph_json is not a string");
if (!/^([0-9a-f]{2})+$/i.test(verifyingKeyHex)) {
  throw new Error("verifying_key_hex is not even-length hex");
}
const graph = JSON.parse(txGraphJson);
const prePeginOutpoint = graph?.pegin_tx?.tx?.input?.[0]?.previous_output;
if (typeof prePeginOutpoint !== "string") {
  throw new Error("tx_graph_json has no pegin_tx.tx.input[0].previous_output");
}

const { mtimeMs } = await stat(inputPath);
const [babeStart, babeEnd] = ranges.get("babe_sessions");
const source = {
  path: inputPath,
  size,
  mtimeMs,
  babeStart,
  babeEnd,
  graphSha256: createHash("sha256").update(txGraphJson).digest("hex"),
};
// Literals are copied verbatim, so the graph string is byte-identical to
// the one the vault provider served.
const slim =
  `{"tx_graph_json":${graphLiteral},` +
  `"verifying_key_hex":${verifyingKeyLiteral},` +
  `"babe_challengers":${JSON.stringify(challengers)},` +
  `"source":${JSON.stringify(source)}}`;
await writeFile(resolve(outputArg), slim);

console.log(`Pre-PegIn outpoint spent by the PegIn: ${prePeginOutpoint}`);
console.log(`Challengers with BaBe sessions: ${challengers.length}`);
console.log(`babe_sessions bytes: [${babeStart}, ${babeEnd})`);
console.log(`Wrote ${resolve(outputArg)} (${slim.length} bytes)`);
