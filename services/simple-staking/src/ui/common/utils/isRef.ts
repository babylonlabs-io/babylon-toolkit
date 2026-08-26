import type { MutableRefObject } from "react";

/**
 * Duck typing type guard to determine if a value is a React mutable ref object.
 */
export function isRef<T = unknown>(
  value: unknown,
): value is MutableRefObject<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "current" in (value as Record<string, unknown>)
  );
}
