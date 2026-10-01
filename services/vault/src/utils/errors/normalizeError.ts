function isScalar(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value === null || typeof value !== "object") {
    return new Error(String(value));
  }
  const { message, name, code, errorCode } = value as {
    message?: unknown;
    name?: unknown;
    code?: unknown;
    errorCode?: unknown;
  };
  const hasMessage = typeof message === "string" && message !== "";
  const error = new Error(hasMessage ? message : String(value));
  if (typeof name === "string" && name !== "") error.name = name;
  if (isScalar(code)) Object.assign(error, { code });
  if (isScalar(errorCode)) Object.assign(error, { errorCode });
  return error;
}
