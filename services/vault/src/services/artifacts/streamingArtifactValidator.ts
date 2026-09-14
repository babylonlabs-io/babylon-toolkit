/**
 * Single-pass streaming validator for the depositor-claimer artifact response.
 *
 * The recovery bundle is ~1.3 GB, so it can never be turned into a string or a
 * contiguous buffer — `JSON.parse` on a body that size exceeds V8's maximum
 * string length and freezes the tab. This validator consumes the response one
 * chunk at a time and proves the whole document is a well-formed JSON-RPC
 * success envelope wrapping a schema-valid artifact payload, while holding
 * only a few KB of state.
 *
 * It also reports, per chunk, which bytes fall inside the envelope's `result`
 * value, so the caller can save the payload alone. The envelope is transport
 * framing: `jsonrpc` and `id` mean nothing on disk, and the unwrapped file is
 * the layout every consumer already expects — `tools/artifact-downloader` in
 * btc-vault writes exactly that shape, and `docs/delegated_claim.md` treats it
 * as the starting point for building the watchtower's `artifacts.json`. Since
 * the machine already knows the document's structure, the span costs a byte
 * offset rather than a second pass.
 *
 * Why a byte-level machine rather than an incremental `TextDecoder`: every
 * JSON structural character is ASCII, and every byte of a multi-byte UTF-8
 * sequence is >= 0x80, so a byte scanner can never mistake payload text for
 * structure. Decoding to strings first would allocate ~1.3 GB of transient
 * strings for no benefit. The small fields that we *do* need as text are
 * captured as raw JSON source (quotes included) and handed to `JSON.parse`
 * once, so escape and surrogate handling stays V8's job rather than ours.
 *
 * Two properties this buys that the previous prefix-scan could not:
 * - **Truncation is caught.** The vault-provider proxy signals a mid-stream
 *   backend failure by destroying the connection, which yields a syntactically
 *   incomplete document rather than an error envelope. `finish()` rejects
 *   unless the parse reached the closing brace.
 * - **Key order is irrelevant.** The proxy only guarantees field ordering on
 *   its gRPC path (off by default); otherwise the body is a byte-for-byte
 *   passthrough of the Rust serializer, and `babe_sessions` key order is
 *   explicitly unspecified. Nothing here depends on order.
 */

import {
  JSON_RPC_ERROR_CODES,
  JsonRpcError,
  type RequestDepositorClaimerArtifactsResponse,
  validateRequestDepositorClaimerArtifactsResponse,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { COPY } from "@/copy";

/**
 * Nesting limit. The envelope needs exactly four levels
 * (envelope -> result -> babe_sessions -> session), so this is ~8x headroom
 * for forward-compatible fields while bounding the frame stack against a
 * deeply nested payload designed to exhaust memory.
 */
const JSON_MAX_DEPTH = 32;

/**
 * Longest object key we will hold. The longest legitimate key is a 66-char
 * compressed pubkey; 256 leaves room for future field names without letting a
 * hostile payload stream an unbounded "key" into memory.
 */
const MAX_JSON_KEY_BYTES = 256;

/**
 * Serialized TxGraph ceiling. A real vault-devnet bundle (4 vault keepers + 4
 * universal challengers) carries a 1.79 MB graph, and the graph grows roughly
 * with the challenger count, so 32 MiB covers an order of magnitude more
 * challengers while still bounding the allocation to a rounding error against
 * the ~1.4 GB body.
 */
const MAX_TX_GRAPH_JSON_BYTES = 32 * 1024 * 1024;

/**
 * Groth16 verifying key ceiling. The measured ark-serialized key is 528 hex
 * characters (264 bytes) and is fixed-size for a given circuit, so 64 KiB is
 * ~124x headroom for a circuit change.
 */
const MAX_VERIFYING_KEY_HEX_BYTES = 64 * 1024;

/**
 * Challenger-count ceiling. A real bundle carries 8 sessions (4 local + 4
 * universal); 1024 is far above any plausible signer set and exists only to
 * stop an unbounded session map being used as a memory sink.
 */
const MAX_BABE_SESSIONS = 1024;

/**
 * A JSON-RPC error object is small by construction. Anything larger is not a
 * plausible honest error response, so we fail closed rather than buffer it.
 */
export const MAX_ERROR_VALUE_BYTES = 64 * 1024;

/**
 * Ceiling for string values we do not consume (`jsonrpc`, `id`, and any
 * forward-compatible field a future VP adds). They are discarded as they
 * stream, but the length is still bounded so an unknown field cannot be used
 * as an unbounded sink.
 */
const MAX_UNKNOWN_STRING_BYTES = 1024 * 1024;

/**
 * How much of each `decryptor_artifacts_hex` value is retained.
 *
 * The full values are hundreds of megabytes and are never buffered. This
 * prefix exists solely so the reconstructed skeleton carries a *real* hex
 * substring for the SDK validator to assert on — see `finish()`.
 */
const DECRYPTOR_HEX_PREVIEW_CHARS = 64;

/**
 * Smallest `decryptor_artifacts_hex` value that could plausibly be a BaBe
 * garbled-circuit artifact.
 *
 * Charset, non-emptiness and even length are all satisfied by a two-character
 * payload, so without a floor a provider can return a bundle that is
 * structurally perfect and materially empty — and it would earn a download
 * receipt. A measured vault-devnet session carries ~176,129,340 characters;
 * this floor sits ~2700x below that, leaving room for a smaller circuit while
 * making a token payload impossible.
 */
export const MIN_DECRYPTOR_HEX_CHARS = 64 * 1024;

/** Initial capacity for a growable capture buffer, doubled on demand. */
const CAPTURE_BUFFER_INITIAL_BYTES = 256;

// ASCII bytes the structural machine tests against.
const BYTE_TAB = 0x09;
const BYTE_LF = 0x0a;
const BYTE_CR = 0x0d;
const BYTE_SPACE = 0x20;
const BYTE_QUOTE = 0x22;
const BYTE_PLUS = 0x2b;
const BYTE_COMMA = 0x2c;
const BYTE_MINUS = 0x2d;
const BYTE_DOT = 0x2e;
const BYTE_ZERO = 0x30;
const BYTE_NINE = 0x39;
const BYTE_COLON = 0x3a;
const BYTE_UPPER_E = 0x45;
const BYTE_BACKSLASH = 0x5c;
const BYTE_OPEN_BRACKET = 0x5b;
const BYTE_CLOSE_BRACKET = 0x5d;
const BYTE_LOWER_E = 0x65;
const BYTE_LOWER_F = 0x66;
const BYTE_LOWER_N = 0x6e;
const BYTE_LOWER_T = 0x74;
const BYTE_LOWER_U = 0x75;
const BYTE_OPEN_BRACE = 0x7b;
const BYTE_CLOSE_BRACE = 0x7d;

/** Lowest byte that may appear unescaped inside a JSON string (RFC 8259). */
const MIN_UNESCAPED_STRING_BYTE = 0x20;

/** Lookup table for the hex fast path: 1 when the byte is `[0-9a-fA-F]`. */
const IS_HEX_BYTE = (() => {
  const table = new Uint8Array(256);
  for (const char of "0123456789abcdefABCDEF") {
    table[char.charCodeAt(0)] = 1;
  }
  return table;
})();

/** Escape characters permitted after a backslash inside a JSON string. */
const SIMPLE_ESCAPES = new Set<number>([
  BYTE_QUOTE,
  BYTE_BACKSLASH,
  0x2f, // /
  0x62, // b
  BYTE_LOWER_F,
  BYTE_LOWER_N,
  0x72, // r
  BYTE_LOWER_T,
]);

type ParserState =
  | "expect_value"
  | "expect_value_or_close"
  | "expect_key_or_close"
  | "expect_key"
  | "expect_colon"
  | "in_string"
  | "in_string_escape"
  | "in_string_unicode"
  | "in_number"
  | "in_literal"
  | "after_value"
  | "done";

type NumberState =
  | "minus"
  | "zero"
  | "int"
  | "frac_start"
  | "frac"
  | "exp_start"
  | "exp_sign"
  | "exp";

/** Number sub-states that may legally end the number. */
const ACCEPTING_NUMBER_STATES = new Set<NumberState>([
  "zero",
  "int",
  "frac",
  "exp",
]);

/** Where the string currently being scanned should go. */
type StringTarget =
  | "key"
  | "tx_graph_json"
  | "verifying_key_hex"
  | "decryptor_artifacts_hex"
  | "ignored";

interface Frame {
  kind: "object" | "array";
  /** Key whose value is currently being read; null inside arrays. */
  currentKey: string | null;
  /** Populated only for the four tracked object levels. */
  seenKeys: Set<string> | null;
}

/**
 * Half-open `[start, end)` offsets into the chunk just handed to
 * {@link ArtifactStreamValidator.update}, bounding the bytes that belong to
 * the envelope's `result` value.
 *
 * Offsets rather than a `subarray` view so the caller slices with its own
 * buffer type — the File System Access sink requires a view over a
 * non-shared `ArrayBuffer`, which a view produced here could not promise.
 */
export interface ResultByteSpan {
  /** Inclusive start offset within the chunk. */
  start: number;
  /** Exclusive end offset within the chunk. */
  end: number;
}

export interface ArtifactStreamValidationResult {
  /**
   * The reconstructed payload handed to the SDK validator. Its
   * `decryptor_artifacts_hex` values are verified prefixes, not full values —
   * see the note on `finish()`.
   */
  result: RequestDepositorClaimerArtifactsResponse;
  /** `tx_graph_json` parsed, already proven to be a JSON object. */
  txGraph: Record<string, unknown>;
}

/** Growable byte buffer for capturing small JSON source spans. */
class CaptureBuffer {
  private bytes = new Uint8Array(CAPTURE_BUFFER_INITIAL_BYTES);
  private length = 0;

  constructor(
    private readonly max: number,
    private readonly field: string,
  ) {}

  push(byte: number): void {
    if (this.length >= this.max) {
      throw new VpResponseValidationError(
        `Artifact response field "${this.field}" exceeds its ${this.max}-byte limit`,
      );
    }
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(
        Math.min(this.bytes.length * 2, this.max + 1),
      );
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = byte;
  }

  /** Decodes as strict UTF-8; invalid sequences are a validation failure. */
  decode(): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        this.bytes.subarray(0, this.length),
      );
    } catch {
      throw new VpResponseValidationError(
        `Artifact response field "${this.field}" is not valid UTF-8`,
      );
    }
  }
}

export class ArtifactStreamValidator {
  private state: ParserState = "expect_value";
  private readonly frames: Frame[] = [];

  private numberState: NumberState = "int";
  private literalExpected = "";
  private literalIndex = 0;
  private unicodeDigitsSeen = 0;

  private stringIsKey = false;
  private stringTarget: StringTarget = "ignored";
  private stringCapture: CaptureBuffer | null = null;
  private hexCount = 0;
  private hexPreview = "";

  private errorCapture: CaptureBuffer | null = null;

  private resultSeen = false;
  /**
   * Where the parse sits relative to the envelope's `result` value. Drives
   * the span {@link update} reports so the caller can persist the payload
   * without the JSON-RPC framing around it.
   */
  private resultCapture: "before" | "inside" | "after" = "before";
  private txGraphJson: string | null = null;
  private verifyingKeyHex: string | null = null;
  private babeSessionsSeen = false;
  private readonly sessionKeys: string[] = [];
  /** Per-challenger hex prefix, keyed by challenger pubkey. */
  private readonly sessionHex = new Map<string, string>();

  /**
   * Feed the next chunk of the response body.
   *
   * Returns the sub-range of *this* chunk that lies inside the envelope's
   * `result` value, or null when the chunk contributes none — see
   * {@link ResultByteSpan}. The caller writes only that range, so the saved
   * file is the artifact payload rather than the JSON-RPC envelope around it.
   *
   * Throws synchronously — `JsonRpcError` for a JSON-RPC error envelope,
   * `VpResponseValidationError` for anything malformed — so the caller can
   * abort the file write before the offending bytes are committed to disk.
   */
  update(chunk: Uint8Array): ResultByteSpan | null {
    // The result value occupies one contiguous span of the document, so a
    // chunk can only continue that span, open it, close it, or fall outside
    // it — never contribute two disjoint runs.
    let spanStart = this.resultCapture === "inside" ? 0 : -1;
    let spanEnd = -1;

    let index = 0;
    while (index < chunk.length) {
      // Hot path: inside a decryptor_artifacts_hex value, consume the run of
      // hex bytes with a table lookup per byte and never touch the structural
      // machine. This is where ~99.99% of the 1.3 GB is spent.
      if (
        this.state === "in_string" &&
        this.stringTarget === "decryptor_artifacts_hex"
      ) {
        const start = index;
        while (index < chunk.length && IS_HEX_BYTE[chunk[index]] === 1) {
          index++;
        }
        const consumed = index - start;
        if (consumed > 0) {
          this.hexCount += consumed;
          if (this.hexPreview.length < DECRYPTOR_HEX_PREVIEW_CHARS) {
            const wanted = DECRYPTOR_HEX_PREVIEW_CHARS - this.hexPreview.length;
            // Hex characters are ASCII, so a byte-wise slice is a safe decode.
            this.hexPreview += String.fromCharCode(
              ...chunk.subarray(start, start + Math.min(consumed, wanted)),
            );
          }
          continue;
        }
        // Not a hex byte: only the closing quote is legal here. Anything else
        // (including a backslash escape) means this is not a hex string.
        if (chunk[index] !== BYTE_QUOTE) {
          throw new VpResponseValidationError(
            "Artifact response contains a non-hex character in decryptor_artifacts_hex",
          );
        }
      }

      const byteIndex = index;
      const byte = chunk[index++];
      if (this.errorCapture !== null) {
        this.errorCapture.push(byte);
      }

      const wasInside = this.resultCapture === "inside";
      this.processByte(byte);

      if (this.resultCapture === "inside") {
        // Opening `{`: the span starts at this byte, inclusive.
        if (!wasInside) spanStart = byteIndex;
      } else if (wasInside) {
        // Closing `}`: the span ends after this byte, inclusive.
        spanEnd = index;
      }
    }

    if (spanStart < 0) return null;
    const end = spanEnd >= 0 ? spanEnd : chunk.length;
    return end > spanStart ? { start: spanStart, end } : null;
  }

  /**
   * Complete the parse and validate the reconstructed payload.
   *
   * Note for reviewers: the `decryptor_artifacts_hex` values on the returned
   * object are the first {@link DECRYPTOR_HEX_PREVIEW_CHARS} characters that
   * actually appeared on the wire, not the full values — those are hundreds of
   * megabytes and are deliberately never buffered. The properties the SDK
   * validator asserts about them (non-empty, hex charset) are enforced here
   * over *every* byte as it streams, so the prefix is a faithful stand-in and
   * not a fabricated placeholder. This is not proof the artifact bytes decrypt
   * correctly; that requires a BaBe verifier we do not have.
   */
  finish(): ArtifactStreamValidationResult {
    if (this.state !== "done") {
      throw new VpResponseValidationError(
        "Artifact response ended before its JSON document was complete (truncated stream)",
      );
    }
    if (!this.resultSeen) {
      throw new VpResponseValidationError(
        "Artifact response envelope is missing the result field",
      );
    }

    const babeSessions: Record<string, { decryptor_artifacts_hex: string }> =
      {};
    for (const pubkey of this.sessionKeys) {
      // A session that never produced a decryptor_artifacts_hex value yields
      // an empty entry, which the SDK validator rejects by name.
      babeSessions[pubkey] = {
        decryptor_artifacts_hex: this.sessionHex.get(pubkey) ?? "",
      };
    }

    // Typed `unknown` so the SDK validator's assertion signature is what
    // narrows it — the fields it checks are exactly the ones we may be
    // missing, and it owns those error messages.
    const skeleton: unknown = {
      tx_graph_json: this.txGraphJson,
      verifying_key_hex: this.verifyingKeyHex,
      babe_sessions: this.babeSessionsSeen ? babeSessions : undefined,
    };

    validateRequestDepositorClaimerArtifactsResponse(skeleton);

    const txGraph = parseTxGraphJson(skeleton.tx_graph_json);

    return { result: skeleton, txGraph };
  }

  private processByte(byte: number): void {
    switch (this.state) {
      case "in_string":
        this.consumeStringByte(byte);
        return;

      case "in_string_escape":
        if (byte === BYTE_LOWER_U) {
          this.unicodeDigitsSeen = 0;
          this.state = "in_string_unicode";
        } else if (SIMPLE_ESCAPES.has(byte)) {
          this.state = "in_string";
        } else {
          throw new VpResponseValidationError(
            "Artifact response contains an invalid string escape",
          );
        }
        this.stringCapture?.push(byte);
        return;

      case "in_string_unicode":
        if (IS_HEX_BYTE[byte] !== 1) {
          throw new VpResponseValidationError(
            "Artifact response contains a malformed \\u escape",
          );
        }
        this.stringCapture?.push(byte);
        if (++this.unicodeDigitsSeen === 4) {
          this.state = "in_string";
        }
        return;

      case "in_number":
        if (isValueTerminator(byte)) {
          if (!ACCEPTING_NUMBER_STATES.has(this.numberState)) {
            throw new VpResponseValidationError(
              "Artifact response contains a malformed number",
            );
          }
          this.state = "after_value";
          this.processByte(byte);
          return;
        }
        this.advanceNumber(byte);
        return;

      case "in_literal":
        if (byte !== this.literalExpected.charCodeAt(this.literalIndex)) {
          throw new VpResponseValidationError(
            "Artifact response contains a malformed JSON literal",
          );
        }
        if (++this.literalIndex === this.literalExpected.length) {
          this.state = "after_value";
        }
        return;

      case "expect_value":
      case "expect_value_or_close":
        if (isWhitespace(byte)) return;
        if (
          byte === BYTE_CLOSE_BRACKET &&
          this.state === "expect_value_or_close"
        ) {
          this.popFrame("array");
          return;
        }
        this.beginValue(byte);
        return;

      case "expect_key_or_close":
        if (isWhitespace(byte)) return;
        if (byte === BYTE_CLOSE_BRACE) {
          this.popFrame("object");
          return;
        }
        this.beginKey(byte);
        return;

      case "expect_key":
        if (isWhitespace(byte)) return;
        // Note the absence of a `}` branch: reaching here means a comma was
        // just consumed, so a closing brace would be a trailing comma.
        this.beginKey(byte);
        return;

      case "expect_colon":
        if (isWhitespace(byte)) return;
        if (byte !== BYTE_COLON) {
          throw new VpResponseValidationError(
            "Artifact response is missing a colon after an object key",
          );
        }
        this.state = "expect_value";
        return;

      case "after_value":
        if (isWhitespace(byte)) return;
        if (byte === BYTE_COMMA) {
          const frame = this.frames[this.frames.length - 1];
          if (!frame) {
            throw new VpResponseValidationError(
              "Artifact response has trailing content after the top-level value",
            );
          }
          this.state = frame.kind === "object" ? "expect_key" : "expect_value";
          return;
        }
        if (byte === BYTE_CLOSE_BRACE) {
          this.popFrame("object");
          return;
        }
        if (byte === BYTE_CLOSE_BRACKET) {
          this.popFrame("array");
          return;
        }
        throw new VpResponseValidationError(
          "Artifact response contains an unexpected character after a value",
        );

      case "done":
        if (isWhitespace(byte)) return;
        throw new VpResponseValidationError(
          "Artifact response has trailing content after the top-level value",
        );
    }
  }

  private beginKey(byte: number): void {
    if (byte !== BYTE_QUOTE) {
      throw new VpResponseValidationError(
        "Artifact response contains an object key that is not a string",
      );
    }
    this.stringIsKey = true;
    this.stringTarget = "key";
    this.stringCapture = new CaptureBuffer(MAX_JSON_KEY_BYTES, "object key");
    this.stringCapture.push(byte);
    this.state = "in_string";
  }

  private beginValue(byte: number): void {
    if (this.frames.length === 0 && byte !== BYTE_OPEN_BRACE) {
      throw new VpResponseValidationError(
        "Artifact response is not a JSON object",
      );
    }

    const path = this.classifyValuePath();

    // A `result` or a babe_sessions entry that is not an object can never
    // satisfy the schema, and rejecting here keeps the skeleton honest rather
    // than silently omitting the field.
    if (
      (path === "result" || path === "babe_session_entry") &&
      byte !== BYTE_OPEN_BRACE
    ) {
      throw new VpResponseValidationError(
        path === "result"
          ? "Artifact response result is not a JSON object"
          : "Artifact response contains a babe_sessions entry that is not a JSON object",
      );
    }

    if (path === "error") {
      // JSON-RPC allows only null or an object here. Restricting it to those
      // two shapes keeps the raw-capture span unambiguous.
      if (byte === BYTE_LOWER_N) {
        this.beginLiteral(byte);
        return;
      }
      if (byte !== BYTE_OPEN_BRACE) {
        throw new VpResponseValidationError(
          "Artifact response contains a top-level error that is neither null nor an object",
        );
      }
      this.errorCapture = new CaptureBuffer(MAX_ERROR_VALUE_BYTES, "error");
      this.errorCapture.push(byte);
      this.pushFrame("object");
      return;
    }

    if (byte === BYTE_OPEN_BRACE) {
      if (path === "result") {
        this.resultSeen = true;
        // This byte is the result object's `{` — the first byte of the span
        // the caller writes to disk.
        this.resultCapture = "inside";
      }
      if (path === "babe_sessions") this.babeSessionsSeen = true;
      this.pushFrame("object");
      return;
    }
    if (byte === BYTE_OPEN_BRACKET) {
      this.pushFrame("array");
      return;
    }
    if (byte === BYTE_QUOTE) {
      this.beginStringValue(path);
      this.stringCapture?.push(byte);
      return;
    }
    if (byte === BYTE_MINUS || isDigit(byte)) {
      this.state = "in_number";
      this.numberState =
        byte === BYTE_MINUS ? "minus" : byte === BYTE_ZERO ? "zero" : "int";
      return;
    }
    if (
      byte === BYTE_LOWER_T ||
      byte === BYTE_LOWER_F ||
      byte === BYTE_LOWER_N
    ) {
      this.beginLiteral(byte);
      return;
    }
    if (this.frames.length === 0) {
      throw new VpResponseValidationError(
        "Artifact response is not a JSON object",
      );
    }
    throw new VpResponseValidationError(
      "Artifact response contains an unexpected character where a value was expected",
    );
  }

  private beginLiteral(byte: number): void {
    this.literalExpected =
      byte === BYTE_LOWER_T ? "true" : byte === BYTE_LOWER_F ? "false" : "null";
    this.literalIndex = 1;
    this.state = "in_literal";
  }

  private beginStringValue(path: ValuePath): void {
    this.stringIsKey = false;
    this.state = "in_string";
    this.hexCount = 0;
    this.hexPreview = "";

    switch (path) {
      case "tx_graph_json":
        this.stringTarget = "tx_graph_json";
        this.stringCapture = new CaptureBuffer(
          MAX_TX_GRAPH_JSON_BYTES,
          "tx_graph_json",
        );
        return;
      case "verifying_key_hex":
        this.stringTarget = "verifying_key_hex";
        this.stringCapture = new CaptureBuffer(
          MAX_VERIFYING_KEY_HEX_BYTES,
          "verifying_key_hex",
        );
        return;
      case "decryptor_artifacts_hex":
        this.stringTarget = "decryptor_artifacts_hex";
        this.stringCapture = null;
        return;
      default:
        this.stringTarget = "ignored";
        this.stringCapture = new CaptureBuffer(
          MAX_UNKNOWN_STRING_BYTES,
          "string value",
        );
    }
  }

  private consumeStringByte(byte: number): void {
    if (byte === BYTE_QUOTE) {
      this.stringCapture?.push(byte);
      this.closeString();
      return;
    }
    if (byte === BYTE_BACKSLASH) {
      this.stringCapture?.push(byte);
      this.state = "in_string_escape";
      return;
    }
    if (byte < MIN_UNESCAPED_STRING_BYTE) {
      throw new VpResponseValidationError(
        "Artifact response contains an unescaped control character in a string",
      );
    }
    if (this.stringTarget === "decryptor_artifacts_hex") {
      // Unreachable via update()'s fast path, which consumes hex runs and
      // rejects any non-hex byte other than the closing quote. Kept as a
      // belt-and-braces guard so the machine is correct in isolation.
      throw new VpResponseValidationError(
        "Artifact response contains a non-hex character in decryptor_artifacts_hex",
      );
    }
    this.stringCapture?.push(byte);
  }

  private closeString(): void {
    if (this.stringIsKey) {
      const key = decodeJsonString(this.stringCapture, "object key");
      const frame = this.frames[this.frames.length - 1];
      if (frame.seenKeys) {
        if (frame.seenKeys.has(key)) {
          // First-wins scanning and JSON.parse's last-wins would disagree, so
          // a duplicated key is rejected rather than silently resolved.
          throw new VpResponseValidationError(
            `Artifact response contains a duplicate "${key}" key`,
          );
        }
        frame.seenKeys.add(key);
      }
      frame.currentKey = key;
      if (this.isBabeSessionsFrame(this.frames.length - 1)) {
        if (this.sessionKeys.length >= MAX_BABE_SESSIONS) {
          throw new VpResponseValidationError(
            `Artifact response declares more than ${MAX_BABE_SESSIONS} babe_sessions entries`,
          );
        }
        this.sessionKeys.push(key);
      }
      this.stringCapture = null;
      this.state = "expect_colon";
      return;
    }

    switch (this.stringTarget) {
      case "tx_graph_json":
        this.txGraphJson = decodeJsonString(
          this.stringCapture,
          "tx_graph_json",
        );
        break;
      case "verifying_key_hex":
        this.verifyingKeyHex = decodeJsonString(
          this.stringCapture,
          "verifying_key_hex",
        );
        break;
      case "decryptor_artifacts_hex": {
        if (this.hexCount % 2 !== 0) {
          // Odd-length hex cannot decode to bytes. Stricter than the SDK
          // validator, which only checks the charset.
          throw new VpResponseValidationError(
            "Artifact response contains an odd-length decryptor_artifacts_hex value",
          );
        }
        if (this.hexCount < MIN_DECRYPTOR_HEX_CHARS) {
          // Charset and non-emptiness alone would accept a token payload like
          // "ab", which is not recovery material by any measure.
          throw new VpResponseValidationError(
            `Artifact response decryptor_artifacts_hex is ${this.hexCount} characters, below the ${MIN_DECRYPTOR_HEX_CHARS}-character minimum for a real artifact`,
          );
        }
        const pubkey = this.frames[this.frames.length - 2]?.currentKey;
        if (pubkey) {
          this.sessionHex.set(pubkey, this.hexPreview);
        }
        break;
      }
      default:
        // Untracked values (jsonrpc, id, any forward-compat field) are
        // discarded, but they are still part of the document this validator
        // claims is well-formed, and RFC 8259 makes UTF-8 part of that. The
        // byte machine only rejects control characters, so without this a raw
        // 0x80 here would commit a bundle no strict JSON parser can read.
        // The capture is already populated and bounded, so this only pays for
        // the decode. `decryptor_artifacts_hex` never reaches here — its
        // capture is null and the hex table already rejects bytes >= 0x80.
        decodeJsonString(this.stringCapture, "string value");
        break;
    }

    this.stringCapture = null;
    this.stringTarget = "ignored";
    this.state = "after_value";
  }

  private advanceNumber(byte: number): void {
    switch (this.numberState) {
      case "minus":
        if (!isDigit(byte)) break;
        this.numberState = byte === BYTE_ZERO ? "zero" : "int";
        return;
      case "zero":
        // A leading zero may only be followed by a fraction or an exponent.
        if (byte === BYTE_DOT) {
          this.numberState = "frac_start";
          return;
        }
        if (byte === BYTE_LOWER_E || byte === BYTE_UPPER_E) {
          this.numberState = "exp_start";
          return;
        }
        break;
      case "int":
        if (isDigit(byte)) return;
        if (byte === BYTE_DOT) {
          this.numberState = "frac_start";
          return;
        }
        if (byte === BYTE_LOWER_E || byte === BYTE_UPPER_E) {
          this.numberState = "exp_start";
          return;
        }
        break;
      case "frac_start":
        if (!isDigit(byte)) break;
        this.numberState = "frac";
        return;
      case "frac":
        if (isDigit(byte)) return;
        if (byte === BYTE_LOWER_E || byte === BYTE_UPPER_E) {
          this.numberState = "exp_start";
          return;
        }
        break;
      case "exp_start":
        if (byte === BYTE_PLUS || byte === BYTE_MINUS) {
          this.numberState = "exp_sign";
          return;
        }
        if (!isDigit(byte)) break;
        this.numberState = "exp";
        return;
      case "exp_sign":
        if (!isDigit(byte)) break;
        this.numberState = "exp";
        return;
      case "exp":
        if (isDigit(byte)) return;
        break;
    }
    throw new VpResponseValidationError(
      "Artifact response contains a malformed number",
    );
  }

  private pushFrame(kind: "object" | "array"): void {
    if (this.frames.length >= JSON_MAX_DEPTH) {
      throw new VpResponseValidationError(
        `Artifact response nests deeper than ${JSON_MAX_DEPTH} levels`,
      );
    }
    this.frames.push({
      kind,
      currentKey: null,
      seenKeys:
        kind === "object" && this.isTrackedObjectDepth() ? new Set() : null,
    });
    this.state =
      kind === "object" ? "expect_key_or_close" : "expect_value_or_close";
  }

  private popFrame(kind: "object" | "array"): void {
    const frame = this.frames.pop();
    if (!frame || frame.kind !== kind) {
      throw new VpResponseValidationError(
        "Artifact response contains a mismatched bracket",
      );
    }
    if (this.errorCapture !== null && this.frames.length === 1) {
      this.throwWireError(this.errorCapture);
    }
    if (this.resultCapture === "inside" && this.frames.length === 1) {
      // Only the result object itself can return the parse to envelope depth
      // while we are inside it — anything nested pops to depth >= 2 — so this
      // byte is its closing `}` and the last byte of the span.
      this.resultCapture = "after";
    }
    this.state = this.frames.length === 0 ? "done" : "after_value";
  }

  /** True when the frame about to be pushed is one of the four we read. */
  private isTrackedObjectDepth(): boolean {
    const depth = this.frames.length;
    if (depth === 0) return true; // envelope
    if (depth === 1) return this.frames[0].currentKey === "result";
    if (depth === 2) {
      return (
        this.frames[0].currentKey === "result" &&
        this.frames[1].currentKey === "babe_sessions"
      );
    }
    if (depth === 3) return this.isBabeSessionsFrame(2);
    return false;
  }

  private isBabeSessionsFrame(index: number): boolean {
    return (
      index === 2 &&
      this.frames[0]?.currentKey === "result" &&
      this.frames[1]?.currentKey === "babe_sessions"
    );
  }

  private classifyValuePath(): ValuePath {
    const depth = this.frames.length;
    if (depth === 1) {
      const key = this.frames[0].currentKey;
      if (key === "result") return "result";
      if (key === "error") return "error";
      return "other";
    }
    if (depth === 2 && this.frames[0].currentKey === "result") {
      const key = this.frames[1].currentKey;
      if (key === "tx_graph_json") return "tx_graph_json";
      if (key === "verifying_key_hex") return "verifying_key_hex";
      if (key === "babe_sessions") return "babe_sessions";
      return "other";
    }
    if (depth === 3 && this.isBabeSessionsFrame(2)) {
      return "babe_session_entry";
    }
    if (
      depth === 4 &&
      this.isBabeSessionsFrame(2) &&
      this.frames[3].currentKey === "decryptor_artifacts_hex"
    ) {
      return "decryptor_artifacts_hex";
    }
    return "other";
  }

  /**
   * A non-null top-level `error` is a JSON-RPC error envelope regardless of
   * where it sits relative to `result`, so this fires the moment the error
   * object closes rather than waiting for the document to end.
   */
  private throwWireError(capture: CaptureBuffer): never {
    let parsed: unknown;
    try {
      parsed = JSON.parse(capture.decode());
    } catch {
      throw new VpResponseValidationError(
        "Artifact response contains a malformed JSON-RPC error object",
      );
    }
    const error = parsed as Record<string, unknown>;
    throw new JsonRpcError(
      typeof error.code === "number"
        ? error.code
        : JSON_RPC_ERROR_CODES.INVALID_RESPONSE,
      typeof error.message === "string"
        ? error.message
        : COPY.deposit.recoveryArtifacts.unknownRpcError,
      "wire",
      error.data,
    );
  }
}

type ValuePath =
  | "result"
  | "error"
  | "tx_graph_json"
  | "verifying_key_hex"
  | "babe_sessions"
  | "babe_session_entry"
  | "decryptor_artifacts_hex"
  | "other";

function isWhitespace(byte: number): boolean {
  return (
    byte === BYTE_SPACE ||
    byte === BYTE_TAB ||
    byte === BYTE_LF ||
    byte === BYTE_CR
  );
}

function isDigit(byte: number): boolean {
  return byte >= BYTE_ZERO && byte <= BYTE_NINE;
}

/** Bytes that may legally follow a number. */
function isValueTerminator(byte: number): boolean {
  return (
    isWhitespace(byte) ||
    byte === BYTE_COMMA ||
    byte === BYTE_CLOSE_BRACE ||
    byte === BYTE_CLOSE_BRACKET
  );
}

/**
 * Decode a captured JSON string span (quotes included) via `JSON.parse`, so
 * escape sequences and surrogate pairs are handled by V8 rather than by a
 * hand-rolled unescaper.
 */
function decodeJsonString(
  capture: CaptureBuffer | null,
  field: string,
): string {
  if (!capture) {
    throw new VpResponseValidationError(
      `Artifact response field "${field}" was not captured`,
    );
  }
  const parsed: unknown = JSON.parse(capture.decode());
  if (typeof parsed !== "string") {
    throw new VpResponseValidationError(
      `Artifact response field "${field}" is not a string`,
    );
  }
  return parsed;
}

/**
 * `tx_graph_json` carries a JSON document as a string. Its internal schema is
 * owned by the Rust side and is not published anywhere we can validate
 * against, so the only structural claim we can make is that it parses to an
 * object rather than being arbitrary text.
 */
function parseTxGraphJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VpResponseValidationError(
      "Artifact response tx_graph_json is not valid JSON",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new VpResponseValidationError(
      "Artifact response tx_graph_json is not a JSON object",
    );
  }
  return parsed as Record<string, unknown>;
}
