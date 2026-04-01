import {
  type SeverityLevel,
  addBreadcrumb,
  captureException,
  captureMessage,
} from "@sentry/react";

import { redactData, scrubString } from "@/utils/telemetry";

type Value = string | number | boolean | object;

type Context = Record<string, Value | Value[]> & {
  category?: string;
};

type ErrorContext = {
  level?: SeverityLevel;
  tags?: Record<string, string>;
  data?: Record<string, Value | Value[]>;
};

export default {
  info: (message: string, { category, ...data }: Context = {}) =>
    addBreadcrumb({
      level: "info",
      message: scrubString(message),
      category,
      data: redactData(data),
    }),
  warn: (message: string, { category, ...data }: Context = {}) =>
    addBreadcrumb({
      level: "warning",
      message: scrubString(message),
      category,
      data: redactData(data),
    }),
  error: (
    error: Error,
    { level = "error", tags, data: extra }: ErrorContext = {},
  ) =>
    captureException(error, {
      level,
      tags: Reflect.has(error, "errorCode")
        ? { ...tags, errorCode: Reflect.get(error, "errorCode") as string }
        : tags,
      extra: extra ? redactData(extra) : extra,
    }),
  event: (
    message: string,
    {
      level = "warning",
      category,
      ...data
    }: { level?: SeverityLevel } & Context = {},
  ) =>
    captureMessage(scrubString(message), {
      level,
      extra: redactData({ category, ...data }),
    }),
};
