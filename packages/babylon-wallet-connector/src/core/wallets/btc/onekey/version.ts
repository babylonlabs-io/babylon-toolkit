import { checkMinVersion, type MinVersionCheck } from "@/core/utils/checkMinVersion";

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

/** Compares a raw `$walletInfo.version` against {@link MIN_ONEKEY_VERSION}. */
export function checkOneKeyVersion(raw: unknown): MinVersionCheck {
  return checkMinVersion(raw, MIN_ONEKEY_VERSION);
}
