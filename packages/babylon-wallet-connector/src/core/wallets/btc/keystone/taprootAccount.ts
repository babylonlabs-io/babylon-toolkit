/** BIP86 Taproot purpose (the first hardened component of `m/86'/…`). */
const TAPROOT_PURPOSE = 86;

const purposeOf = (path: string): number => parseInt(path.split("/")[1], 10);

/**
 * Finds the Taproot (BIP86, purpose `86'`) account in a parsed Keystone export.
 *
 * Selected by parsing the derivation path rather than a fixed index: the
 * Keystone export order is not guaranteed (e.g. `[84', 49', 44', 86']`), so a
 * hardcoded position is unreliable. `parseInt` tolerates either hardened marker
 * (`86'` or `86h`).
 */
export const findTaprootAccount = <T extends { path: string }>(keys: T[]): T | undefined =>
  keys.find((key) => purposeOf(key.path) === TAPROOT_PURPOSE);
