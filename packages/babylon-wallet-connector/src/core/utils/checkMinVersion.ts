// Strict canonical semver — reject `v1.2.3`, `1.2.3-beta`, `dev`, leading
// zeros (`01.2.3`, `1.02.3`), and any non-canonical format. The numeric
// comparison cannot be defeated by string collation quirks (e.g.
// `localeCompare` ranks `"dev" > "1"`).
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type MinVersionCheck = "ok" | "below" | "unparseable";

/**
 * Compares a raw version value against a minimum strict `MAJOR.MINOR.PATCH`.
 * Returns `"unparseable"` for non-string input or any string that is not
 * strict canonical semver — fail-closed for fork/canary builds or an
 * unpopulated value. `min` is a trusted, hard-coded `MAJOR.MINOR.PATCH`.
 */
export function checkMinVersion(raw: unknown, min: string): MinVersionCheck {
  const match = typeof raw === "string" ? SEMVER_RE.exec(raw) : null;
  if (!match) return "unparseable";
  const [minMajor, minMinor, minPatch] = min.split(".").map(Number);
  const cmp =
    Number(match[1]) - minMajor ||
    Number(match[2]) - minMinor ||
    Number(match[3]) - minPatch;
  return cmp >= 0 ? "ok" : "below";
}
