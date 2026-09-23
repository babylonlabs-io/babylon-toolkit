/**
 * Policy-mode PSBT shaping. The base app marks inputs/outputs internal only from
 * TAP_BIP32_DERIVATION (`preprocess_inputs.c`, `process_in_outs.c:114-117` @ e400d8d8),
 * and `_validate_prepegin` needs every input internal and change internal
 * (`sign_psbt_validate.c:526-751` @ b0c0ac4d). Vectors: BIP-86 published test vectors.
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { bip86OutputScript, createYieldCollector } from "../expectedSignatures";
import { deriveAuthorizedKeyPathLeaves } from "../keyPathLeaves";
import { augmentPsbtForWalletPolicy, deriveChangeXOnlyHex, psbtPaysChangeScript } from "../policyPsbt";
import { prepareSignPsbt } from "../signPsbtPrepare";
import { buildDefaultTaprootPolicy } from "../walletPolicy";

const MAINNET_VERSIONS = { public: 0x0488b21e, private: 0x0488ade4 };
/** BIP-86 published vectors ("abandon … about"). */
const ACCOUNT_XPUB =
  "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ";
const RECEIVE0_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115"; // m/86'/0'/0'/0/0
const CHANGE0_XONLY = "399f1b2f4393f29a18c937859c5dd8a77350103157eb880f02e8c08214277cef"; // m/86'/0'/0'/1/0
const FINGERPRINT = "73c5da0a";
const H = 0x80000000;
const DEPOSITOR_PATH = [86 + H, 0 + H, 0 + H, 0, 0];

describe("deriveChangeXOnlyHex", () => {
  it("derives the BIP-86 first change key from the account xpub", () => {
    expect(deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, 0)).toBe(CHANGE0_XONLY);
  });

  it("rejects a non-integer, negative or hardened address index", () => {
    expect(() => deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, -1)).toThrow(/addressIndex/);
    expect(() => deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, 1.5)).toThrow(/addressIndex/);
    expect(() => deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, H)).toThrow(/addressIndex/);
  });
});

function prePeginLikePsbt(): string {
  // Two depositor key-path inputs, one HTLC-ish P2TR output, one change output to the change key.
  const psbt = new Psbt();
  const depositorSpk = bip86OutputScript(RECEIVE0_XONLY);
  for (let i = 0; i < 2; i++) {
    psbt.addInput({
      hash: Buffer.alloc(32, i + 1),
      index: 0,
      witnessUtxo: { script: depositorSpk, value: 100_000 },
      tapInternalKey: Buffer.from(RECEIVE0_XONLY, "hex"),
    });
  }
  psbt.addOutput({
    script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]),
    value: 150_000,
  });
  psbt.addOutput({ script: bip86OutputScript(CHANGE0_XONLY), value: 49_000 });
  return psbt.toHex();
}

/** Same shape as {@link prePeginLikePsbt} but paying the change key at `addressIndex`. */
function psbtPayingChangeIndex(addressIndex: number): string {
  const psbt = new Psbt();
  const depositorSpk = bip86OutputScript(RECEIVE0_XONLY);
  psbt.addInput({
    hash: Buffer.alloc(32, 1),
    index: 0,
    witnessUtxo: { script: depositorSpk, value: 100_000 },
    tapInternalKey: Buffer.from(RECEIVE0_XONLY, "hex"),
  });
  psbt.addOutput({ script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]), value: 50_000 });
  psbt.addOutput({
    script: bip86OutputScript(deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, addressIndex)),
    value: 49_000,
  });
  return psbt.toHex();
}

describe("psbtPaysChangeScript", () => {
  it("is true when an output pays the BIP-86 P2TR of the change key", () => {
    expect(psbtPaysChangeScript(prePeginLikePsbt(), CHANGE0_XONLY)).toBe(true);
  });

  it("is false for a change-less PSBT — the Max-sweep and dust-revert shape", () => {
    const psbt = new Psbt();
    psbt.addInput({
      hash: Buffer.alloc(32, 1),
      index: 0,
      witnessUtxo: { script: bip86OutputScript(RECEIVE0_XONLY), value: 100_000 },
      tapInternalKey: Buffer.from(RECEIVE0_XONLY, "hex"),
    });
    psbt.addOutput({ script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]), value: 99_000 });

    expect(psbtPaysChangeScript(psbt.toHex(), CHANGE0_XONLY)).toBe(false);
  });
});

describe("augmentPsbtForWalletPolicy", () => {
  const POLICY = buildDefaultTaprootPolicy({
    masterFingerprintHex: FINGERPRINT,
    coinType: 0,
    accountIndex: 0,
    accountXpub: ACCOUNT_XPUB,
    bip32Versions: MAINNET_VERSIONS,
  });
  const base = {
    psbtHex: prePeginLikePsbt(),
    depositorXOnlyHex: RECEIVE0_XONLY,
    walletPolicy: POLICY,
  };
  const out = augmentPsbtForWalletPolicy({
    ...base,
    depositorPath: DEPOSITOR_PATH,
    change: { addressIndex: 0 },
  });
  const psbt = Psbt.fromHex(out);

  it("adds TAP_BIP32_DERIVATION (fingerprint + depositor path, no leaf hashes) to every depositor key-path input", () => {
    for (const input of psbt.data.inputs) {
      const [d] = input.tapBip32Derivation!;
      expect(Buffer.from(d.pubkey).toString("hex")).toBe(RECEIVE0_XONLY);
      expect(Buffer.from(d.masterFingerprint).toString("hex")).toBe(FINGERPRINT);
      expect(d.path).toBe("m/86'/0'/0'/0/0");
      expect(d.leafHashes).toHaveLength(0);
    }
  });

  it("marks the change output with tapInternalKey + derivation on the change branch, and leaves other outputs untouched", () => {
    expect(psbt.data.outputs[0].tapBip32Derivation).toBeUndefined();
    expect(psbt.data.outputs[0].tapInternalKey).toBeUndefined();
    const change = psbt.data.outputs[1];
    expect(Buffer.from(change.tapInternalKey!).toString("hex")).toBe(CHANGE0_XONLY);
    const [d] = change.tapBip32Derivation!;
    expect(Buffer.from(d.pubkey).toString("hex")).toBe(CHANGE0_XONLY);
    expect(d.path).toBe("m/86'/0'/0'/1/0");
  });

  it("derives the change key and its path from the same account index, so they cannot disagree", () => {
    // The caller supplies only the index; a key/path pair that described
    // different children used to be accepted here and die on-device.
    const atIndex1 = Psbt.fromHex(
      augmentPsbtForWalletPolicy({
        ...base,
        psbtHex: psbtPayingChangeIndex(1),
        depositorPath: DEPOSITOR_PATH,
        change: { addressIndex: 1 },
      }),
    );
    const change = atIndex1.data.outputs[1];
    expect(Buffer.from(change.tapInternalKey!).toString("hex")).toBe(deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, 1));
    expect(change.tapBip32Derivation![0].path).toBe("m/86'/0'/0'/1/1");
  });

  it("does not change the unsigned transaction", () => {
    const before = Psbt.fromHex(prePeginLikePsbt()).data.globalMap.unsignedTx.toBuffer();
    expect(psbt.data.globalMap.unsignedTx.toBuffer().equals(before)).toBe(true);
  });

  it("rejects a PSBT with an input the depositor key does not own", () => {
    // _validate_prepegin needs EVERY input internal; an unmarked one reaches
    // the device and dies mid-ceremony, after the approval screens.
    const p = new Psbt();
    p.addInput({
      hash: Buffer.alloc(32, 9),
      index: 0,
      witnessUtxo: { script: bip86OutputScript(CHANGE0_XONLY), value: 1 },
      tapInternalKey: Buffer.from(CHANGE0_XONLY, "hex"),
    });
    p.addOutput({ script: Buffer.from([0x6a]), value: 0 });

    expect(() =>
      augmentPsbtForWalletPolicy({ ...base, psbtHex: p.toHex(), depositorPath: DEPOSITOR_PATH }),
    ).toThrow(/1 of 1 inputs are not owned by an authorized key-path leaf/);
  });

  it("rejects paths that are not 5 levels, carry non-u32 levels, or sit on the change branch", () => {
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0, 0] })).toThrow(/depositorPath/);
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 0, 2 ** 32] })).toThrow(
      /depositorPath/,
    );
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 1, 0] })).toThrow(
      /receive branch 0/,
    );
  });

  it("rejects a depositorPath that is not under the policy's key origin", () => {
    // The policy is built over m/86'/0'/0'; a path under another purpose,
    // coin or account can never be matched against `@0/<0;1>/*` on-device.
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [84 + H, 0 + H, 0 + H, 0, 0] })).toThrow(
      /BIP-86 purpose/,
    );
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 1 + H, 0 + H, 0, 0] })).toThrow(
      /key origin/,
    );
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 1 + H, 0, 0] })).toThrow(
      /key origin/,
    );
  });

  it("rejects a change index no output pays", () => {
    // m/86'/0'/0'/1/1 — a real point on the change branch, but not this PSBT's change output.
    expect(() =>
      augmentPsbtForWalletPolicy({ ...base, depositorPath: DEPOSITOR_PATH, change: { addressIndex: 1 } }),
    ).toThrow(/matches no output/);
  });

  it("rejects a hardened address index or an unhardened account level", () => {
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 0, 0 + H] })).toThrow(
      /depositorPath must harden/,
    );
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0, 0, 0] })).toThrow(
      /depositorPath must harden/,
    );
  });

  it("is accepted by prepareSignPsbt in policy mode as an all-key-path table (one yield per input)", () => {
    const prepared = prepareSignPsbt({ psbtHex: out, depositorXOnlyHex: RECEIVE0_XONLY, walletPolicy: POLICY });
    expect(prepared.table.expectedYieldCount).toBe(2);
    for (const expectation of prepared.table.byInput.values()) {
      expect(expectation.kind).toBe("taproot-keypath");
    }
  });
});

/** One input on the depositor's receive leaf, one on the first change leaf, no change output. */
function mixedBranchPsbt(overrides?: { input1Script?: Buffer; input1Key?: string }): string {
  const psbt = new Psbt();
  psbt.addInput({
    hash: Buffer.alloc(32, 1),
    index: 0,
    witnessUtxo: { script: bip86OutputScript(RECEIVE0_XONLY), value: 100_000 },
    tapInternalKey: Buffer.from(RECEIVE0_XONLY, "hex"),
  });
  psbt.addInput({
    hash: Buffer.alloc(32, 2),
    index: 0,
    witnessUtxo: { script: overrides?.input1Script ?? bip86OutputScript(CHANGE0_XONLY), value: 50_000 },
    tapInternalKey: Buffer.from(overrides?.input1Key ?? CHANGE0_XONLY, "hex"),
  });
  psbt.addOutput({ script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]), value: 149_000 });
  return psbt.toHex();
}

describe("augmentPsbtForWalletPolicy with funding leaves (Pre-PegIn funded from both branches)", () => {
  const POLICY = buildDefaultTaprootPolicy({
    masterFingerprintHex: FINGERPRINT,
    coinType: 0,
    accountIndex: 0,
    accountXpub: ACCOUNT_XPUB,
    bip32Versions: MAINNET_VERSIONS,
  });
  const base = { depositorXOnlyHex: RECEIVE0_XONLY, walletPolicy: POLICY, depositorPath: DEPOSITOR_PATH };
  const CHANGE_LEAF = { branch: 1, addressIndex: 0 };

  it("declares each input at the leaf that owns it — the depositor's and the change branch's", () => {
    const out = augmentPsbtForWalletPolicy({ ...base, psbtHex: mixedBranchPsbt(), fundingLeaves: [CHANGE_LEAF] });
    const [input0, input1] = Psbt.fromHex(out).data.inputs;

    const [d0] = input0.tapBip32Derivation!;
    expect(Buffer.from(d0.pubkey).toString("hex")).toBe(RECEIVE0_XONLY);
    expect(d0.path).toBe("m/86'/0'/0'/0/0");
    const [d1] = input1.tapBip32Derivation!;
    expect(Buffer.from(d1.pubkey).toString("hex")).toBe(CHANGE0_XONLY);
    expect(d1.path).toBe("m/86'/0'/0'/1/0");
    expect(Buffer.from(d1.masterFingerprint).toString("hex")).toBe(FINGERPRINT);
  });

  it("rejects a change-branch outpoint labelled with the depositor's key", () => {
    // Consistent with neither leaf: the script is the change leaf's, the key
    // the depositor's. Without both halves pinned to ONE leaf the device would
    // be told a path whose key does not own the prevout.
    expect(() =>
      augmentPsbtForWalletPolicy({
        ...base,
        psbtHex: mixedBranchPsbt({ input1Key: RECEIVE0_XONLY }),
        fundingLeaves: [CHANGE_LEAF],
      }),
    ).toThrow(/1 of 2 inputs are not owned by an authorized key-path leaf/);
  });

  it("accepts a change-branch outpoint labelled with the depositor's key AND script — the documented limit", () => {
    // Internally consistent — key and script agree — but it is the wrong
    // prevout's script, and only an outpoint-keyed check (the SDK's) can tell.
    // Here it is simply a second depositor input, which the marker accepts:
    // pinned as the limit of this gate so it is never mistaken for coverage.
    const out = augmentPsbtForWalletPolicy({
      ...base,
      psbtHex: mixedBranchPsbt({ input1Key: RECEIVE0_XONLY, input1Script: bip86OutputScript(RECEIVE0_XONLY) }),
      fundingLeaves: [CHANGE_LEAF],
    });

    expect(Psbt.fromHex(out).data.inputs[1].tapBip32Derivation![0].path).toBe("m/86'/0'/0'/0/0");
  });

  it("rejects a depositor-script outpoint labelled with the change key", () => {
    expect(() =>
      augmentPsbtForWalletPolicy({
        ...base,
        psbtHex: mixedBranchPsbt({ input1Script: bip86OutputScript(RECEIVE0_XONLY) }),
        fundingLeaves: [CHANGE_LEAF],
      }),
    ).toThrow(/1 of 2 inputs are not owned by an authorized key-path leaf/);
  });

  it("rejects a change-branch input when the change leaf is not named as a funding leaf", () => {
    // Naming is the authorization: every other flow passes no funding leaves,
    // and stays pinned to the depositor's inputs exactly as before.
    expect(() => augmentPsbtForWalletPolicy({ ...base, psbtHex: mixedBranchPsbt() })).toThrow(
      /1 of 2 inputs are not owned by an authorized key-path leaf/,
    );
  });

  it("rejects an input on a leaf the device policy cannot cover", () => {
    // A second receive address (0/1) is a legitimate leaf; here it is NOT
    // named, so its input is foreign. Naming it would authorize it.
    const RECEIVE1_XONLY = "83dfe85a3151d2517290da461fe2815591ef69f2b18a2ce63f01697a8b313145";
    const psbtHex = mixedBranchPsbt({ input1Key: RECEIVE1_XONLY, input1Script: bip86OutputScript(RECEIVE1_XONLY) });

    expect(() => augmentPsbtForWalletPolicy({ ...base, psbtHex, fundingLeaves: [CHANGE_LEAF] })).toThrow(
      /1 of 2 inputs are not owned/,
    );
    const out = augmentPsbtForWalletPolicy({
      ...base,
      psbtHex,
      fundingLeaves: [CHANGE_LEAF, { branch: 0, addressIndex: 1 }],
    });
    expect(Psbt.fromHex(out).data.inputs[1].tapBip32Derivation![0].path).toBe("m/86'/0'/0'/0/1");
  });

  describe("prepareSignPsbt over the marked PSBT", () => {
    const marked = augmentPsbtForWalletPolicy({ ...base, psbtHex: mixedBranchPsbt(), fundingLeaves: [CHANGE_LEAF] });
    const authorized = deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [CHANGE_LEAF] });

    it("expects one key-path yield per input, each under its own tweaked output key", () => {
      const prepared = prepareSignPsbt({
        psbtHex: marked,
        depositorXOnlyHex: RECEIVE0_XONLY,
        walletPolicy: POLICY,
        authorizedKeyPathLeaves: authorized,
      });

      expect(prepared.table.expectedYieldCount).toBe(2);
      const input1 = prepared.table.byInput.get(1);
      expect(input1).toEqual({
        kind: "taproot-keypath",
        expectedOutputKeyHex: bip86OutputScript(CHANGE0_XONLY).subarray(2).toString("hex"),
      });
    });

    it("rejects the same PSBT when the set is not supplied — naming the leaves is the authorization", () => {
      expect(() => prepareSignPsbt({ psbtHex: marked, depositorXOnlyHex: RECEIVE0_XONLY, walletPolicy: POLICY })).toThrow(
        /input 1 internal key is not an authorized key-path key/,
      );
    });

    it("rejects a set that was not produced by deriveAuthorizedKeyPathLeaves, before reading the PSBT", () => {
      const forged = { leaves: authorized.leaves } as typeof authorized;

      expect(() =>
        prepareSignPsbt({
          psbtHex: "zz",
          depositorXOnlyHex: RECEIVE0_XONLY,
          walletPolicy: POLICY,
          authorizedKeyPathLeaves: forged,
        }),
      ).toThrow(/unrecognised authorized key-path leaves/);
    });

    it("accepts a device YIELD carrying the change leaf's tweaked output key for input 1", () => {
      const prepared = prepareSignPsbt({
        psbtHex: marked,
        depositorXOnlyHex: RECEIVE0_XONLY,
        walletPolicy: POLICY,
        authorizedKeyPathLeaves: authorized,
      });
      const collector = createYieldCollector(prepared.table);
      // `varint(input) ‖ augm_len(0x20) ‖ output key(32) ‖ sig(64)` (`base:sign_input.c:47-87`).
      const yieldFor = (inputIndex: number, xOnlyHex: string) =>
        Buffer.concat([
          Buffer.from([inputIndex, 0x20]),
          bip86OutputScript(xOnlyHex).subarray(2),
          Buffer.alloc(64, 0x11),
        ]);

      collector.assertAndRecord(yieldFor(0, RECEIVE0_XONLY));
      collector.assertAndRecord(yieldFor(1, CHANGE0_XONLY));
      expect(() => collector.assertComplete()).not.toThrow();
    });

    it("rejects a YIELD that signs input 1 under the depositor's output key instead of the change leaf's", () => {
      const prepared = prepareSignPsbt({
        psbtHex: marked,
        depositorXOnlyHex: RECEIVE0_XONLY,
        walletPolicy: POLICY,
        authorizedKeyPathLeaves: authorized,
      });
      const collector = createYieldCollector(prepared.table);
      const wrongKey = Buffer.concat([
        Buffer.from([1, 0x20]),
        bip86OutputScript(RECEIVE0_XONLY).subarray(2),
        Buffer.alloc(64, 0x11),
      ]);

      expect(() => collector.assertAndRecord(wrongKey)).toThrow(/wrong-signer-key/);
    });
  });

  describe("the ownership tripwire follows the authorized set", () => {
    // An input that spends a wallet-owned P2TR but carries no signing metadata
    // is a builder bug that would otherwise reach the device and die
    // mid-ceremony. Before this change the tripwire recognised only the
    // depositor's script; a change-branch input that lost its metadata slipped
    // past the host. It must fire exactly for the leaves that are authorized.
    function unmarkedChangeInputPsbt(): string {
      const psbt = new Psbt();
      psbt.addInput({
        hash: Buffer.alloc(32, 1),
        index: 0,
        witnessUtxo: { script: bip86OutputScript(RECEIVE0_XONLY), value: 100_000 },
        tapInternalKey: Buffer.from(RECEIVE0_XONLY, "hex"),
      });
      // The change leaf's outpoint with NO TAP_INTERNAL_KEY at all.
      psbt.addInput({
        hash: Buffer.alloc(32, 2),
        index: 0,
        witnessUtxo: { script: bip86OutputScript(CHANGE0_XONLY), value: 50_000 },
      });
      psbt.addOutput({ script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]), value: 149_000 });
      return psbt.toHex();
    }

    it("fires for an unsigned change-branch input once the change leaf is authorized", () => {
      expect(() =>
        prepareSignPsbt({
          psbtHex: unmarkedChangeInputPsbt(),
          depositorXOnlyHex: RECEIVE0_XONLY,
          authorizedKeyPathLeaves: deriveAuthorizedKeyPathLeaves({ ...base, fundingLeaves: [CHANGE_LEAF] }),
        }),
      ).toThrow(/input 1 spends a wallet-owned UTXO but carries no signing metadata/);
    });

    it("does not recognise the change script when the change leaf is not authorized — the pre-existing scope", () => {
      // The depositor-only tripwire cannot know the change script is ours; the
      // input is then simply an unsigned foreign input, which the table accepts
      // (NoPayout inputs 1-2 have this shape).
      const prepared = prepareSignPsbt({ psbtHex: unmarkedChangeInputPsbt(), depositorXOnlyHex: RECEIVE0_XONLY });

      expect([...prepared.table.byInput.keys()]).toEqual([0]);
    });
  });
});
