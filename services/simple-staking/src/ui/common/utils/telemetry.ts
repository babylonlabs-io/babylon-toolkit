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
 * @param value - The sensitive identifier to redact (address, public key, etc.)
 * @returns Redacted or full identifier based on configuration
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
