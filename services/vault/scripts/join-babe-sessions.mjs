#!/usr/bin/env node
/**
 * Splice the `babe_sessions` object from a downloaded vault-provider bundle
 * into the artifacts.json the claim harness assembled, producing the file
 * `vaultd vp wt` reads.
 *
 * The harness writes the file with either no `babe_sessions`, an empty map,
 * or the browser's placeholder map (one `"00"` entry per challenger, which
 * the pinned WASM needs to assemble and verify — #2598); the real sessions
 * are hundreds of megabytes per challenger and never enter the page. The
 * bundle is ~1.4 GB, past V8's string limit. So neither file is parsed whole:
 * the small artifacts file is split around its (absent, empty or placeholder)
 * babe_sessions entry, and the bundle is scanned byte by byte for the
 * top-level `babe_sessions` value, which is streamed straight into the
 * output. Only one read buffer is ever held.
 *
 * Usage:
 *   node scripts/join-babe-sessions.mjs --artifacts artifacts.json \
 *     --bundle babylon-vault-artifacts-<txid8>.json --out artifacts.joined.json
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const BABE_SESSIONS_KEY = "babe_sessions";
const DEFAULT_HIGH_WATER_MARK = 1024 * 1024;
/** Longest key the scanner keeps; longer keys are not `babe_sessions` and are dropped. */
const MAX_KEY_BYTES = 256;

const BYTE_QUOTE = 0x22;
const BYTE_BACKSLASH = 0x5c;
const BYTE_COLON = 0x3a;
const BYTE_COMMA = 0x2c;
const BYTE_OPEN_BRACE = 0x7b;
const BYTE_CLOSE_BRACE = 0x7d;
const BYTE_OPEN_BRACKET = 0x5b;
const BYTE_CLOSE_BRACKET = 0x5d;
/** Depth of the bundle's top-level object; its keys live here. */
const TOP_LEVEL_DEPTH = 1;

/** Mirrors `PLACEHOLDER_DECRYPTOR_ARTIFACTS_HEX` in src/dev/claimHarness/babeSessionsPlaceholder.ts. */
const PLACEHOLDER_DECRYPTOR_ARTIFACTS_HEX = "00";

/** `{}` or the browser's placeholder map: the two "not joined yet" shapes. Anything else is real sessions. */
function isUnjoinedSessions(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  return Object.values(value).every(
    (session) =>
      session !== null &&
      typeof session === "object" &&
      Object.keys(session).length === 1 &&
      session.decryptor_artifacts_hex === PLACEHOLDER_DECRYPTOR_ARTIFACTS_HEX,
  );
}

/**
 * Split the small artifacts file into the bytes before and after where the
 * sessions go. Byte-level on purpose: re-serialising would reformat a file
 * whose other fields are signatures and a graph nobody here re-checks.
 */
export function splitArtifactsForJoin(artifactsText) {
  const parsed = JSON.parse(artifactsText);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("artifacts.json is not a JSON object");
  }
  const existing = parsed[BABE_SESSIONS_KEY];
  if (existing !== undefined && !isUnjoinedSessions(existing)) {
    throw new Error(
      "artifacts.json already carries real babe_sessions; refusing to overwrite them",
    );
  }

  const trimmed = artifactsText.trimEnd();
  if (!trimmed.endsWith("}")) {
    throw new Error("artifacts.json does not end with a closing brace");
  }

  if (existing !== undefined) {
    // The scanner that finds the value in the bundle finds it here too; the
    // SDK's file is small, so one chunk covers it, and nesting or escaped
    // copies inside tx_graph cannot fool a depth-tracking scan.
    const bytes = Buffer.from(trimmed, "utf8");
    const scanner = new BabeSessionsSpanScanner();
    const span = scanner.scan(bytes);
    if (span === null || !scanner.done) {
      throw new Error(
        "artifacts.json has no complete top-level babe_sessions value",
      );
    }
    return {
      head: bytes.subarray(0, span.start).toString("utf8"),
      tail: bytes.subarray(span.end).toString("utf8"),
    };
  }

  const body = trimmed.slice(0, -1);
  const separator = body.trimEnd().endsWith("{") ? "" : ",";
  return { head: `${body}${separator}"${BABE_SESSIONS_KEY}":`, tail: "}" };
}

/**
 * Byte-level scanner for the top-level `babe_sessions` value of a JSON
 * object. Tracks strings (so braces inside the hex payloads and inside
 * `tx_graph_json` are ignored), depth, and which top-level string is a key.
 * `scan()` returns, per chunk, the byte range that belongs to the value.
 */
class BabeSessionsSpanScanner {
  #depth = 0;
  #inString = false;
  #escaped = false;
  /** At the top level, the string after `{` or `,` is a key, after `:` a value. */
  #nextStringIsKey = false;
  #keyBytes = [];
  #keyTooLong = false;
  #valueIsTarget = false;
  #capturing = false;
  done = false;

  scan(chunk) {
    let spanStart = this.#capturing ? 0 : -1;

    for (let index = 0; index < chunk.length; index++) {
      const byte = chunk[index];

      if (this.#inString) {
        if (this.#escaped) {
          this.#escaped = false;
        } else if (byte === BYTE_BACKSLASH) {
          this.#escaped = true;
        } else if (byte === BYTE_QUOTE) {
          this.#inString = false;
          if (this.#nextStringIsKey && this.#depth === TOP_LEVEL_DEPTH) {
            const key = this.#keyTooLong
              ? null
              : Buffer.from(this.#keyBytes).toString("utf8");
            this.#valueIsTarget = key === BABE_SESSIONS_KEY;
          }
        } else if (this.#nextStringIsKey && this.#depth === TOP_LEVEL_DEPTH) {
          if (this.#keyBytes.length < MAX_KEY_BYTES) this.#keyBytes.push(byte);
          else this.#keyTooLong = true;
        }
        continue;
      }

      switch (byte) {
        case BYTE_QUOTE:
          this.#inString = true;
          this.#keyBytes = [];
          this.#keyTooLong = false;
          break;
        case BYTE_COLON:
          if (this.#depth === TOP_LEVEL_DEPTH) this.#nextStringIsKey = false;
          break;
        case BYTE_COMMA:
          if (this.#depth === TOP_LEVEL_DEPTH) {
            this.#nextStringIsKey = true;
            this.#valueIsTarget = false;
          }
          break;
        case BYTE_OPEN_BRACE:
          if (
            this.#depth === TOP_LEVEL_DEPTH &&
            this.#valueIsTarget &&
            !this.#capturing
          ) {
            this.#capturing = true;
            spanStart = index;
          }
          this.#depth++;
          if (this.#depth === TOP_LEVEL_DEPTH) this.#nextStringIsKey = true;
          break;
        case BYTE_OPEN_BRACKET:
          this.#depth++;
          break;
        case BYTE_CLOSE_BRACE:
        case BYTE_CLOSE_BRACKET:
          this.#depth--;
          if (this.#capturing && this.#depth === TOP_LEVEL_DEPTH) {
            this.#capturing = false;
            this.done = true;
            return { start: spanStart, end: index + 1 };
          }
          break;
        default:
          break;
      }
    }

    if (spanStart < 0) return null;
    return { start: spanStart, end: chunk.length };
  }
}

async function* joinedChunks(
  { artifactsText, bundlePath, highWaterMark },
  stats,
) {
  const { head, tail } = splitArtifactsForJoin(artifactsText);
  yield Buffer.from(head, "utf8");

  const scanner = new BabeSessionsSpanScanner();
  for await (const chunk of createReadStream(bundlePath, { highWaterMark })) {
    stats.maxChunkBytes = Math.max(stats.maxChunkBytes, chunk.length);
    const span = scanner.scan(chunk);
    if (span) {
      stats.babeSessionsBytes += span.end - span.start;
      yield chunk.subarray(span.start, span.end);
    }
    if (scanner.done) break;
  }
  if (!scanner.done) {
    throw new Error("bundle has no complete top-level babe_sessions object");
  }

  yield Buffer.from(tail, "utf8");
}

/**
 * @returns `maxChunkBytes`, the largest buffer held at once (bounded by
 *   `highWaterMark`), and `babeSessionsBytes`, the size of the spliced value.
 */
export async function joinBabeSessions({
  artifactsPath,
  bundlePath,
  outPath,
  highWaterMark = DEFAULT_HIGH_WATER_MARK,
}) {
  const stats = { maxChunkBytes: 0, babeSessionsBytes: 0 };
  const artifactsText = await readFile(artifactsPath, "utf8");
  // Written beside the target and renamed on success, so a refusal or a
  // truncated bundle never leaves a half-written file under the final name.
  const partialPath = `${outPath}.partial`;
  try {
    await pipeline(
      Readable.from(
        joinedChunks({ artifactsText, bundlePath, highWaterMark }, stats),
      ),
      createWriteStream(partialPath),
    );
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
  await rename(partialPath, outPath);
  return stats;
}

function isCliEntry() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isCliEntry()) {
  const { values } = parseArgs({
    options: {
      artifacts: { type: "string" },
      bundle: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.artifacts || !values.bundle || !values.out) {
    console.error(
      "usage: join-babe-sessions.mjs --artifacts <artifacts.json> --bundle <bundle.json> --out <joined.json>",
    );
    process.exit(1);
  }
  const stats = await joinBabeSessions({
    artifactsPath: values.artifacts,
    bundlePath: values.bundle,
    outPath: values.out,
  });
  console.log(
    `wrote ${values.out}: babe_sessions ${stats.babeSessionsBytes} bytes, max buffer ${stats.maxChunkBytes} bytes`,
  );
}
