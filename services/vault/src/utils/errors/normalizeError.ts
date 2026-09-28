export function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(
    value !== null &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
      ? value.message
      : String(value),
  );
}
