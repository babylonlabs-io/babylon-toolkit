/**
 * Shared derivation-path validation and rendering.
 *
 * Encoders that take caller-supplied path levels validate them here, before any
 * device I/O. `assertU32Levels` rejects a level that would otherwise wrap when
 * encoded; `deriveContextHash` and `getExtendedPublicKey` use it directly.
 * `assertBip86Path` adds the BIP-86 shape for the intent encoder and the PSBT
 * builders: a path the device cannot match against the policy key expression
 * `@0/<0;1>/*` dies mid-ceremony, after the user has already reached an
 * approval screen.
 *
 * @module ledger-vault-signer/bip86Path
 */

export const HARDENED = 0x80000000;
export const U32_MAX = 0xffffffff;
export const BIP86_PURPOSE = 86;
export const BIP86_RECEIVE_BRANCH = 0;
export const BIP86_PATH_LEVELS = 5;
/** purpose'/coin'/account' — the key-info origin prefix. */
export const PATH_ACCOUNT_LEVELS = 3;
export const PATH_BRANCH_INDEX = 3;
export const PATH_ADDRESS_INDEX = 4;

/** Reject any level that is not an integer in 0..0xffffffff, before it can wrap when encoded. */
export function assertU32Levels(name: string, levels: readonly number[]): void {
  for (const level of levels) {
    if (!Number.isInteger(level) || level < 0 || level > U32_MAX) {
      throw new Error(`${name} levels must be integers in 0..0xffffffff`);
    }
  }
}

/**
 * A 5-level BIP-86 path with hardened purpose'/coin'/account' and an
 * unhardened address index. `>>> 0` and `& HARDENED` coerce silently, so the
 * range check must run before any rendering.
 */
export function assertBip86Path(name: string, levels: readonly number[]): void {
  if (levels.length !== BIP86_PATH_LEVELS) {
    throw new Error(`${name} must have exactly ${BIP86_PATH_LEVELS} levels, got ${levels.length}`);
  }
  assertU32Levels(name, levels);
  // Any other hardening shape is unmatchable against the policy expression
  // `@0/<0;1>/*`, so the device could never mark the input/output internal.
  const accountHardened = levels.slice(0, PATH_ACCOUNT_LEVELS).every((level) => (level & HARDENED) !== 0);
  if (!accountHardened || (levels[PATH_ADDRESS_INDEX] & HARDENED) !== 0) {
    throw new Error(`${name} must harden purpose'/coin'/account' and leave the address index unhardened`);
  }
  if (levels[0] !== (HARDENED | BIP86_PURPOSE) >>> 0) {
    throw new Error(`${name} must use BIP-86 purpose ${BIP86_PURPOSE}'`);
  }
}

export function bip86PathToString(levels: readonly number[]): string {
  return "m/" + levels.map((l) => ((l & HARDENED) !== 0 ? `${(l & ~HARDENED) >>> 0}'` : `${l >>> 0}`)).join("/");
}
