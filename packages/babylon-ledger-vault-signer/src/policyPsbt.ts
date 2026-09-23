/**
 * Wallet-policy PSBT shaping for the vault app's key-path flows (Pre-PegIn).
 *
 * The base app marks an input internal when its TAP_BIP32_DERIVATION matches a
 * policy key expression at (change, index) and the script equals the policy
 * script there (`bitcoin_app_base/src/handler/sign_psbt/preprocess_inputs.c`
 * @ e400d8d8); outputs are internal ONLY on the change branch
 * (`process_in_outs.c:114-117`, `preprocess_outputs.c:74-79`). `_validate_prepegin`
 * requires every input internal and accepts change only when internal
 * (`sign_psbt_validate.c:526-751` @ b0c0ac4d). This module adds exactly those
 * fields; it never touches the unsigned transaction.
 * Which leaves may own an input is decided by `keyPathLeaves`, never here.
 *
 * @module ledger-vault-signer/policyPsbt
 */
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { BIP86_CHANGE_BRANCH, BIP86_RECEIVE_BRANCH, bip86PathToString, PATH_ACCOUNT_LEVELS } from "./bip86Path";
import { bip86OutputScript, type AuthorizedKeyPathLeaf } from "./expectedSignatures";
import { deriveAuthorizedKeyPathLeaves, deriveBranchXOnlyHex, type KeyPathLeaf } from "./keyPathLeaves";
import type { Bip32Versions, DefaultTaprootWalletPolicy } from "./walletPolicy";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;

/** x-only key at `account/1/addressIndex` from the device's verbatim account xpub. */
export function deriveChangeXOnlyHex(
  accountXpub: string,
  bip32Versions: Bip32Versions,
  addressIndex: number,
): string {
  return deriveBranchXOnlyHex(accountXpub, bip32Versions, BIP86_CHANGE_BRANCH, addressIndex);
}

/** x-only key at `account/0/addressIndex` — the depositor branch. */
export function deriveReceiveXOnlyHex(
  accountXpub: string,
  bip32Versions: Bip32Versions,
  addressIndex: number,
): string {
  return deriveBranchXOnlyHex(accountXpub, bip32Versions, BIP86_RECEIVE_BRANCH, addressIndex);
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
  /** Further leaves this Pre-PegIn may spend, by position; keys are derived here. */
  readonly fundingLeaves?: readonly KeyPathLeaf[];
}

/**
 * The leaf an input belongs to, or undefined. Key and script must agree on the
 * same leaf: the device signs any consistent pair, even a wrong outpoint's.
 */
function ownerOf(
  input: Psbt["data"]["inputs"][number],
  leavesByScript: ReadonlyMap<string, AuthorizedKeyPathLeaf>,
): AuthorizedKeyPathLeaf | undefined {
  if (!input.witnessUtxo || !input.tapInternalKey) return undefined;
  const leaf = leavesByScript.get(Buffer.from(input.witnessUtxo.script).toString("hex"));
  if (leaf === undefined) return undefined;
  return Buffer.from(input.tapInternalKey).toString("hex") === leaf.xOnlyHex ? leaf : undefined;
}

export function augmentPsbtForWalletPolicy(params: AugmentPsbtForWalletPolicyParams): string {
  const { psbtHex, depositorXOnlyHex, walletPolicy, depositorPath, change, fundingLeaves } = params;
  // Validates the depositor key and path under the policy, and derives every
  // funding leaf's key from the policy xpub — the one authorized set.
  const { leaves } = deriveAuthorizedKeyPathLeaves({ walletPolicy, depositorXOnlyHex, depositorPath, fundingLeaves });
  const leavesByScript = new Map(leaves.map((leaf) => [bip86OutputScript(leaf.xOnlyHex).toString("hex"), leaf]));
  const psbt = Psbt.fromHex(psbtHex);
  const fingerprint = Buffer.from(walletPolicy.masterFingerprintHex, "hex");
  let markedInputs = 0;
  psbt.data.inputs.forEach((input, i) => {
    const owner = ownerOf(input, leavesByScript);
    if (owner === undefined) return;
    markedInputs++;
    psbt.updateInput(i, {
      tapBip32Derivation: [
        {
          masterFingerprint: fingerprint,
          pubkey: Buffer.from(owner.xOnlyHex, "hex"),
          path: bip86PathToString(owner.path),
          leafHashes: [],
        },
      ],
    });
  });
  // `_validate_prepegin` requires EVERY input internal (`sign_psbt_validate.c:526-751`),
  // and an unmarked input is also skipped by the expected-signature table — so it
  // would reach the device and die mid-ceremony, after the approval screens.
  // Fail here, at zero device I/O, exactly like the change branch below.
  if (markedInputs !== psbt.data.inputs.length) {
    throw new Error(
      `${psbt.data.inputs.length - markedInputs} of ${psbt.data.inputs.length} inputs are not owned by an ` +
        `authorized key-path leaf (TAP_INTERNAL_KEY and witnessUtxo must both belong to one leaf) — every ` +
        `Pre-PegIn input must be internal`,
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
    // (`sign_psbt_validate.c:709-712`); omit `change` for a change-less PSBT
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
