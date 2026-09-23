/**
 * The authorized key-path set: derived from the policy xpub by position, never
 * assembled from a caller's key. Vectors: BIP-86 published test vectors
 * ("abandon … about", account 0, mainnet).
 */

import { describe, expect, it } from "vitest";

import {
  deriveAuthorizedKeyPathLeaves,
  resolveAuthorizedKeyPathLeaves,
  type AuthorizedKeyPathLeaves,
} from "../keyPathLeaves";
import { buildDefaultTaprootPolicy } from "../walletPolicy";

const MAINNET_VERSIONS = { public: 0x0488b21e, private: 0x0488ade4 };
const ACCOUNT_XPUB =
  "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ";
const RECEIVE0_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115"; // m/86'/0'/0'/0/0
const RECEIVE1_XONLY = "83dfe85a3151d2517290da461fe2815591ef69f2b18a2ce63f01697a8b313145"; // m/86'/0'/0'/0/1
const CHANGE0_XONLY = "399f1b2f4393f29a18c937859c5dd8a77350103157eb880f02e8c08214277cef"; // m/86'/0'/0'/1/0
const H = 0x80000000;
const DEPOSITOR_PATH = [86 + H, 0 + H, 0 + H, 0, 0];

const POLICY = buildDefaultTaprootPolicy({
  masterFingerprintHex: "73c5da0a",
  coinType: 0,
  accountIndex: 0,
  accountXpub: ACCOUNT_XPUB,
  bip32Versions: MAINNET_VERSIONS,
});

const base = { walletPolicy: POLICY, depositorXOnlyHex: RECEIVE0_XONLY, depositorPath: DEPOSITOR_PATH };

describe("deriveAuthorizedKeyPathLeaves", () => {
  it("is the depositor's leaf alone when no funding leaves are named", () => {
    const { leaves } = deriveAuthorizedKeyPathLeaves(base);

    expect(leaves).toEqual([{ xOnlyHex: RECEIVE0_XONLY, branch: 0, addressIndex: 0, path: DEPOSITOR_PATH }]);
  });

  it("derives a funding leaf's key from the policy xpub at its position, with the full path", () => {
    const { leaves } = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 1, addressIndex: 0 }] });

    expect(leaves).toHaveLength(2);
    expect(leaves[1]).toEqual({
      xOnlyHex: CHANGE0_XONLY,
      branch: 1,
      addressIndex: 0,
      path: [86 + H, 0 + H, 0 + H, 1, 0],
    });
  });

  it("derives a second receive leaf to the published BIP-86 vector", () => {
    const { leaves } = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 0, addressIndex: 1 }] });

    expect(leaves[1].xOnlyHex).toBe(RECEIVE1_XONLY);
  });

  it("keeps the depositor first and funding leaves in request order", () => {
    const { leaves } = deriveAuthorizedKeyPathLeaves({
      ...base,
      fundingLeaves: [
        { branch: 1, addressIndex: 0 },
        { branch: 0, addressIndex: 1 },
      ],
    });

    expect(leaves.map((leaf) => leaf.xOnlyHex)).toEqual([RECEIVE0_XONLY, CHANGE0_XONLY, RECEIVE1_XONLY]);
  });

  it("rejects a branch the policy expression @0/<0;1>/* cannot match", () => {
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 2, addressIndex: 0 }] })).toThrow(
      /branch 2 is not a BIP-86 address branch/,
    );
  });

  it("rejects a hardened or negative funding index", () => {
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 1, addressIndex: H }] })).toThrow(
      /addressIndex must be a non-hardened integer/,
    );
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 1, addressIndex: -1 }] })).toThrow(
      /addressIndex must be a non-hardened integer/,
    );
  });

  it("rejects naming the depositor's own position as a funding leaf", () => {
    // The key at 0/0 is already authorized; naming it again would give an
    // input there two owners.
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 0, addressIndex: 0 }] })).toThrow(
      /funding leaf 0\/0 is named twice/,
    );
  });

  it("rejects the same funding leaf named twice", () => {
    expect(() =>
      deriveAuthorizedKeyPathLeaves({
        ...base,
        fundingLeaves: [
          { branch: 1, addressIndex: 0 },
          { branch: 1, addressIndex: 0 },
        ],
      }),
    ).toThrow(/funding leaf 1\/0 is named twice/);
  });

  it("still requires the depositor path to sit on branch 0 under the policy's key origin", () => {
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 1, 0] })).toThrow(
      /receive branch 0/,
    );
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, depositorPath: [86 + H, 1 + H, 0 + H, 0, 0] })).toThrow(
      /not under the wallet policy's key origin/,
    );
  });

  it("rejects a depositor key that is not 64 lowercase hex", () => {
    expect(() => deriveAuthorizedKeyPathLeaves({ ...base, depositorXOnlyHex: RECEIVE0_XONLY.toUpperCase() })).toThrow(
      /64 lowercase hex/,
    );
  });
});

describe("a derived set cannot be altered after derivation", () => {
  // The registry proves who made the handle, not that it is still what was
  // made. A caller could otherwise obtain a legitimate handle and push a leaf
  // of its own onto it — the exact "assemble a set from a key I chose" the
  // brand exists to prevent.
  const change = { branch: 1, addressIndex: 0 };

  it("refuses a leaf pushed onto the array", () => {
    const handle = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [change] });
    const forgedLeaf = { xOnlyHex: RECEIVE1_XONLY, branch: 0, addressIndex: 1, path: [86 + H, H, H, 0, 1] };

    expect(() => (handle.leaves as unknown[]).push(forgedLeaf)).toThrow(TypeError);
    expect(resolveAuthorizedKeyPathLeaves(handle)).toHaveLength(2);
  });

  it("refuses replacing the array on the handle", () => {
    const handle = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [change] });

    expect(() => {
      (handle as { leaves: unknown }).leaves = [];
    }).toThrow(TypeError);
    expect(resolveAuthorizedKeyPathLeaves(handle)).toHaveLength(2);
  });

  it("refuses rewriting a leaf's key", () => {
    const handle = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [change] });

    expect(() => {
      (handle.leaves[1] as { xOnlyHex: string }).xOnlyHex = RECEIVE1_XONLY;
    }).toThrow(TypeError);
    expect(resolveAuthorizedKeyPathLeaves(handle)[1].xOnlyHex).toBe(CHANGE0_XONLY);
  });

  it("refuses rewriting a leaf's path", () => {
    const handle = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [change] });

    expect(() => {
      (handle.leaves[1].path as number[])[3] = 0;
    }).toThrow(TypeError);
    expect(resolveAuthorizedKeyPathLeaves(handle)[1].path[3]).toBe(1);
  });
});

describe("resolveAuthorizedKeyPathLeaves", () => {
  it("returns the leaves of a set this module produced", () => {
    const handle = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [{ branch: 1, addressIndex: 0 }] });

    expect(resolveAuthorizedKeyPathLeaves(handle)).toBe(handle.leaves);
  });

  it("refuses a structurally identical object that was not derived here", () => {
    // The brand is type-only, so a host could cast any object to the type;
    // provenance is what stops an authorized set being built from a key a
    // caller chose.
    const forged = {
      leaves: [{ xOnlyHex: CHANGE0_XONLY, branch: 1, addressIndex: 0, path: [86 + H, 0 + H, 0 + H, 1, 0] }],
    } as unknown as AuthorizedKeyPathLeaves;

    expect(() => resolveAuthorizedKeyPathLeaves(forged)).toThrow(/unrecognised authorized key-path leaves/);
  });
});
