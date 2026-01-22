import {
  type SeverityLevel,
  addBreadcrumb,
  captureException,
} from "@sentry/react";

import type { Context, ErrorContext, Value } from "../client/types";

/**
 * Logger interface for Sentry integration
 * Provides info, warn, and error logging methods that integrate with Sentry
 */
const logger = {
  /**
   * Log an info-level breadcrumb to Sentry
   */
  info: (message: string, { category, ...data }: Context = {}) =>
    addBreadcrumb({
      level: "info",
      message,
      category,
      data: data as Record<string, Value | Value[]>,
    }),

  /**
   * Log a warning-level breadcrumb to Sentry
   */
  warn: (message: string, { category, ...data }: Context = {}) =>
    addBreadcrumb({
      level: "warning",
      message,
      category,
      data: data as Record<string, Value | Value[]>,
    }),

  /**
   * Capture an error exception to Sentry
   */
  error: (
    error: Error,
    { level = "error", tags, data: extra }: ErrorContext = {},
  ) =>
    captureException(error, {
      level,
      tags: Reflect.has(error, "errorCode")
        ? { ...tags, errorCode: Reflect.get(error, "errorCode") as string }
        : tags,
      extra,
    }),
};

export default logger;
