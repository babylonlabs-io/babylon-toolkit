/**
 * The key-path leaves a Pre-PegIn may spend under the wallet policy.
 *
 * The device marks an input internal when the wallet script at its declared
 * (branch, index) byte-matches the witnessUtxo, and signs with that leaf's
 * key (`base:process_in_outs.c:82-128`, `base:sign_input.c:544-608`
 * @ e400d8d8). A wrong-but-consistent declaration is signed, not refused, so
 * this module is the one place that derives every authorized leaf's key from
 * the policy xpub; callers name leaves by position and never supply a key.
 * The result is a branded handle that `prepareSignPsbt` checks provenance of.
 */

import { HDKey } from "@scure/bip32";
import { Buffer } from "buffer";

import {
  assertBip86Path,
  BIP86_CHANGE_BRANCH,
  BIP86_RECEIVE_BRANCH,
  bip86PathToString,
  HARDENED,
  PATH_ACCOUNT_LEVELS,
  PATH_ADDRESS_INDEX,
  PATH_BRANCH_INDEX,
} from "./bip86Path";
import type { AuthorizedKeyPathLeaf } from "./expectedSignatures";
import type { Bip32Versions, DefaultTaprootWalletPolicy } from "./walletPolicy";

const X_ONLY_HEX_RE = /^[0-9a-f]{64}$/;

/** A leaf under the policy account, named by position — never by key. */
export interface KeyPathLeaf {
  /** {@link BIP86_RECEIVE_BRANCH} or {@link BIP86_CHANGE_BRANCH}. */
  readonly branch: number;
  /** Non-hardened address index within the branch. */
  readonly addressIndex: number;
}

declare const authorizedKeyPathLeavesBrand: unique symbol;

/** The authorized set; produced only by {@link deriveAuthorizedKeyPathLeaves}. */
export interface AuthorizedKeyPathLeaves {
  /** The depositor's own leaf first, then each funding leaf in request order. */
  readonly leaves: readonly AuthorizedKeyPathLeaf[];
  readonly [authorizedKeyPathLeavesBrand]: true;
}

const producedHandles = new WeakSet<AuthorizedKeyPathLeaves>();

/** The policy expression is `@0/<0;1>/*`: the depositor path must be branch 0 under the policy's account. */
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

/** x-only key at `account/branch/addressIndex` from the device's verbatim account xpub. */
export function deriveBranchXOnlyHex(
  accountXpub: string,
  bip32Versions: Bip32Versions,
  branch: number,
  addressIndex: number,
): string {
  if (!Number.isInteger(addressIndex) || addressIndex < 0 || addressIndex >= HARDENED) {
    throw new Error("addressIndex must be a non-hardened integer in 0..2^31-1");
  }
  const node = HDKey.fromExtendedKey(accountXpub, bip32Versions).deriveChild(branch).deriveChild(addressIndex);
  if (!node.publicKey) throw new Error(`account xpub derived no public key at ${branch}/${addressIndex}`);
  return Buffer.from(node.publicKey.subarray(1)).toString("hex");
}

export interface DeriveAuthorizedKeyPathLeavesParams {
  readonly walletPolicy: DefaultTaprootWalletPolicy;
  /** The device-read depositor key (64 lowercase hex) — the leaf every flow signs with. */
  readonly depositorXOnlyHex: string;
  /** The depositor's 5-level path; must sit on branch 0 under the policy's key origin. */
  readonly depositorPath: readonly number[];
  /** Further leaves a Pre-PegIn may spend; omitted, the set is the depositor alone. */
  readonly fundingLeaves?: readonly KeyPathLeaf[];
}

/**
 * Derive the authorized set: the depositor's leaf, then each funding leaf's
 * key from the policy xpub. Rejects an off-branch, hardened or repeated leaf.
 */
export function deriveAuthorizedKeyPathLeaves(params: DeriveAuthorizedKeyPathLeavesParams): AuthorizedKeyPathLeaves {
  const { walletPolicy, depositorXOnlyHex, depositorPath, fundingLeaves = [] } = params;
  if (!X_ONLY_HEX_RE.test(depositorXOnlyHex)) throw new Error("depositorXOnlyHex must be 64 lowercase hex characters");
  assertDepositorPathUnderPolicy(depositorPath, walletPolicy.keyOriginPath);

  const accountPrefix = depositorPath.slice(0, PATH_ACCOUNT_LEVELS);
  const seenPositions = new Set<string>([`${depositorPath[PATH_BRANCH_INDEX]}/${depositorPath[PATH_ADDRESS_INDEX]}`]);
  const leaves: AuthorizedKeyPathLeaf[] = [
    {
      xOnlyHex: depositorXOnlyHex,
      branch: depositorPath[PATH_BRANCH_INDEX],
      addressIndex: depositorPath[PATH_ADDRESS_INDEX],
      path: [...depositorPath],
    },
  ];
  for (const leaf of fundingLeaves) {
    if (leaf.branch !== BIP86_RECEIVE_BRANCH && leaf.branch !== BIP86_CHANGE_BRANCH) {
      throw new Error(
        `funding leaf branch ${leaf.branch} is not a BIP-86 address branch (${BIP86_RECEIVE_BRANCH} or ` +
          `${BIP86_CHANGE_BRANCH}) — the policy expression @0/<0;1>/* cannot match it`,
      );
    }
    const position = `${leaf.branch}/${leaf.addressIndex}`;
    if (seenPositions.has(position)) {
      throw new Error(`funding leaf ${position} is named twice — an input there would have an ambiguous owner`);
    }
    // Validates the index (non-hardened integer) before anything is recorded.
    const xOnlyHex = deriveBranchXOnlyHex(
      walletPolicy.accountXpub,
      walletPolicy.bip32Versions,
      leaf.branch,
      leaf.addressIndex,
    );
    seenPositions.add(position);
    leaves.push({
      xOnlyHex,
      branch: leaf.branch,
      addressIndex: leaf.addressIndex,
      path: [...accountPrefix, leaf.branch, leaf.addressIndex],
    });
  }

  // Deep-frozen: a caller holding a handle must not be able to alter a leaf
  // before signing. The brand is type-only; the cast just names the type.
  for (const leaf of leaves) {
    Object.freeze(leaf.path);
    Object.freeze(leaf);
  }
  Object.freeze(leaves);
  const handle = Object.freeze({ leaves }) as unknown as AuthorizedKeyPathLeaves;
  producedHandles.add(handle);
  return handle;
}

/** @internal The leaves behind a handle; refuses anything this module did not produce. */
export function resolveAuthorizedKeyPathLeaves(handle: AuthorizedKeyPathLeaves): readonly AuthorizedKeyPathLeaf[] {
  if (!producedHandles.has(handle)) {
    throw new Error("unrecognised authorized key-path leaves — use deriveAuthorizedKeyPathLeaves's return value");
  }
  return handle.leaves;
}
