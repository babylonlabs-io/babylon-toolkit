// 6.3.0 is the first OneKey app/extension release that ships
// `deriveContextHash` (spec-conformant from the start), so it is the floor
// for vault deposits. Source: OneKeyHQ/app-monorepo PR #11568 (merge commit
// ffd9d1f0e0183685b4f5c29d4fa27d6462e1766d), first contained in tag v6.3.0;
// the value matches `.env.version` at that tag. The version is read at runtime
// from `window.$onekey.$walletInfo.version` (populated from
// `wallet_getConnectWalletInfo` -> process.env.VERSION) — NOT from
// `btcwallet.getVersion()` (hardcoded "1.4.10") or `btcwallet.version` (the
// inpage-provider package version "2.2.69"), neither of which is the app version.
export const MIN_ONEKEY_VERSION = "6.3.0";

const MIN_ONEKEY_PARTS = MIN_ONEKEY_VERSION.split(".").map(Number) as [number, number, number];

// Strict canonical semver — reject `v6.3.0`, `6.3.0-beta`, `dev`, leading
// zeros (`06.3.0`, `6.03.0`), and any non-canonical format. The numeric
// comparison below cannot be defeated by string collation quirks (e.g.
// `localeCompare` ranks `"dev" > "1"`).
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type OneKeyVersionCheck = "ok" | "below" | "unparseable";

/**
 * Compares a raw `$walletInfo.version` value against {@link MIN_ONEKEY_VERSION}.
 * Returns `"unparseable"` for non-string input or any string that is not
 * strict canonical `MAJOR.MINOR.PATCH` — fail-closed for fork/canary builds
 * or a `$walletInfo` cache that has not populated yet.
 */
export function checkOneKeyVersion(raw: unknown): OneKeyVersionCheck {
  const match = typeof raw === "string" ? SEMVER_RE.exec(raw) : null;
  if (!match) return "unparseable";
  const cmp =
    Number(match[1]) - MIN_ONEKEY_PARTS[0] ||
    Number(match[2]) - MIN_ONEKEY_PARTS[1] ||
    Number(match[3]) - MIN_ONEKEY_PARTS[2];
  return cmp >= 0 ? "ok" : "below";
}
