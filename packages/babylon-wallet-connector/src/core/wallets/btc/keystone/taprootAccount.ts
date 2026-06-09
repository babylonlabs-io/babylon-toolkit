/** BIP86 Taproot purpose (the first hardened component of `m/86'/…`). */
const TAPROOT_PURPOSE = 86;

/**
 * Rewrites the `h` hardened marker to the apostrophe form (`86h` → `86'`).
 *
 * The Keystone SDK's `pathToKeypath` only marks a component hardened when it
 * ends with `'`; an `h`-suffixed component would be silently encoded as
 * non-hardened (`m/86h/0h/0h` → `m/86/0/0`), making the device derive a
 * different key. Normalizing here keeps the stored path canonical for every
 * consumer (deriveContextHash and PSBT/message signing all read it).
 */
const normalizeHardenedPath = (path: string): string => path.replace(/h(?=\/|$)/g, "'");

const purposeOf = (path: string): number => parseInt(normalizeHardenedPath(path).split("/")[1], 10);

/**
 * Finds the Taproot (BIP86, purpose `86'`) account in a parsed Keystone export
 * and returns it with its `path` normalized to the apostrophe hardened form.
 *
 * Selected by parsing the derivation path rather than a fixed index: the
 * Keystone export order is not guaranteed (e.g. `[84', 49', 44', 86']`), so a
 * hardcoded position is unreliable.
 */
export const findTaprootAccount = <T extends { path: string }>(keys: T[]): T | undefined => {
  const account = keys.find((key) => purposeOf(key.path) === TAPROOT_PURPOSE);
  return account ? { ...account, path: normalizeHardenedPath(account.path) } : undefined;
};
