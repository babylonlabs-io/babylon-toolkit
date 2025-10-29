/**
 * Telemetry utilities for redacting sensitive wallet identifiers in logs.
 * Uses the existing trim() utility to show partial identifiers (e.g., "1234...5678")
 * while preserving privacy and debugging capability.
 */

import { shouldRedactTelemetry } from "../config";

import { trim } from "./trim";

/**
 * Redact sensitive identifiers (addresses, public keys, etc.) for telemetry logging.
 * When redaction is enabled, shows format like "1234...5678" (8 total chars).
 * When disabled (local debugging), returns full identifier.
 *
 * Note: Returns empty string for falsy values (unlike trim() which returns "-")
 * to keep telemetry logs clean and avoid confusion with placeholder values.
 *
 * @param value - The sensitive identifier to redact (address, public key, etc.)
 * @returns Redacted or full identifier based on configuration. Returns empty string for falsy/empty values.
 *
 * @example
 * // With a Bitcoin address
 * redactTelemetry("bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9")
 * // With redaction: "bc1q...a8b9" (first 4 chars + last 4 chars)
 * // Without redaction: "bc1q5hj2k3l4m5n6p7q8r9s0t1u2v3w4x5y6z7a8b9"
 *
 * // With falsy values
 * redactTelemetry(undefined) // Returns: ""
 * redactTelemetry(null)      // Returns: ""
 * redactTelemetry("")        // Returns: ""
 */
export function redactTelemetry(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  if (!shouldRedactTelemetry()) {
    return value;
  }

  // Use trim utility to show first 4 and last 4 characters
  return trim(value, 8);
}
