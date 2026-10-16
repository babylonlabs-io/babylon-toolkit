/**
 * Policy-mode PSBT shaping. The base app marks inputs internal only from
 * TAP_BIP32_DERIVATION (`preprocess_inputs.c` @ 78243239), and `_validate_prepegin`
 * needs every input internal; change pays the depositor's own `/0/0` address and
 * carries no derivation (`sign_psbt_validate.c:571-661` @ b89dd580).
 * Vectors: BIP-86 published test vectors.
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { bip86OutputScript } from "../expectedSignatures";
import { augmentPsbtForWalletPolicy, deriveReceiveXOnlyHex } from "../policyPsbt";
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

describe("deriveReceiveXOnlyHex", () => {
  it("derives the BIP-86 first receive key from the account xpub", () => {
    expect(deriveReceiveXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, 0)).toBe(RECEIVE0_XONLY);
  });

  it("rejects a non-integer, negative or hardened address index", () => {
    expect(() => deriveReceiveXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, -1)).toThrow(/addressIndex/);
    expect(() => deriveReceiveXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, 1.5)).toThrow(/addressIndex/);
    expect(() => deriveReceiveXOnlyHex(ACCOUNT_XPUB, MAINNET_VERSIONS, H)).toThrow(/addressIndex/);
  });
});

function prePeginLikePsbt(): string {
  // Two depositor key-path inputs → [HTLC-ish P2TR, 546 anchor to the depositor, change to the depositor].
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
  psbt.addOutput({ script: depositorSpk, value: 546 });
  psbt.addOutput({ script: depositorSpk, value: 48_454 });
  return psbt.toHex();
}

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
  const out = augmentPsbtForWalletPolicy({ ...base, depositorPath: DEPOSITOR_PATH });
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

  it("leaves every output without derivation, including the change to the depositor's own address", () => {
    for (const output of psbt.data.outputs) {
      expect(output.tapBip32Derivation).toBeUndefined();
      expect(output.tapInternalKey).toBeUndefined();
    }
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

    expect(() => augmentPsbtForWalletPolicy({ ...base, psbtHex: p.toHex(), depositorPath: DEPOSITOR_PATH })).toThrow(
      /1 of 1 inputs do not carry the depositor key/,
    );
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
