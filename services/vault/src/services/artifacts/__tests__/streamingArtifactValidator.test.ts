import {
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import {
  ArtifactStreamValidator,
  MIN_DECRYPTOR_HEX_CHARS,
  type ArtifactStreamValidationResult,
} from "../streamingArtifactValidator";

const CHALLENGER_PUBKEY = "ab".repeat(32);
const OTHER_CHALLENGER_PUBKEY = "cd".repeat(32);

/**
 * Hex long enough to clear the artifact floor. Fixtures build from the
 * constant rather than a literal so the floor can move without a sweep.
 */
const VALID_HEX = "ab".repeat(MIN_DECRYPTOR_HEX_CHARS / 2);

const VALID_RESULT = {
  tx_graph_json: JSON.stringify({ nodes: [], edges: [] }),
  verifying_key_hex: "abcdef01",
  babe_sessions: {
    [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: VALID_HEX },
  },
};

const encoder = new TextEncoder();

/**
 * Feed `wire` through the validator. `chunkSize` slices the bytes so a test
 * can prove the verdict does not depend on where chunk boundaries land.
 */
function validate(
  wire: string,
  chunkSize?: number,
): ArtifactStreamValidationResult {
  const validator = new ArtifactStreamValidator();
  const bytes = encoder.encode(wire);
  const size = chunkSize ?? bytes.length;
  for (let offset = 0; offset < bytes.length; offset += size) {
    validator.update(bytes.subarray(offset, offset + size));
  }
  return validator.finish();
}

/**
 * Feed raw bytes through the validator. `validate` goes through TextEncoder,
 * which cannot emit invalid UTF-8 (lone surrogates come out as U+FFFD), so
 * encoding-level cases have to build the byte array by hand.
 */
function validateBytes(bytes: Uint8Array): ArtifactStreamValidationResult {
  const validator = new ArtifactStreamValidator();
  validator.update(bytes);
  return validator.finish();
}

/** Splice a raw byte into `wire` at the placeholder character. */
function withRawByte(
  wire: string,
  placeholder: string,
  raw: number,
): Uint8Array {
  const index = wire.indexOf(placeholder);
  const head = encoder.encode(wire.slice(0, index));
  const tail = encoder.encode(wire.slice(index + placeholder.length));
  const bytes = new Uint8Array(head.length + 1 + tail.length);
  bytes.set(head, 0);
  bytes[head.length] = raw;
  bytes.set(tail, head.length + 1);
  return bytes;
}

function envelope(result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 7, result });
}

describe("ArtifactStreamValidator — accepts well-formed responses", () => {
  it("returns the parsed payload for a valid envelope", () => {
    const { result, txGraph } = validate(envelope(VALID_RESULT));

    expect(result.verifying_key_hex).toBe("abcdef01");
    expect(Object.keys(result.babe_sessions)).toEqual([CHALLENGER_PUBKEY]);
    expect(txGraph).toEqual({ nodes: [], edges: [] });
  });

  it("accepts result fields in any order", () => {
    const reordered = JSON.stringify({
      result: {
        babe_sessions: VALID_RESULT.babe_sessions,
        verifying_key_hex: VALID_RESULT.verifying_key_hex,
        tx_graph_json: VALID_RESULT.tx_graph_json,
      },
      id: 7,
      jsonrpc: "2.0",
    });

    expect(() => validate(reordered)).not.toThrow();
  });

  it("accepts a null top-level error alongside a valid result", () => {
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      error: null,
      result: VALID_RESULT,
    });

    expect(() => validate(wire)).not.toThrow();
  });

  it("accepts multiple challenger sessions", () => {
    const { result } = validate(
      envelope({
        ...VALID_RESULT,
        babe_sessions: {
          [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: VALID_HEX },
          [OTHER_CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: VALID_HEX },
        },
      }),
    );

    expect(Object.keys(result.babe_sessions).sort()).toEqual(
      [CHALLENGER_PUBKEY, OTHER_CHALLENGER_PUBKEY].sort(),
    );
  });

  it("ignores an `error` key nested inside the result body", () => {
    const wire = envelope({
      ...VALID_RESULT,
      tx_graph_json: JSON.stringify({ error: { code: -1 } }),
    });

    expect(() => validate(wire)).not.toThrow();
  });

  it("accepts whitespace-formatted (pretty-printed) responses", () => {
    const wire = JSON.stringify(
      { jsonrpc: "2.0", id: 7, result: VALID_RESULT },
      null,
      2,
    );

    expect(() => validate(wire)).not.toThrow();
  });

  it("returns only a bounded prefix of each decryptor_artifacts_hex value", () => {
    const longHex = "ab".repeat(MIN_DECRYPTOR_HEX_CHARS);
    const { result } = validate(
      envelope({
        ...VALID_RESULT,
        babe_sessions: {
          [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: longHex },
        },
      }),
    );

    // The full value is never buffered — the skeleton carries a real prefix
    // of what streamed past, not the whole value.
    expect(
      result.babe_sessions[CHALLENGER_PUBKEY].decryptor_artifacts_hex,
    ).toHaveLength(64);
    expect(
      longHex.startsWith(
        result.babe_sessions[CHALLENGER_PUBKEY].decryptor_artifacts_hex,
      ),
    ).toBe(true);
  });
});

describe("ArtifactStreamValidator — chunk boundaries", () => {
  // tx_graph_json is JSON-inside-a-JSON-string, so its content reaches the
  // wire double-escaped. This fixture additionally carries a raw multi-byte
  // character (✓) and a literal \uXXXX escape — the é is rewritten to its
  // escape form below, which is an equivalent encoding of the same document.
  // Both are places a naive byte scanner or a per-chunk TextDecoder breaks.
  const TX_GRAPH = { note: 'café ✓ "quoted" back\\slash' };
  const ESCAPED_WIRE = envelope({
    ...VALID_RESULT,
    tx_graph_json: JSON.stringify(TX_GRAPH),
  }).replace("é", "\\u00e9");

  it("decodes escapes and multi-byte characters in one chunk", () => {
    expect(ESCAPED_WIRE).toContain("\\u00e9");
    expect(validate(ESCAPED_WIRE).txGraph).toEqual(TX_GRAPH);
  });

  it("reaches the identical verdict when fed one byte at a time", () => {
    expect(validate(ESCAPED_WIRE, 1).txGraph).toEqual(TX_GRAPH);
  });

  it("splits a long hex value across chunks without losing bytes", () => {
    const wire = envelope({
      ...VALID_RESULT,
      babe_sessions: {
        [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: VALID_HEX },
      },
    });

    // Chunked at a size that lands mid-value repeatedly; a byte lost at a
    // boundary would drop the total under the floor and reject.
    expect(() => validate(wire, 7)).not.toThrow();
  });
});

describe("ArtifactStreamValidator — rejects malformed documents", () => {
  it("rejects a stream truncated mid-hex", () => {
    const wire = envelope(VALID_RESULT);
    const truncated = wire.slice(0, wire.length - 20);

    expect(() => validate(truncated)).toThrow(VpResponseValidationError);
  });

  it("rejects a stream truncated at the final closing brace", () => {
    const wire = envelope(VALID_RESULT);

    expect(() => validate(wire.slice(0, -1))).toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects an empty body", () => {
    expect(() => validate("")).toThrow(VpResponseValidationError);
  });

  it("rejects non-JSON garbage", () => {
    expect(() => validate("<html>gateway timeout</html>")).toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects a top-level value that is not an object", () => {
    expect(() => validate("[1,2,3]")).toThrow(VpResponseValidationError);
  });

  it("rejects trailing content after the top-level value", () => {
    expect(() => validate(`${envelope(VALID_RESULT)}{"more":1}`)).toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects a trailing comma", () => {
    expect(() =>
      validate(`{"jsonrpc":"2.0","result":${JSON.stringify(VALID_RESULT)},}`),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a malformed number", () => {
    expect(() =>
      validate(`{"id":01,"result":${JSON.stringify(VALID_RESULT)}}`),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a dangling exponent", () => {
    expect(() =>
      validate(`{"id":1e,"result":${JSON.stringify(VALID_RESULT)}}`),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an unescaped control character inside a string", () => {
    expect(() =>
      validate(`{"jsonrpc":"2.\n0","result":${JSON.stringify(VALID_RESULT)}}`),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an invalid string escape", () => {
    expect(() =>
      validate(`{"jsonrpc":"2\\q0","result":${JSON.stringify(VALID_RESULT)}}`),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a malformed \\u escape", () => {
    expect(() =>
      validate(
        `{"jsonrpc":"\\u00zz","result":${JSON.stringify(VALID_RESULT)}}`,
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects invalid UTF-8 in an untracked string value", () => {
    // The byte machine only rejects control characters, and untracked values
    // are discarded rather than decoded — so a lone 0x80 here used to reach
    // finish() and commit a bundle no strict JSON parser can read, while the
    // UI reported success. The validator claims the WHOLE document is
    // well-formed, and RFC 8259 makes UTF-8 part of that.
    expect(() =>
      validateBytes(
        withRawByte(
          `{"jsonrpc":"2@0","result":${JSON.stringify(VALID_RESULT)}}`,
          "@",
          0x80,
        ),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects invalid UTF-8 in an unknown forward-compat field", () => {
    expect(() =>
      validateBytes(
        withRawByte(
          `{"jsonrpc":"2.0","unknown_field":"a@b","result":${JSON.stringify(VALID_RESULT)}}`,
          "@",
          0x80,
        ),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("accepts valid multibyte UTF-8 in an untracked string value", () => {
    // The encoding check must not reject honest non-ASCII: only sequences
    // that are not valid UTF-8 at all.
    const { result } = validate(
      `{"jsonrpc":"2.0","note":"café ✓","result":${JSON.stringify(VALID_RESULT)}}`,
    );

    expect(result.verifying_key_hex).toBe(VALID_RESULT.verifying_key_hex);
  });

  it("rejects a mismatched bracket", () => {
    expect(() =>
      validate(`{"result":${JSON.stringify(VALID_RESULT)}]`),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an object key longer than the cap", () => {
    expect(() =>
      validate(
        `{"${"k".repeat(300)}":1,"result":${JSON.stringify(VALID_RESULT)}}`,
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a duplicate top-level result key", () => {
    const good = JSON.stringify(VALID_RESULT);
    expect(() => validate(`{"result":${good},"result":${good}}`)).toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects a duplicate key inside a session object", () => {
    const wire =
      `{"result":{"tx_graph_json":${JSON.stringify(VALID_RESULT.tx_graph_json)},` +
      `"verifying_key_hex":"abcdef01","babe_sessions":{"${CHALLENGER_PUBKEY}":` +
      `{"decryptor_artifacts_hex":"${VALID_HEX}","decryptor_artifacts_hex":"${VALID_HEX}"}}}}`;

    expect(() => validate(wire)).toThrow(VpResponseValidationError);
  });
});

describe("ArtifactStreamValidator — rejects invalid artifact payloads", () => {
  it("rejects a missing result", () => {
    expect(() => validate('{"jsonrpc":"2.0","id":7}')).toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects a null result", () => {
    expect(() => validate('{"jsonrpc":"2.0","id":7,"result":null}')).toThrow(
      VpResponseValidationError,
    );
  });

  it("rejects an empty result", () => {
    expect(() => validate(envelope({}))).toThrow(VpResponseValidationError);
  });

  it("rejects an empty tx_graph_json", () => {
    expect(() =>
      validate(envelope({ ...VALID_RESULT, tx_graph_json: "" })),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a tx_graph_json that is not valid JSON", () => {
    expect(() =>
      validate(envelope({ ...VALID_RESULT, tx_graph_json: "not json" })),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a tx_graph_json that parses to an array", () => {
    expect(() =>
      validate(envelope({ ...VALID_RESULT, tx_graph_json: "[]" })),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a tx_graph_json that parses to a number", () => {
    expect(() =>
      validate(envelope({ ...VALID_RESULT, tx_graph_json: "5" })),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a non-hex verifying_key_hex", () => {
    expect(() =>
      validate(envelope({ ...VALID_RESULT, verifying_key_hex: "zzzz" })),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects empty babe_sessions", () => {
    expect(() =>
      validate(envelope({ ...VALID_RESULT, babe_sessions: {} })),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a session keyed by something that is not a pubkey", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            "not-a-pubkey": { decryptor_artifacts_hex: "aabb" },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a session entry that is not an object", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: { [CHALLENGER_PUBKEY]: "aabb" },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a session with no decryptor_artifacts_hex", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: { [CHALLENGER_PUBKEY]: {} },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an empty decryptor_artifacts_hex", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "" },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a non-hex character in decryptor_artifacts_hex", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: `${VALID_HEX}zz` },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an escape sequence inside decryptor_artifacts_hex", () => {
    const wire =
      `{"result":{"tx_graph_json":${JSON.stringify(VALID_RESULT.tx_graph_json)},` +
      `"verifying_key_hex":"abcdef01","babe_sessions":{"${CHALLENGER_PUBKEY}":` +
      `{"decryptor_artifacts_hex":"${VALID_HEX}\\u0062b"}}}}`;

    expect(() => validate(wire)).toThrow(VpResponseValidationError);
  });

  it("rejects a token-sized decryptor_artifacts_hex", () => {
    // Charset, non-emptiness and even length all pass here. Without a floor
    // this is a structurally perfect, materially empty bundle that would earn
    // a download receipt.
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "ab" },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects a session one character below the artifact floor", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: {
              decryptor_artifacts_hex: "a".repeat(MIN_DECRYPTOR_HEX_CHARS - 2),
            },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects when only one of several sessions is undersized", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: VALID_HEX },
            [OTHER_CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "abcd" },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an odd-length decryptor_artifacts_hex", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: `${VALID_HEX}a` },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });
});

describe("ArtifactStreamValidator — JSON-RPC error envelopes", () => {
  it("throws JsonRpcError for an error envelope", () => {
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32000, message: "pegin not found" },
    });

    expect(() => validate(wire)).toThrow(JsonRpcError);
  });

  it("preserves the code, wire source, and structured data", () => {
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: -32001,
        message: "bearer expired",
        data: { kind: "auth_expired", retryAfterMs: 500 },
      },
    });

    try {
      validate(wire);
      expect.unreachable("expected a JsonRpcError");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      const rpcError = err as JsonRpcError;
      expect(rpcError.code).toBe(-32001);
      expect(rpcError.source).toBe("wire");
      expect(rpcError.data).toEqual({
        kind: "auth_expired",
        retryAfterMs: 500,
      });
    }
  });

  it("throws JsonRpcError when the error follows a valid result", () => {
    const wire = `{"jsonrpc":"2.0","result":${JSON.stringify(VALID_RESULT)},"error":{"code":-1,"message":"late"}}`;

    expect(() => validate(wire)).toThrow(JsonRpcError);
  });

  it("throws JsonRpcError when the error precedes a null result", () => {
    const wire =
      '{"jsonrpc":"2.0","error":{"code":-1,"message":"early"},"result":null}';

    expect(() => validate(wire)).toThrow(JsonRpcError);
  });

  it("throws JsonRpcError for an error envelope padded far past any prefix window", () => {
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32000, message: "x".repeat(10_000) },
    });

    expect(() => validate(wire)).toThrow(JsonRpcError);
  });

  it("falls back to a default code when the error object omits one", () => {
    const wire = '{"jsonrpc":"2.0","error":{"message":"no code"}}';

    expect(() => validate(wire)).toThrow(JsonRpcError);
  });

  it("rejects a top-level error that is neither null nor an object", () => {
    expect(() => validate('{"jsonrpc":"2.0","error":"boom"}')).toThrow(
      VpResponseValidationError,
    );
  });

  it("ignores a `result` key nested inside the error object", () => {
    const wire =
      '{"jsonrpc":"2.0","error":{"code":-1,"message":"m","data":{"result":{}}}}';

    expect(() => validate(wire)).toThrow(JsonRpcError);
  });
});

describe("ArtifactStreamValidator — reports the result span", () => {
  /**
   * Feed `wire` in fixed-size chunks and concatenate the spans the validator
   * reports, reproducing what the download service writes to disk.
   */
  function spannedText(wire: string, chunkSize?: number): string {
    const validator = new ArtifactStreamValidator();
    const bytes = encoder.encode(wire);
    const size = chunkSize ?? bytes.length;
    let out = "";
    for (let offset = 0; offset < bytes.length; offset += size) {
      const chunk = bytes.subarray(offset, offset + size);
      const span = validator.update(chunk);
      if (span) {
        out += new TextDecoder().decode(chunk.subarray(span.start, span.end));
      }
    }
    validator.finish();
    return out;
  }

  it("spans exactly the result value's source", () => {
    expect(spannedText(envelope(VALID_RESULT))).toBe(
      JSON.stringify(VALID_RESULT),
    );
  });

  it("reports the same span however the bytes are chunked", () => {
    const wire = envelope(VALID_RESULT);
    const expected = JSON.stringify(VALID_RESULT);

    // Size 1 puts every structural byte on its own chunk boundary, which is
    // where an off-by-one in the start/end offsets would show up.
    for (const chunkSize of [1, 2, 5, 64, 1024]) {
      expect(spannedText(wire, chunkSize)).toBe(expected);
    }
  });

  it("spans the result wherever it sits among the envelope's keys", () => {
    const resultFirst = JSON.stringify({
      result: VALID_RESULT,
      jsonrpc: "2.0",
      id: 7,
    });

    expect(spannedText(resultFirst, 3)).toBe(JSON.stringify(VALID_RESULT));
  });

  it("excludes a sibling key whose value nests braces", () => {
    // A nested object after `result` closes must not reopen the span.
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      result: VALID_RESULT,
      meta: { nested: { deeper: [1, 2, 3] } },
      id: 7,
    });

    expect(spannedText(wire, 11)).toBe(JSON.stringify(VALID_RESULT));
  });

  it("reports no span for an envelope it rejects before result", () => {
    const validator = new ArtifactStreamValidator();

    expect(validator.update(encoder.encode('{"jsonrpc":"2.0","id":7,'))).toBe(
      null,
    );
  });
});
