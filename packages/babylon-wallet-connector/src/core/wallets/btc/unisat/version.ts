import { checkMinVersion, type MinVersionCheck } from "@/core/utils/checkMinVersion";

// 1.7.14 is the first UniSat release that binds `deriveContextHash` to the
// connected pubkey + network. Older builds derive a different hash for the
// same inputs and would silently desync against btc-vault flows.
// Source: unisat-wallet/wallet commit 51c0939298c621ecce7eba6acd7e7ec889ee1f61
// ("feat(keyring): bind deriveContextHash to network + connected pubkey"),
// first shipped in tag extension/v1.7.14.
export const MIN_UNISAT_VERSION = "1.7.14";

/** Compares a raw `getVersion()` value against {@link MIN_UNISAT_VERSION}. */
export function checkUnisatVersion(raw: unknown): MinVersionCheck {
  return checkMinVersion(raw, MIN_UNISAT_VERSION);
}
