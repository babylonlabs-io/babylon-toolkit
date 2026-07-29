import {
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import {
  ArtifactStreamValidator,
  type ArtifactStreamValidationResult,
} from "../streamingArtifactValidator";

const CHALLENGER_PUBKEY = "ab".repeat(32);
const OTHER_CHALLENGER_PUBKEY = "cd".repeat(32);

const VALID_RESULT = {
  tx_graph_json: JSON.stringify({ nodes: [], edges: [] }),
  verifying_key_hex: "abcdef01",
  babe_sessions: {
    [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "aabbccdd" },
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

function envelope(result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 7, result });
}

describe("ArtifactStreamValidator — accepts well-formed responses", () => {
  it("returns the parsed payload for a valid envelope", () => {
    const { result, txGraph, sessionHexLengths } = validate(
      envelope(VALID_RESULT),
    );

    expect(result.verifying_key_hex).toBe("abcdef01");
    expect(Object.keys(result.babe_sessions)).toEqual([CHALLENGER_PUBKEY]);
    expect(txGraph).toEqual({ nodes: [], edges: [] });
    expect(sessionHexLengths).toEqual({ [CHALLENGER_PUBKEY]: 8 });
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

  it("accepts multiple challenger sessions and reports each hex length", () => {
    const { sessionHexLengths } = validate(
      envelope({
        ...VALID_RESULT,
        babe_sessions: {
          [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "aabb" },
          [OTHER_CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "00112233" },
        },
      }),
    );

    expect(sessionHexLengths).toEqual({
      [CHALLENGER_PUBKEY]: 4,
      [OTHER_CHALLENGER_PUBKEY]: 8,
    });
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
    const longHex = "ab".repeat(500);
    const { result, sessionHexLengths } = validate(
      envelope({
        ...VALID_RESULT,
        babe_sessions: {
          [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: longHex },
        },
      }),
    );

    // The full value is never buffered — the skeleton carries a real prefix
    // while the observed length is reported separately.
    expect(
      result.babe_sessions[CHALLENGER_PUBKEY].decryptor_artifacts_hex,
    ).toHaveLength(64);
    expect(
      longHex.startsWith(
        result.babe_sessions[CHALLENGER_PUBKEY].decryptor_artifacts_hex,
      ),
    ).toBe(true);
    expect(sessionHexLengths[CHALLENGER_PUBKEY]).toBe(1000);
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
    const longHex = "ab".repeat(5_000);
    const wire = envelope({
      ...VALID_RESULT,
      babe_sessions: {
        [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: longHex },
      },
    });

    expect(validate(wire, 7).sessionHexLengths[CHALLENGER_PUBKEY]).toBe(10_000);
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
      `{"decryptor_artifacts_hex":"aabb","decryptor_artifacts_hex":"ccdd"}}}}`;

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
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "aabbzz" },
          },
        }),
      ),
    ).toThrow(VpResponseValidationError);
  });

  it("rejects an escape sequence inside decryptor_artifacts_hex", () => {
    const wire =
      `{"result":{"tx_graph_json":${JSON.stringify(VALID_RESULT.tx_graph_json)},` +
      `"verifying_key_hex":"abcdef01","babe_sessions":{"${CHALLENGER_PUBKEY}":` +
      `{"decryptor_artifacts_hex":"aa\\u0062b"}}}}`;

    expect(() => validate(wire)).toThrow(VpResponseValidationError);
  });

  it("rejects an odd-length decryptor_artifacts_hex", () => {
    expect(() =>
      validate(
        envelope({
          ...VALID_RESULT,
          babe_sessions: {
            [CHALLENGER_PUBKEY]: { decryptor_artifacts_hex: "aab" },
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
