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

import {
  assertBip86Path,
  BIP86_CHANGE_BRANCH,
  BIP86_RECEIVE_BRANCH,
  bip86PathToString,
  HARDENED,
  PATH_ACCOUNT_LEVELS,
  PATH_BRANCH_INDEX,
} from "./bip86Path";
import { bip86OutputScript } from "./expectedSignatures";
import type { Bip32Versions, DefaultTaprootWalletPolicy } from "./walletPolicy";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * The device matches derivations against the policy key expression
 * `@0/<0;1>/*`: depositor inputs live on branch 0, change on branch 1, both
 * under the SAME account as the policy key — anything else cannot be internal.
 * The account prefix is checked against the POLICY's own key origin, not
 * against a second caller-supplied path.
 */
function assertDepositorPathUnderPolicy(depositorPath: readonly number[], keyOriginPath: readonly number[]): void {
  assertBip86Path("depositorPath", depositorPath);
  if (depositorPath[PATH_BRANCH_INDEX] !== BIP86_RECEIVE_BRANCH) {
    throw new Error("depositorPath must use BIP-86 receive branch 0");
  }
  for (let i = 0; i < PATH_ACCOUNT_LEVELS; i++) {
    if (depositorPath[i] !== keyOriginPath[i]) {
      throw new Error(
        `depositorPath ${bip86PathToString(depositorPath)} is not under the wallet policy's key origin ` +
          `${bip86PathToString(keyOriginPath)} — the device could never mark the input internal`,
      );
    }
  }
}

/** x-only key at `account/1/addressIndex` from the device's verbatim account xpub. */
export function deriveChangeXOnlyHex(
  accountXpub: string,
  bip32Versions: Bip32Versions,
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
  /** The policy the PSBT signs under — supplies the fingerprint, account origin and xpub. */
  readonly walletPolicy: DefaultTaprootWalletPolicy;
  readonly depositorPath: readonly number[];
  /**
   * Index on the policy's change branch. The key and path are BOTH derived
   * from it and the policy, so they cannot disagree; omit when the PSBT
   * carries no change.
   */
  readonly change?: { readonly addressIndex: number };
}

export function augmentPsbtForWalletPolicy(params: AugmentPsbtForWalletPolicyParams): string {
  const { psbtHex, depositorXOnlyHex, walletPolicy, depositorPath, change } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  assertDepositorPathUnderPolicy(depositorPath, walletPolicy.keyOriginPath);
  const psbt = Psbt.fromHex(psbtHex);
  const fingerprint = Buffer.from(walletPolicy.masterFingerprintHex, "hex");
  const depositorKey = Buffer.from(depositorXOnlyHex, "hex");
  let markedInputs = 0;
  psbt.data.inputs.forEach((input, i) => {
    if (input.tapInternalKey && Buffer.from(input.tapInternalKey).equals(depositorKey)) {
      markedInputs++;
      psbt.updateInput(i, {
        tapBip32Derivation: [
          {
            masterFingerprint: fingerprint,
            pubkey: depositorKey,
            path: bip86PathToString(depositorPath),
            leafHashes: [],
          },
        ],
      });
    }
  });
  // `_validate_prepegin` requires EVERY input internal (`sign_psbt_validate.c:334-545`),
  // and an unmarked input is also skipped by the expected-signature table — so it
  // would reach the device and die mid-ceremony, after the approval screens.
  // Fail here, at zero device I/O, exactly like the change branch below.
  if (markedInputs !== psbt.data.inputs.length) {
    throw new Error(
      `${psbt.data.inputs.length - markedInputs} of ${psbt.data.inputs.length} inputs do not carry the ` +
        `depositor key as TAP_INTERNAL_KEY — every Pre-PegIn input must be internal`,
    );
  }
  if (change) {
    const changeXOnlyHex = deriveChangeXOnlyHex(
      walletPolicy.accountXpub,
      walletPolicy.bip32Versions,
      change.addressIndex,
    );
    const changePath = [...depositorPath.slice(0, PATH_ACCOUNT_LEVELS), BIP86_CHANGE_BRANCH, change.addressIndex];
    const changeKey = Buffer.from(changeXOnlyHex, "hex");
    const matched = changeOutputIndices(psbt, changeXOnlyHex);
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
          { masterFingerprint: fingerprint, pubkey: changeKey, path: bip86PathToString(changePath), leafHashes: [] },
        ],
      });
    }
  }
  return psbt.toHex();
}
