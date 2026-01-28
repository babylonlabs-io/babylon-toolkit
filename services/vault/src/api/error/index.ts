export const isError451 = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeWithStatus = error as { status?: unknown };
  return (
    typeof maybeWithStatus.status === "number" && maybeWithStatus.status === 451
  );
};
