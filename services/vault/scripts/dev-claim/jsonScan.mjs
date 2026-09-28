// Streaming JSON structure scanner for files too large for JSON.parse (the
// vault provider's depositor-claimer artifacts response is ~1.4 GB, almost
// all of it hex inside `babe_sessions`). Reports the byte range of every
// value down to MAX_REPORTED_DEPTH without materializing any of them.
//
// Dev-only tooling for the delegated-claim devnet run; never shipped.

import { createReadStream } from "node:fs";

const CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_REPORTED_DEPTH = 3;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;
const OPEN_ARRAY = 0x5b;
const CLOSE_ARRAY = 0x5d;
const COMMA = 0x2c;
const COLON = 0x3a;

function isWhitespace(byte) {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}

/**
 * Scans `source` (a file path, or a Buffer) and calls
 * `onValue({ path, start, end })` for every value at depth 1..3, where `path`
 * is the list of object keys / array indices leading to it and
 * `[start, end)` is its byte range in the source.
 *
 * @returns the total byte length scanned
 */
export async function scanJson(source, onValue) {
  // Each frame: { kind: "object" | "array", key, index, expectKey }
  const stack = [];
  let offset = 0;
  let inString = false;
  let stringIsKey = false;
  let pendingEscape = false;
  let keyBytes = [];
  let valueStart = -1; // start of the string or primitive value in progress
  let primitiveInProgress = false;
  const openStarts = []; // start offsets of the open containers, parallel to stack
  let rootSeen = false;

  const currentPath = () =>
    stack.map((frame) => (frame.kind === "object" ? frame.key : frame.index));

  const emit = (start, end) => {
    const depth = stack.length;
    if (depth >= 1 && depth <= MAX_REPORTED_DEPTH) {
      onValue({ path: currentPath(), start, end });
    }
  };

  const endPrimitive = (at) => {
    if (!primitiveInProgress) return;
    primitiveInProgress = false;
    emit(valueStart, at);
  };

  const consume = (buf) => {
    let i = 0;
    const len = buf.length;
    while (i < len) {
      if (inString) {
        if (pendingEscape) {
          pendingEscape = false;
          if (stringIsKey) keyBytes.push(buf[i]);
          i += 1;
          continue;
        }
        const quote = buf.indexOf(QUOTE, i);
        const searchEnd = quote === -1 ? len : quote;
        const backslash = buf.indexOf(BACKSLASH, i);
        if (backslash !== -1 && backslash < searchEnd) {
          if (stringIsKey) {
            for (let k = i; k <= backslash; k += 1) keyBytes.push(buf[k]);
          }
          if (backslash + 1 < len) {
            if (stringIsKey) keyBytes.push(buf[backslash + 1]);
            i = backslash + 2;
          } else {
            pendingEscape = true;
            i = len;
          }
          continue;
        }
        if (quote === -1) {
          if (stringIsKey) for (let k = i; k < len; k += 1) keyBytes.push(buf[k]);
          i = len;
          continue;
        }
        if (stringIsKey) {
          for (let k = i; k < quote; k += 1) keyBytes.push(buf[k]);
          const frame = stack[stack.length - 1];
          frame.key = Buffer.from(keyBytes).toString("utf8");
          frame.expectKey = false;
          keyBytes = [];
        } else {
          emit(valueStart, offset + quote + 1);
        }
        inString = false;
        i = quote + 1;
        continue;
      }

      const byte = buf[i];
      const at = offset + i;
      if (primitiveInProgress) {
        if (
          byte === COMMA ||
          byte === CLOSE_OBJECT ||
          byte === CLOSE_ARRAY ||
          isWhitespace(byte)
        ) {
          endPrimitive(at);
        } else {
          i += 1;
          continue;
        }
      }
      if (isWhitespace(byte) || byte === COLON) {
        i += 1;
        continue;
      }
      const top = stack[stack.length - 1];
      if (byte === QUOTE) {
        inString = true;
        stringIsKey = top !== undefined && top.kind === "object" && top.expectKey;
        valueStart = at;
      } else if (byte === OPEN_OBJECT || byte === OPEN_ARRAY) {
        if (stack.length === 0) {
          if (rootSeen) throw new Error(`Second top-level value at byte ${at}`);
          rootSeen = true;
        }
        openStarts.push(at);
        stack.push({
          kind: byte === OPEN_OBJECT ? "object" : "array",
          key: undefined,
          index: 0,
          expectKey: byte === OPEN_OBJECT,
        });
      } else if (byte === CLOSE_OBJECT || byte === CLOSE_ARRAY) {
        const start = openStarts.pop();
        stack.pop();
        if (start === undefined) throw new Error(`Unbalanced close at byte ${at}`);
        emit(start, at + 1);
      } else if (byte === COMMA) {
        if (top === undefined) throw new Error(`Comma outside any container at byte ${at}`);
        if (top.kind === "object") top.expectKey = true;
        else top.index += 1;
      } else {
        primitiveInProgress = true;
        valueStart = at;
      }
      i += 1;
    }
    offset += len;
  };

  if (Buffer.isBuffer(source)) {
    consume(source);
  } else {
    for await (const chunk of createReadStream(source, {
      highWaterMark: CHUNK_BYTES,
    })) {
      consume(chunk);
    }
  }
  endPrimitive(offset);
  if (stack.length !== 0 || inString) {
    throw new Error(`Truncated JSON: ${stack.length} container(s) still open at EOF`);
  }
  return offset;
}
