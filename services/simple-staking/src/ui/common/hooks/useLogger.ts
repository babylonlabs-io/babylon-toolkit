import {
  type SeverityLevel,
  addBreadcrumb,
  captureException,
} from "@babylonlabs-io/observability";
import { useMemo } from "react";

import { ClientError } from "@/ui/common/errors";
import { redactTelemetry } from "@/ui/common/utils/telemetry";

type Value = string | number | boolean | object;

type Context = Record<string, Value | Value[]> & {
  category?: string;
};

type ErrorContext = {
  level?: SeverityLevel;
  tags?: Record<string, string>;
  data?: Record<string, Value | Value[]>;
};

interface Logger {
  info(message: string, context?: Context): void;
  warn(message: string, context?: Context): void;
  error(error: Error, context?: ErrorContext): string;
}

/**
 * Sensitive field names that should be automatically redacted in telemetry logs.
 * These fields contain wallet identifiers (addresses, public keys, etc.)
 */
const SENSITIVE_FIELDS = new Set([
  "bech32Address",
  "btcAddress",
  "babylonAddress",
  "userPublicKey",
]);

/**
 * Recursively redacts sensitive fields in an object.
 * Handles nested objects and arrays while preserving structure.
 */
function redactSensitiveFields<T extends Record<string, any>>(obj: T): T {
  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key) && typeof value === "string") {
      // Redact sensitive string values
      result[key] = redactTelemetry(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      // Recursively redact nested objects
      result[key] = redactSensitiveFields(value);
    } else if (Array.isArray(value)) {
      // Handle arrays (recursively if they contain objects)
      result[key] = value.map((item) =>
        item && typeof item === "object" ? redactSensitiveFields(item) : item,
      );
    } else {
      // Keep non-sensitive values as-is
      result[key] = value;
    }
  }

  return result as T;
}

const logger: Logger = {
  info: (message, { category, ...data } = {}) =>
    addBreadcrumb({
      level: "info",
      message,
      category,
      data: redactSensitiveFields(data),
    }),
  warn: (message, { category, ...data } = {}) =>
    addBreadcrumb({
      level: "warning",
      message,
      category,
      data: redactSensitiveFields(data),
    }),
  error: (error, { level = "error", tags, data: extra } = {}) =>
    captureException(error, {
      level,
      tags: tags ? redactSensitiveFields(tags) : tags,
      extra: extra ? redactSensitiveFields(extra) : extra,
      ...(Reflect.has(error, "errorCode") && {
        tags: {
          ...(tags ? redactSensitiveFields(tags) : {}),
          errorCode: (error as ClientError).errorCode,
        },
      }),
    }),
};

export function useLogger(): Logger {
  return useMemo(() => logger, []);
}
