export function toPixels(val?: number, defaultValue?: number | "auto"): `${string}px` | "auto" | undefined {
  if (typeof val !== "number") {
    return typeof defaultValue === "number" ? toPixels(defaultValue) : defaultValue;
  }

  return `${val}px`;
}
