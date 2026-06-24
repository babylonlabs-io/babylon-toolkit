import { checkMinVersion, type MinVersionCheck } from "@/core/utils/checkMinVersion";

// Floor for `deriveContextHash`, which vault deposits require; older OKX can't
// deposit. Verified: OKX 4.5.0 is the first version where
// `okxwallet.bitcoin.deriveContextHash` is present. Compared via
// checkMinVersion (strict semver), never a string `<` (the #740 Immunefi bug).
export const MIN_OKX_VERSION = "4.5.0";

/** Compares a raw OKX `getVersion()` value against {@link MIN_OKX_VERSION}. */
export function checkOKXVersion(raw: unknown): MinVersionCheck {
  return checkMinVersion(raw, MIN_OKX_VERSION);
}
