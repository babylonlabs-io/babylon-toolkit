import { SeverityLevel, addBreadcrumb, captureException } from "@sentry/react";

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
      message,
      category,
      data,
    }),
  warn: (message: string, { category, ...data }: Context = {}) =>
    addBreadcrumb({
      level: "warning",
      message,
      category,
      data,
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
      extra,
    }),
};
