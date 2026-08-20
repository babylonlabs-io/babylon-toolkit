/**
 * Policy-mode PSBT shaping. The base app marks inputs/outputs internal only from
 * TAP_BIP32_DERIVATION (`preprocess_inputs.c`, `process_in_outs.c:114-117` @ e400d8d8),
 * and `_validate_prepegin` needs every input internal and change internal
 * (`sign_psbt_validate.c:334-545` @ 4decf822). Vectors: BIP-86 published test vectors.
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { bip86OutputScript } from "../expectedSignatures";
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
const CHANGE_PATH = [86 + H, 0 + H, 0 + H, 1, 0];

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
  const out = augmentPsbtForWalletPolicy({
    psbtHex: prePeginLikePsbt(),
    depositorXOnlyHex: RECEIVE0_XONLY,
    masterFingerprintHex: FINGERPRINT,
    depositorPath: DEPOSITOR_PATH,
    change: { xOnlyHex: CHANGE0_XONLY, path: CHANGE_PATH },
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

  it("does not change the unsigned transaction", () => {
    const before = Psbt.fromHex(prePeginLikePsbt()).data.globalMap.unsignedTx.toBuffer();
    expect(psbt.data.globalMap.unsignedTx.toBuffer().equals(before)).toBe(true);
  });

  it("leaves inputs whose internal key is not the depositor's alone", () => {
    const p = new Psbt();
    p.addInput({
      hash: Buffer.alloc(32, 9),
      index: 0,
      witnessUtxo: { script: bip86OutputScript(CHANGE0_XONLY), value: 1 },
      tapInternalKey: Buffer.from(CHANGE0_XONLY, "hex"),
    });
    p.addOutput({ script: Buffer.from([0x6a]), value: 0 });
    const res = Psbt.fromHex(
      augmentPsbtForWalletPolicy({
        psbtHex: p.toHex(),
        depositorXOnlyHex: RECEIVE0_XONLY,
        masterFingerprintHex: FINGERPRINT,
        depositorPath: DEPOSITOR_PATH,
      }),
    );
    expect(res.data.inputs[0].tapBip32Derivation).toBeUndefined();
  });

  it("rejects paths that are not 5 levels, carry non-u32 levels, or break the receive/change/account pairing", () => {
    const base = {
      psbtHex: prePeginLikePsbt(),
      depositorXOnlyHex: RECEIVE0_XONLY,
      masterFingerprintHex: FINGERPRINT,
    };
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0, 0] })).toThrow(/depositorPath/);
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 0, 2 ** 32] })).toThrow(
      /depositorPath/,
    );
    // depositor on the change branch
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 1, 0] })).toThrow(
      /receive branch 0/,
    );
    // change on the receive branch
    expect(() =>
      augmentPsbtForWalletPolicy({
        ...base,
        depositorPath: DEPOSITOR_PATH,
        change: { xOnlyHex: CHANGE0_XONLY, path: [86 + H, 0 + H, 0 + H, 0, 0] },
      }),
    ).toThrow(/change branch 1/);
    // change under a different account
    expect(() =>
      augmentPsbtForWalletPolicy({
        ...base,
        depositorPath: DEPOSITOR_PATH,
        change: { xOnlyHex: CHANGE0_XONLY, path: [86 + H, 0 + H, 1 + H, 1, 0] },
      }),
    ).toThrow(/same purpose/);
    expect(() =>
      augmentPsbtForWalletPolicy({
        ...base,
        depositorPath: DEPOSITOR_PATH,
        change: { xOnlyHex: CHANGE0_XONLY, path: [1, 0] },
      }),
    ).toThrow(/change.path/);
  });

  it("rejects a change key no output pays", () => {
    // m/86'/0'/0'/1/1 — a real point on the change branch, but not this PSBT's change output.
    const unusedChangeKey = deriveChangeXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, 1);
    expect(() =>
      augmentPsbtForWalletPolicy({
        psbtHex: prePeginLikePsbt(),
        depositorXOnlyHex: RECEIVE0_XONLY,
        masterFingerprintHex: FINGERPRINT,
        depositorPath: DEPOSITOR_PATH,
        change: { xOnlyHex: unusedChangeKey, path: [86 + H, 0 + H, 0 + H, 1, 1] },
      }),
    ).toThrow(/matches no output/);
  });

  it("rejects a hardened address index or an unhardened account level", () => {
    const base = {
      psbtHex: prePeginLikePsbt(),
      depositorXOnlyHex: RECEIVE0_XONLY,
      masterFingerprintHex: FINGERPRINT,
    };
    expect(() => augmentPsbtForWalletPolicy({ ...base, depositorPath: [86 + H, 0 + H, 0 + H, 0, 0 + H] })).toThrow(
      /depositorPath must harden/,
    );
    expect(() =>
      augmentPsbtForWalletPolicy({
        ...base,
        depositorPath: DEPOSITOR_PATH,
        change: { xOnlyHex: CHANGE0_XONLY, path: [86 + H, 0 + H, 0, 1, 0] },
      }),
    ).toThrow(/change.path must harden/);
  });

  it("is accepted by prepareSignPsbt in policy mode as an all-key-path table (one yield per input)", () => {
    const policy = buildDefaultTaprootPolicy({
      masterFingerprintHex: FINGERPRINT,
      coinType: 0,
      accountIndex: 0,
      accountXpub: ACCOUNT_XPUB,
    });
    const prepared = prepareSignPsbt({ psbtHex: out, depositorXOnlyHex: RECEIVE0_XONLY, walletPolicy: policy });
    expect(prepared.table.expectedYieldCount).toBe(2);
    for (const expectation of prepared.table.byInput.values()) {
      expect(expectation.kind).toBe("taproot-keypath");
    }
  });
});
