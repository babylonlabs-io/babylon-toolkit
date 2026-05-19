// 1.7.14 is the first UniSat release that binds `deriveContextHash` to the
// connected pubkey + network. Older builds derive a different hash for the
// same inputs and would silently desync against btc-vault flows.
// Source: unisat-wallet/wallet commit 51c0939298c621ecce7eba6acd7e7ec889ee1f61
// ("feat(keyring): bind deriveContextHash to network + connected pubkey"),
// first shipped in tag extension/v1.7.14.
export const MIN_UNISAT_VERSION = "1.7.14";

const MIN_UNISAT_PARTS = MIN_UNISAT_VERSION.split(".").map(Number) as [number, number, number];

// Strict canonical semver — reject `v1.7.14`, `1.7.14-beta`, `dev`, leading
// zeros (`01.7.14`, `1.07.14`), and any non-canonical format. The numeric
// comparison below cannot be defeated by string collation quirks (e.g.
// `localeCompare` ranks `"dev" > "1"`).
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type UnisatVersionCheck = "ok" | "below" | "unparseable";

/**
 * Compares a raw `getVersion()` value against {@link MIN_UNISAT_VERSION}.
 * Returns `"unparseable"` for non-string input or any string that is not
 * strict canonical `MAJOR.MINOR.PATCH` — fail-closed for fork/canary builds
 * that emit non-standard formats.
 */
export function checkUnisatVersion(raw: unknown): UnisatVersionCheck {
  const match = typeof raw === "string" ? SEMVER_RE.exec(raw) : null;
  if (!match) return "unparseable";
  const cmp =
    Number(match[1]) - MIN_UNISAT_PARTS[0] ||
    Number(match[2]) - MIN_UNISAT_PARTS[1] ||
    Number(match[3]) - MIN_UNISAT_PARTS[2];
  return cmp >= 0 ? "ok" : "below";
}
