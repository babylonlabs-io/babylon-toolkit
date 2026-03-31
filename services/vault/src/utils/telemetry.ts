import type { Event as SentryEvent } from "@sentry/react";

const REDACTED_IDENTIFIER_VISIBLE_CHARS = 4;

/**
 * Redact a known-sensitive identifier to "first4...last4" format.
 * Preserves enough context for debugging while preventing full exposure.
 */
export function redactIdentifier(value: string): string {
  if (value.length <= REDACTED_IDENTIFIER_VISIBLE_CHARS * 2) {
    return value;
  }
  const head = value.slice(0, REDACTED_IDENTIFIER_VISIBLE_CHARS);
  const tail = value.slice(-REDACTED_IDENTIFIER_VISIBLE_CHARS);
  return `${head}...${tail}`;
}

// BTC bech32 addresses (mainnet bc1, testnet/signet tb1)
const BTC_BECH32_RE = /\b(bc1|tb1)[a-zA-HJ-NP-Z0-9]{24,58}\b/g;
// BTC legacy P2PKH (1...) and P2SH (3...)
const BTC_LEGACY_RE = /\b[13][a-km-zA-HJ-NP-Z1-9]{24,33}\b/g;
// ETH addresses (0x + 40 hex)
const ETH_ADDR_RE = /\b0x[0-9a-fA-F]{40}\b/g;
// Babylon/Cosmos addresses (bbn1...)
const BBN_ADDR_RE = /\bbbn1[a-z0-9]{38,58}\b/g;
// Long hex strings (64+ hex chars = 32+ bytes — keys, tx data, signatures)
// Also catches 0x-prefixed long hex (>40 hex chars, to avoid double-matching ETH addresses)
const LONG_HEX_RE = /\b0x[0-9a-fA-F]{41,}\b|\b[0-9a-fA-F]{64,}\b/g;

/**
 * Apply regex-based scrubbing to an arbitrary string.
 * Replaces recognizable sensitive patterns with redaction placeholders.
 */
export function scrubString(value: string): string {
  return value
    .replace(BTC_BECH32_RE, "[BTC_ADDR]")
    .replace(BTC_LEGACY_RE, "[BTC_ADDR]")
    .replace(ETH_ADDR_RE, "[ETH_ADDR]")
    .replace(BBN_ADDR_RE, "[BBN_ADDR]")
    .replace(LONG_HEX_RE, "[HEX_REDACTED]");
}

const SENSITIVE_FIELD_NAMES = new Set([
  "address",
  "btcAddress",
  "ethAddress",
  "babylonAddress",
  "bech32Address",
  "publicKey",
  "pubKey",
  "userPublicKey",
  "depositorBtcPubkey",
  "txHash",
  "txHex",
  "peginTxHash",
  "rawTx",
  "mnemonic",
  "seed",
  "secretHex",
  "htlcSecretHex",
  "rpcUrl",
  "endpoint",
]);

/**
 * Recursively redact sensitive fields in a data object.
 * - Fields in SENSITIVE_FIELD_NAMES get identifier-level redaction (first4...last4)
 * - All other string values get regex scrubbing for address/hex patterns
 */
export function redactData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return scrubString(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactData(item)) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_NAMES.has(key) && typeof value === "string") {
        result[key] = redactIdentifier(value);
      } else {
        result[key] = redactData(value);
      }
    }
    return result as T;
  }

  return obj;
}

/**
 * Deep-walk a Sentry event and scrub all string values for sensitive patterns.
 * This is the safety-net layer — catches auto-captured errors that bypass the logger.
 */
export function scrubSentryEvent<T extends SentryEvent>(event: T): T {
  if (event.message) {
    event.message = scrubString(event.message);
  }

  if (event.tags) {
    event.tags = redactData(event.tags) as typeof event.tags;
  }

  if (event.extra) {
    event.extra = redactData(event.extra);
  }

  if (event.contexts) {
    event.contexts = redactData(event.contexts);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      message: bc.message ? scrubString(bc.message) : bc.message,
      data: bc.data ? redactData(bc.data) : bc.data,
    }));
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((ex) => ({
      ...ex,
      value: ex.value ? scrubString(ex.value) : ex.value,
    }));
  }

  if (event.request) {
    if (event.request.url) {
      event.request.url = scrubString(event.request.url);
    }
    if (event.request.headers) {
      event.request.headers = redactData(event.request.headers);
    }
  }

  return event;
}
