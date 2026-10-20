/**
 * Wallet-policy PSBT shaping for the vault app's key-path flows (Pre-PegIn).
 *
 * The base app marks an input internal when its TAP_BIP32_DERIVATION matches a
 * policy key expression at (change, index) and the script equals the policy
 * script there. `_validate_prepegin` requires every input internal, and
 * `_validate_prepegin_outputs` takes Pre-PegIn change only at the depositor's
 * own `/0/0` address, by script, value and order, so change outputs carry no
 * derivation. This module adds the input fields only; it never touches the
 * unsigned transaction.
 *
 * @module ledger-vault-signer/policyPsbt
 */
import { HDKey } from "@scure/bip32";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import {
  assertBip86Path,
  BIP86_RECEIVE_BRANCH,
  bip86PathToString,
  HARDENED,
  PATH_ACCOUNT_LEVELS,
  PATH_BRANCH_INDEX,
} from "./bip86Path";
import type { Bip32Versions, DefaultTaprootWalletPolicy } from "./walletPolicy";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * The device matches derivations against the policy key expression
 * `@0/<0;1>/*`: depositor inputs live on branch 0 under the SAME account as the
 * policy key — anything else cannot be internal.
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

/** x-only key at `account/0/addressIndex` — the depositor branch. */
export function deriveReceiveXOnlyHex(accountXpub: string, bip32Versions: Bip32Versions, addressIndex: number): string {
  if (!Number.isInteger(addressIndex) || addressIndex < 0 || addressIndex >= HARDENED) {
    throw new Error("addressIndex must be a non-hardened integer in 0..2^31-1");
  }
  const node = HDKey.fromExtendedKey(accountXpub, bip32Versions)
    .deriveChild(BIP86_RECEIVE_BRANCH)
    .deriveChild(addressIndex);
  if (!node.publicKey) throw new Error(`account xpub derived no public key at ${BIP86_RECEIVE_BRANCH}/${addressIndex}`);
  return Buffer.from(node.publicKey.subarray(1)).toString("hex");
}

export interface AugmentPsbtForWalletPolicyParams {
  readonly psbtHex: string;
  readonly depositorXOnlyHex: string;
  /** The policy the PSBT signs under — supplies the fingerprint, account origin and xpub. */
  readonly walletPolicy: DefaultTaprootWalletPolicy;
  readonly depositorPath: readonly number[];
}

export function augmentPsbtForWalletPolicy(params: AugmentPsbtForWalletPolicyParams): string {
  const { psbtHex, depositorXOnlyHex, walletPolicy, depositorPath } = params;
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
  // `_validate_prepegin` requires EVERY input internal, and an unmarked input is
  // also skipped by the expected-signature table — so it would reach the device
  // and die mid-ceremony, after the approval screens. Fail here, at zero device I/O.
  if (markedInputs !== psbt.data.inputs.length) {
    throw new Error(
      `${psbt.data.inputs.length - markedInputs} of ${psbt.data.inputs.length} inputs do not carry the ` +
        `depositor key as TAP_INTERNAL_KEY — every Pre-PegIn input must be internal`,
    );
  }
  return psbt.toHex();
}
