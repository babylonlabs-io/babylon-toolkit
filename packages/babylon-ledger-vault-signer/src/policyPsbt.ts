/**
 * Wallet-policy PSBT shaping for the vault app's key-path flows (Pre-PegIn).
 *
 * The base app marks an input internal when its TAP_BIP32_DERIVATION matches a
 * policy key expression at (change, index) and the script equals the policy
 * script there (`bitcoin_app_base/src/handler/sign_psbt/preprocess_inputs.c`
 * @ e400d8d8); outputs are internal ONLY on the change branch
 * (`process_in_outs.c:114-117`, `preprocess_outputs.c:74-79`). `_validate_prepegin`
 * requires every input internal and accepts change only when internal
 * (`sign_psbt_validate.c:334-545` @ 4decf822). This module adds exactly those
 * fields; it never touches the unsigned transaction.
 *
 * @module ledger-vault-signer/policyPsbt
 */
import { HDKey } from "@scure/bip32";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { bip86OutputScript } from "./expectedSignatures";

const HARDENED = 0x80000000;
const U32_MAX = 0xffffffff;
const BIP86_CHANGE_BRANCH = 1;
const BIP86_PATH_LEVELS = 5;
const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;
const FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;

const BIP86_RECEIVE_BRANCH = 0;
const PATH_ACCOUNT_LEVELS = 3; // purpose'/coin'/account'
const PATH_BRANCH_INDEX = 3;
const PATH_ADDRESS_INDEX = 4;

function assertBip86Path(name: string, levels: readonly number[]): void {
  if (levels.length !== BIP86_PATH_LEVELS) {
    throw new Error(`${name} must have exactly ${BIP86_PATH_LEVELS} levels, got ${levels.length}`);
  }
  for (const level of levels) {
    if (!Number.isInteger(level) || level < 0 || level > U32_MAX) {
      throw new Error(`${name} levels must be integers in 0..0xffffffff`);
    }
  }
  // Any other hardening shape is unmatchable against the policy expression
  // `@0/<0;1>/*`, so the device could never mark the input/output internal.
  const accountHardened = levels.slice(0, PATH_ACCOUNT_LEVELS).every((level) => (level & HARDENED) !== 0);
  if (!accountHardened || (levels[PATH_ADDRESS_INDEX] & HARDENED) !== 0) {
    throw new Error(`${name} must harden purpose'/coin'/account' and leave the address index unhardened`);
  }
}

/**
 * The device matches derivations against the policy key expression
 * `@0/<0;1>/*`: depositor inputs live on branch 0, change on branch 1, both
 * under the SAME account as the policy key — anything else cannot be internal.
 */
function assertPolicyPathPair(depositorPath: readonly number[], changePath?: readonly number[]): void {
  assertBip86Path("depositorPath", depositorPath);
  if (depositorPath[PATH_BRANCH_INDEX] !== BIP86_RECEIVE_BRANCH) {
    throw new Error("depositorPath must use BIP-86 receive branch 0");
  }
  if (!changePath) return;
  assertBip86Path("change.path", changePath);
  for (let i = 0; i < PATH_ACCOUNT_LEVELS; i++) {
    if (changePath[i] !== depositorPath[i]) {
      throw new Error("change.path must use the same purpose'/coin'/account' as depositorPath");
    }
  }
  if (changePath[PATH_BRANCH_INDEX] !== BIP86_CHANGE_BRANCH) {
    throw new Error("change.path must use BIP-86 change branch 1");
  }
}

function pathToString(levels: readonly number[]): string {
  return "m/" + levels.map((l) => ((l & HARDENED) !== 0 ? `${(l & ~HARDENED) >>> 0}'` : `${l >>> 0}`)).join("/");
}

/** x-only key at `account/1/addressIndex` from the device's verbatim account xpub. */
export function deriveChangeXOnlyHex(
  accountXpub: string,
  bip32Versions: { private: number; public: number },
  addressIndex: number,
): string {
  if (!Number.isInteger(addressIndex) || addressIndex < 0 || addressIndex >= HARDENED) {
    throw new Error("addressIndex must be a non-hardened integer in 0..2^31-1");
  }
  const node = HDKey.fromExtendedKey(accountXpub, bip32Versions)
    .deriveChild(BIP86_CHANGE_BRANCH)
    .deriveChild(addressIndex);
  if (!node.publicKey) throw new Error("account xpub derived no public key for the change address");
  return Buffer.from(node.publicKey.subarray(1)).toString("hex");
}

/** Output indices paying the BIP-86 P2TR of `changeXOnlyHex` — the ONE change-match site. */
function changeOutputIndices(psbt: Psbt, changeXOnlyHex: string): number[] {
  const changeScript = bip86OutputScript(changeXOnlyHex);
  return psbt.txOutputs.flatMap((out, index) => (Buffer.from(out.script).equals(changeScript) ? [index] : []));
}

/**
 * Does this PSBT pay the wallet's change address? A Pre-PegIn legitimately has
 * no change (dust-revert, and the Max sweep by design), so callers pass
 * `change` to {@link augmentPsbtForWalletPolicy} only when this is true —
 * passing it otherwise is the "matches no output" throw.
 */
export function psbtPaysChangeScript(psbtHex: string, changeXOnlyHex: string): boolean {
  if (!X_ONLY_HEX_RE.test(changeXOnlyHex)) throw new Error("changeXOnlyHex must be 64 lowercase hex characters");
  return changeOutputIndices(Psbt.fromHex(psbtHex), changeXOnlyHex).length > 0;
}

export interface AugmentPsbtForWalletPolicyParams {
  readonly psbtHex: string;
  readonly depositorXOnlyHex: string;
  readonly masterFingerprintHex: string;
  readonly depositorPath: readonly number[];
  /** The change output's key and path; omit when the PSBT carries no change. */
  readonly change?: { readonly xOnlyHex: string; readonly path: readonly number[] };
}

export function augmentPsbtForWalletPolicy(params: AugmentPsbtForWalletPolicyParams): string {
  const { psbtHex, depositorXOnlyHex, masterFingerprintHex, depositorPath, change } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  if (!FINGERPRINT_HEX_RE.test(masterFingerprintHex)) {
    throw new Error("masterFingerprintHex must be 8 lowercase hex characters");
  }
  if (change && !X_ONLY_HEX_RE.test(change.xOnlyHex)) {
    throw new Error("change.xOnlyHex must be 64 lowercase hex characters");
  }
  assertPolicyPathPair(depositorPath, change?.path);
  const psbt = Psbt.fromHex(psbtHex);
  const fingerprint = Buffer.from(masterFingerprintHex, "hex");
  const depositorKey = Buffer.from(depositorXOnlyHex, "hex");
  psbt.data.inputs.forEach((input, i) => {
    if (input.tapInternalKey && Buffer.from(input.tapInternalKey).equals(depositorKey)) {
      psbt.updateInput(i, {
        tapBip32Derivation: [
          { masterFingerprint: fingerprint, pubkey: depositorKey, path: pathToString(depositorPath), leafHashes: [] },
        ],
      });
    }
  });
  if (change) {
    const changeKey = Buffer.from(change.xOnlyHex, "hex");
    const matched = changeOutputIndices(psbt, change.xOnlyHex);
    // Marking nothing passes every host gate and dies mid-ceremony on-device
    // (`sign_psbt_validate.c:507-510`); omit `change` for a change-less PSBT
    // ({@link psbtPaysChangeScript} is the caller-side test).
    if (matched.length === 0) {
      throw new Error("change script matches no output — the PSBT does not pay the wallet's change address");
    }
    for (const index of matched) {
      psbt.updateOutput(index, {
        tapInternalKey: changeKey,
        tapBip32Derivation: [
          { masterFingerprint: fingerprint, pubkey: changeKey, path: pathToString(change.path), leafHashes: [] },
        ],
      });
    }
  }
  return psbt.toHex();
}
