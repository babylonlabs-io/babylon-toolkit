/**
 * PoP PSBT golden tests. The to_spend txid vector is the Babylon canonical one
 * the firmware pins (`tests/test_screen7_pop.py:115-117`); every PSBT field is
 * asserted against `_validate_display_pop` (`sign_psbt_validate.c:2591-2869`
 * @ 4decf822) — see the device-contract block in the plan.
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { bip86OutputScript } from "../expectedSignatures";
import { bip322ToSpendTxid, buildPopPsbtHex, POP_MESSAGE_PROPRIETARY_KEY } from "../popPsbt";
import { prepareSignPsbt } from "../signPsbtPrepare";
import { PsbtV2 } from "../vendor/ledger-bitcoin/psbtv2";

const CANONICAL_MESSAGE =
  "0xcabdce2a2010a9a88c75506a86dba669716d47fa:11155111:pegin:0xb331467c4db13dccc77fa66c2d185b74ed57ab80";
const CANONICAL_TWEAKED_KEY = "3ba1d14c8716be7930aebf51cd0866ac56af9b85078df5fc31756a094ba55c6f";
const CANONICAL_TO_SPEND_TXID = "e54c4ffe9be74e12ca2e9461da9f5c49626ce5b2c600abaf5320c25124fc129c";

/** BIP-86 published vector: first receive key of the "abandon … about" seed. */
const DEPOSITOR_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const MASTER_FINGERPRINT = "73c5da0a";
const HARDENED = 0x80000000;
const DEPOSITOR_PATH = [86 + HARDENED, 0 + HARDENED, 0 + HARDENED, 0, 0];
const MESSAGE = "0xabcdef1234567890abcdef1234567890abcdef12:11155111:pegin:0x1234567890abcdef1234567890abcdef12345678";

describe("bip322ToSpendTxid", () => {
  it("matches the Babylon canonical vector (raw SHA256d, not display-reversed)", () => {
    const txid = bip322ToSpendTxid(
      new TextEncoder().encode(CANONICAL_MESSAGE),
      Buffer.from(CANONICAL_TWEAKED_KEY, "hex"),
    );
    expect(Buffer.from(txid).toString("hex")).toBe(CANONICAL_TO_SPEND_TXID);
  });
});

describe("buildPopPsbtHex", () => {
  const hex = buildPopPsbtHex({
    message: MESSAGE,
    depositorXOnlyHex: DEPOSITOR_XONLY,
    masterFingerprintHex: MASTER_FINGERPRINT,
    depositorPath: DEPOSITOR_PATH,
  });
  const psbt = Psbt.fromHex(hex);

  it("is a v0 PSBT whose unsigned tx has version 0, locktime 0, one input with sequence 0 and one OP_RETURN output of value 0", () => {
    // Public bitcoinjs getters (psbt.d.ts:68-70, txInputs/txOutputs) — never the private __CACHE.
    expect(psbt.version).toBe(0);
    expect(psbt.locktime).toBe(0);
    expect(psbt.txInputs).toHaveLength(1);
    expect(psbt.txInputs[0].sequence).toBe(0);
    expect(psbt.txInputs[0].index).toBe(0);
    expect(psbt.txOutputs).toHaveLength(1);
    expect(psbt.txOutputs[0].value).toBe(0);
    expect(Buffer.from(psbt.txOutputs[0].script).toString("hex")).toBe("6a");
  });

  it("spends the BIP-322 to_spend output of the depositor's BIP-86 key, txid in raw wire order", () => {
    const spk = bip86OutputScript(DEPOSITOR_XONLY);
    const expectedTxid = bip322ToSpendTxid(new TextEncoder().encode(MESSAGE), spk.subarray(2));
    expect(Buffer.from(psbt.txInputs[0].hash).toString("hex")).toBe(Buffer.from(expectedTxid).toString("hex"));
    const input = psbt.data.inputs[0];
    expect(input.witnessUtxo?.value).toBe(0);
    expect(Buffer.from(input.witnessUtxo!.script).toString("hex")).toBe(spk.toString("hex"));
    expect(Buffer.from(input.tapInternalKey!).toString("hex")).toBe(DEPOSITOR_XONLY);
    expect(input.tapMerkleRoot).toBeUndefined();
    expect(input.sighashType).toBeUndefined();
  });

  it("carries TAP_BIP32_DERIVATION keyed by the internal key with the master fingerprint and the 5-level BIP-86 path", () => {
    const [derivation] = psbt.data.inputs[0].tapBip32Derivation!;
    expect(Buffer.from(derivation.pubkey).toString("hex")).toBe(DEPOSITOR_XONLY);
    expect(Buffer.from(derivation.masterFingerprint).toString("hex")).toBe(MASTER_FINGERPRINT);
    expect(derivation.path).toBe("m/86'/0'/0'/0/0");
    expect(derivation.leafHashes).toHaveLength(0);
  });

  it("carries the message in the FC 06 'bvault' 00 global proprietary key", () => {
    const unknown = psbt.data.globalMap.unknownKeyVals!;
    expect(unknown).toHaveLength(1);
    expect(Buffer.from(unknown[0].key).toString("hex")).toBe("fc06627661756c7400");
    expect(Buffer.from(unknown[0].key).equals(Buffer.from(POP_MESSAGE_PROPRIETARY_KEY))).toBe(true);
    expect(Buffer.from(unknown[0].value).toString("ascii")).toBe(MESSAGE);
  });

  it("normalizes to a v2 PSBT where OUTPUT_INDEX and SEQUENCE are physically present and zero", () => {
    // The device demands both keys on the wire (`:2806-2831`); the vendored
    // v0→v2 converter is what `prepareSignPsbt` runs, so assert on its output.
    const v2 = new PsbtV2();
    v2.deserialize(Buffer.from(hex, "hex"));
    expect(v2.getInputOutputIndex(0)).toBe(0);
    expect(v2.getInputSequence(0)).toBe(0);
    expect(v2.getGlobalInputCount()).toBe(1);
    expect(v2.getGlobalOutputCount()).toBe(1);
  });

  it("validates only the hex/shape inputs — message grammar and length are the device's to enforce", () => {
    expect(() =>
      buildPopPsbtHex({
        message: MESSAGE,
        depositorXOnlyHex: "zz",
        masterFingerprintHex: MASTER_FINGERPRINT,
        depositorPath: DEPOSITOR_PATH,
      }),
    ).toThrow(/depositorXOnlyHex/);
    expect(() =>
      buildPopPsbtHex({
        message: MESSAGE,
        depositorXOnlyHex: DEPOSITOR_XONLY,
        masterFingerprintHex: "73c5",
        depositorPath: DEPOSITOR_PATH,
      }),
    ).toThrow(/masterFingerprintHex/);
    expect(() =>
      buildPopPsbtHex({
        message: MESSAGE,
        depositorXOnlyHex: DEPOSITOR_XONLY,
        masterFingerprintHex: MASTER_FINGERPRINT,
        depositorPath: [1, 2],
      }),
    ).toThrow(/depositorPath/);
  });

  it("is accepted by prepareSignPsbt as a single key-path expectation", () => {
    const prepared = prepareSignPsbt({ psbtHex: hex, depositorXOnlyHex: DEPOSITOR_XONLY });
    expect(prepared.table.expectedYieldCount).toBe(1);
    expect(prepared.table.byInput.get(0)?.kind).toBe("taproot-keypath");
  });
});
