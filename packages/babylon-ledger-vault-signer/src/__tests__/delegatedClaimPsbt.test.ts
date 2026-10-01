/**
 * Delegated-claim PSBT classification and augmentation (#2111).
 *
 * Firmware citations: `fw:` = LedgerHQ/app-babylon-vault @ `b0c0ac4d`. The
 * accept vectors reproduce the shapes the firmware's own Python builders
 * emit (`tests/test_screen4_claim.py:_build_claim_psbt`,
 * `tests/test_screen6_wc.py:_build_wc_psbt`,
 * `tests/test_sign_psbt_validate.py:_build_payout_finalize_psbt`,
 * `tests/test_screen5_assert.py:_build_assert_psbt`); the reject vectors are
 * each one firmware rule away from them.
 */

// @vitest-environment node
// Same rationale as refundPsbt.test.ts: the asmjs ECC backend fails
// bitcoinjs's verifyEcc fixtures under jsdom but passes under node.

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { HARDENED } from "../bip86Path";
import {
  DELEGATED_CLAIM_SIGN_INPUT_INDEX,
  augmentPsbtForDelegatedClaim,
  classifyDelegatedClaimPsbt,
  parsePayoutLeafScript,
} from "../delegatedClaimPsbt";
import {
  CHALLENGER_XONLY,
  CLAIM_PREV_HASH,
  DEPOSITOR_PATH,
  DEPOSITOR_XONLY,
  FOREIGN_XONLY,
  KEEPER_XONLY,
  MASTER_FINGERPRINT,
  VAULT_DUST_LIMIT_SATS,
  assertLeaf,
  bip86Spk,
  buildAssertShapedPsbt,
  buildClaimShapedPsbt,
  buildPayoutShapedPsbt,
  buildWcShapedPsbt,
  claimLeaf,
  payoutLeaf,
  scriptNumPush,
  vaultUtxoLeaf,
  wcLeaf,
} from "./fixtures/delegatedClaimShapes";

describe("parsePayoutLeafScript (firmware-grammar mirror)", () => {
  it("parses the canonical leaf: <D> OP_CHECKSIGVERIFY <group> <group> <2-byte t2> OP_CSV", () => {
    expect(parsePayoutLeafScript(payoutLeaf(DEPOSITOR_XONLY, 200))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  it("parses a 1-byte t2 push at the firmware floor (90)", () => {
    expect(parsePayoutLeafScript(payoutLeaf(DEPOSITOR_XONLY, 90))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  it("accepts both sides of the push-width boundary: the largest 1-byte t2 (127) and the smallest 2-byte one (128)", () => {
    expect(parsePayoutLeafScript(payoutLeaf(DEPOSITOR_XONLY, 127))).toBeDefined();
    expect(parsePayoutLeafScript(payoutLeaf(DEPOSITOR_XONLY, 128))).toBeDefined();
  });

  it("accepts a t2 at the firmware ceiling (4032)", () => {
    expect(parsePayoutLeafScript(payoutLeaf(DEPOSITOR_XONLY, 4032))).toBeDefined();
  });

  it.each([
    ["t2 one below the firmware floor (89)", payoutLeaf(DEPOSITOR_XONLY, 89)],
    ["t2 one above the firmware ceiling (4033)", payoutLeaf(DEPOSITOR_XONLY, 4033)],
  ])("rejects %s exactly like the firmware", (_label, leaf) => {
    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects the 68-byte NoPayout leaf length (the firmware requires > 68)", () => {
    const noPayout = Buffer.concat([
      Buffer.from([0x20]),
      Buffer.from(DEPOSITOR_XONLY, "hex"),
      Buffer.from([0xad, 0x20]),
      Buffer.from(KEEPER_XONLY, "hex"),
      Buffer.from([0xac]),
    ]);

    expect(noPayout).toHaveLength(68);
    expect(parsePayoutLeafScript(noPayout)).toBeUndefined();
  });

  it("rejects a Vault-UTXO-shaped leaf: second signer closes with OP_CHECKSIGVERIFY, not OP_CHECKSIG at [67]", () => {
    const leaf = payoutLeaf(DEPOSITOR_XONLY, 200);
    leaf[67] = 0xad;

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a leaf whose first group does not open with a 32-byte push at [34]", () => {
    const leaf = payoutLeaf(DEPOSITOR_XONLY, 200);
    leaf[34] = 0x21;

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a leaf that does not open with a 32-byte push", () => {
    const leaf = payoutLeaf(DEPOSITOR_XONLY, 200);
    leaf[0] = 0x21;

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  // The firmware tries the 2-byte branch first and, when that value is out of
  // band, falls through to the 1-byte branch instead of rejecting
  // (`fw:sign_psbt_validate_helpers.c:200-216`). Raised as KB Q22; mirrored so
  // the host predicts device acceptance exactly. Harmless in practice —
  // nSequence 90 can never satisfy the real CSV of 23041.
  it("reproduces the firmware's 2-byte-to-1-byte fall-through: a tail 02 01 5a b2 is accepted and yields the leaf key", () => {
    const canonical = payoutLeaf(DEPOSITOR_XONLY, 200);
    const leaf = Buffer.concat([canonical.subarray(0, canonical.length - 4), Buffer.from([0x02, 0x01, 0x5a, 0xb2])]);

    expect(parsePayoutLeafScript(leaf)).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  // A 1-byte push of 200 has the sign bit set, so CScriptNum reads it negative;
  // the firmware's `t2 <= 127` guard (`fw:sign_psbt_validate_helpers.c:213`) is
  // the only thing rejecting it, since 200 is inside the band.
  it("rejects an in-band t2 pushed as one byte with the sign bit set (tail 01 c8 b2)", () => {
    const canonical = payoutLeaf(DEPOSITOR_XONLY, 200);
    const leaf = Buffer.concat([canonical.subarray(0, canonical.length - 4), Buffer.from([0x01, 0xc8, 0xb2])]);

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a missing OP_CHECKSIGVERIFY after D", () => {
    const leaf = payoutLeaf(DEPOSITOR_XONLY, 200);
    leaf[33] = 0xac;

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a final opcode other than OP_CSV", () => {
    const leaf = payoutLeaf(DEPOSITOR_XONLY, 200);
    leaf[leaf.length - 1] = 0xb1;

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a 2-byte t2 push with the sign bit set", () => {
    const leaf = payoutLeaf(DEPOSITOR_XONLY, 200);
    leaf[leaf.length - 2] = 0x80;

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a 3-byte t2 push (neither firmware branch matches)", () => {
    const canonical = payoutLeaf(DEPOSITOR_XONLY, 200);
    const head = canonical.subarray(0, canonical.length - 4);
    const leaf = Buffer.concat([head, Buffer.from([0x03, 0xc8, 0x00, 0x00, 0xb2])]);

    expect(parsePayoutLeafScript(leaf)).toBeUndefined();
  });

  it("encodes t2 as the firmware's builder does: 1 byte below 128, 2 bytes LE with a zero sign pad from 128", () => {
    expect(scriptNumPush(90)).toEqual(Buffer.from([0x01, 0x5a]));
    expect(scriptNumPush(200)).toEqual(Buffer.from([0x02, 0xc8, 0x00]));
    expect(scriptNumPush(4032)).toEqual(Buffer.from([0x02, 0xc0, 0x0f]));
  });

  it("keeps the challenger keys out of the parsed terms — only D is returned", () => {
    expect(parsePayoutLeafScript(payoutLeaf(DEPOSITOR_XONLY, 200, CHALLENGER_XONLY, KEEPER_XONLY))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });
});

describe("classifyDelegatedClaimPsbt", () => {
  it("classifies the firmware's Claim shape (1-in/2-out, <D> OP_CHECKSIG, requested index 0)", () => {
    const c = classifyDelegatedClaimPsbt(buildClaimShapedPsbt(), 0);

    expect(c).toEqual({ kind: "claim", signInputIndex: 0, leafKeyHex: DEPOSITOR_XONLY });
  });

  it("classifies the firmware's WronglyChallenged shape (1-in/1-out, 73-byte leaf, requested index 0)", () => {
    expect(classifyDelegatedClaimPsbt(buildWcShapedPsbt(), 0)).toEqual({
      kind: "wronglyChallenged",
      signInputIndex: 0,
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  it("refuses a WronglyChallenged with an extra input — the device pre-routes multi-input shapes before the leaf dispatch", () => {
    expect(classifyDelegatedClaimPsbt(buildWcShapedPsbt({ extraInputValue: 10_000 }), 0)).toBeUndefined();
  });

  it("classifies the claimer Payout as payoutFinalize: 2-in/2-out, requested index 1, input 0 carries no leaf and no D entry", () => {
    expect(classifyDelegatedClaimPsbt(buildPayoutShapedPsbt(), 1)).toEqual({
      kind: "payoutFinalize",
      signInputIndex: 1,
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  it("classifies the depositor Payout (leaves on both inputs, requested index 0) as payoutDepositor — never as a standalone kind", () => {
    const depositorPayout = buildPayoutShapedPsbt({
      input0Leaf: vaultUtxoLeaf(DEPOSITOR_XONLY),
    });

    expect(classifyDelegatedClaimPsbt(depositorPayout, 0)).toEqual({
      kind: "payoutDepositor",
      signInputIndex: 0,
      leafKeyHex: DEPOSITOR_XONLY,
    });
    // A caller asking for input 1 on it gets nothing: input 0's leaf is the tell.
    expect(classifyDelegatedClaimPsbt(depositorPayout, 1)).toBeUndefined();
  });

  it("does not classify a 2-in/2-out PSBT as payoutDepositor unless input 1 carries a payout leaf", () => {
    expect(
      classifyDelegatedClaimPsbt(
        buildPayoutShapedPsbt({ input0Leaf: vaultUtxoLeaf(DEPOSITOR_XONLY), leaf: claimLeaf(DEPOSITOR_XONLY) }),
        0,
      ),
    ).toBeUndefined();
  });

  it("classifies the firmware's Assert shape (1 input, >68-byte leaf ending OP_TRUE, requested index 0)", () => {
    expect(classifyDelegatedClaimPsbt(buildAssertShapedPsbt(), 0)).toEqual({
      kind: "assert",
      signInputIndex: 0,
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  it.each([
    [
      "an Assert leaf whose [34] is not a 32-byte push",
      buildAssertShapedPsbt({
        leaf: (() => {
          const l = assertLeaf(DEPOSITOR_XONLY);
          l[34] = 0x21;
          return l;
        })(),
      }),
    ],
    [
      "an Assert leaf whose [67] is not OP_CHECKSIG",
      buildAssertShapedPsbt({
        leaf: (() => {
          const l = assertLeaf(DEPOSITOR_XONLY);
          l[67] = 0xad;
          return l;
        })(),
      }),
    ],
    [
      "an Assert-shaped leaf ending OP_CSV instead of OP_TRUE",
      buildAssertShapedPsbt({
        leaf: (() => {
          const l = assertLeaf(DEPOSITOR_XONLY);
          l[l.length - 1] = 0xb2;
          return l;
        })(),
      }),
    ],
    [
      "a 68-byte leaf ending OP_TRUE (the NoPayout length)",
      buildAssertShapedPsbt({
        leaf: Buffer.concat([
          Buffer.from([0x20]),
          Buffer.from(DEPOSITOR_XONLY, "hex"),
          Buffer.from([0xad, 0x20]),
          Buffer.from(KEEPER_XONLY, "hex"),
          Buffer.from([0x51]),
        ]),
      }),
    ],
    ["an Assert shape with two inputs", buildAssertShapedPsbt({ extraInputValue: 1 })],
  ])("returns undefined for %s", (_label, hex) => {
    expect(classifyDelegatedClaimPsbt(hex, 0)).toBeUndefined();
  });

  // Real Assert leaves are 11,526-13,636 bytes (btc-vault claim_assert.rs) —
  // over the device's 2560-byte buffer, so it streams them. Pins that the
  // classifier reads only the prefix and the last byte, and that bip174 parses
  // a TAP_LEAF_SCRIPT value of that size at all.
  it("classifies an Assert at the real leaf size (~12 kB): prefix and terminator only", () => {
    const prefix = assertLeaf(DEPOSITOR_XONLY).subarray(0, 106);
    const OP_NOP = 0x61;
    const leaf = Buffer.concat([prefix, Buffer.alloc(12_000, OP_NOP), Buffer.from([0x51])]);

    expect(classifyDelegatedClaimPsbt(buildAssertShapedPsbt({ leaf }), 0)).toEqual({
      kind: "assert",
      signInputIndex: 0,
      leafKeyHex: DEPOSITOR_XONLY,
    });
  });

  it("returns undefined for an Assert requested at index 1", () => {
    expect(classifyDelegatedClaimPsbt(buildAssertShapedPsbt(), 1)).toBeUndefined();
  });

  it("does not classify a 2-in/2-out PSBT as payoutFinalize when input 0 carries a derivation entry for D without a leaf", () => {
    expect(
      classifyDelegatedClaimPsbt(buildPayoutShapedPsbt({ input0DerivationKeyHex: DEPOSITOR_XONLY }), 1),
    ).toBeUndefined();
  });

  it("still classifies payoutFinalize when input 0 carries a derivation entry for some OTHER key", () => {
    expect(classifyDelegatedClaimPsbt(buildPayoutShapedPsbt({ input0DerivationKeyHex: FOREIGN_XONLY }), 1)?.kind).toBe(
      "payoutFinalize",
    );
  });

  it.each([
    ["Claim requested at index 1", buildClaimShapedPsbt(), 1],
    ["WronglyChallenged requested at index 1", buildWcShapedPsbt(), 1],
    ["claimer Payout requested at index 0", buildPayoutShapedPsbt(), 0],
  ])("returns undefined for a requested-index mismatch: %s", (_label, hex, index) => {
    expect(classifyDelegatedClaimPsbt(hex, index)).toBeUndefined();
  });

  it("pins the device's literal signing index per kind", () => {
    expect(DELEGATED_CLAIM_SIGN_INPUT_INDEX).toEqual({
      claim: 0,
      wronglyChallenged: 0,
      payoutFinalize: 1,
      assert: 0,
      payoutDepositor: 0,
    });
  });

  it.each([
    ["a 72-byte WC leaf", buildWcShapedPsbt({ leaf: wcLeaf(DEPOSITOR_XONLY).subarray(0, 72) })],
    [
      "a 74-byte WC leaf",
      buildWcShapedPsbt({
        leaf: Buffer.concat([wcLeaf(DEPOSITOR_XONLY), Buffer.from([0x51])]),
      }),
    ],
    [
      "a WC leaf whose [34] is not OP_SIZE",
      buildWcShapedPsbt({
        leaf: (() => {
          const l = wcLeaf(DEPOSITOR_XONLY);
          l[34] = 0x83;
          return l;
        })(),
      }),
    ],
    [
      "a WC leaf whose [72] is not OP_EQUAL",
      buildWcShapedPsbt({
        leaf: (() => {
          const l = wcLeaf(DEPOSITOR_XONLY);
          l[72] = 0x88;
          return l;
        })(),
      }),
    ],
    [
      "a WC shape with two outputs",
      buildWcShapedPsbt({
        outputs: [
          { script: bip86Spk(DEPOSITOR_XONLY), value: 1 },
          { script: bip86Spk(DEPOSITOR_XONLY), value: 1 },
        ],
      }),
    ],
    [
      "a Claim leaf ending in OP_CHECKSIGVERIFY",
      buildClaimShapedPsbt({
        leaf: (() => {
          const l = claimLeaf(DEPOSITOR_XONLY);
          l[33] = 0xad;
          return l;
        })(),
      }),
    ],
    [
      "a 35-byte Claim leaf",
      buildClaimShapedPsbt({
        leaf: Buffer.concat([claimLeaf(DEPOSITOR_XONLY), Buffer.from([0x51])]),
      }),
    ],
    [
      "a Claim shape with one output",
      buildClaimShapedPsbt({
        outputs: [{ script: bip86Spk(DEPOSITOR_XONLY), value: VAULT_DUST_LIMIT_SATS }],
      }),
    ],
    [
      "a Claim shape with three outputs",
      buildClaimShapedPsbt({
        outputs: [
          { script: bip86Spk(DEPOSITOR_XONLY), value: 1 },
          { script: bip86Spk(DEPOSITOR_XONLY), value: 1 },
          { script: bip86Spk(DEPOSITOR_XONLY), value: 1 },
        ],
      }),
    ],
    ["a payout leaf that does not parse (t2 = 89)", buildPayoutShapedPsbt({ t2: 89 })],
    ["no tapLeafScript on the signed input", buildClaimShapedPsbt({ dropLeaf: true })],
    ["two TAP_LEAF_SCRIPT entries on the signed input", buildClaimShapedPsbt({ extraLeaf: true })],
    ["a non-tapscript leaf version", buildClaimShapedPsbt({ leafVersion: 0xc2 })],
    ["a version-1 transaction", buildClaimShapedPsbt({ version: 1 })],
    ["a non-zero locktime", buildClaimShapedPsbt({ locktime: 1 })],
  ])("returns undefined for %s", (_label, hex) => {
    expect(classifyDelegatedClaimPsbt(hex, 0)).toBeUndefined();
    expect(classifyDelegatedClaimPsbt(hex, 1)).toBeUndefined();
  });

  it("returns undefined for malformed hex instead of throwing (error precedence stays with the caller)", () => {
    expect(classifyDelegatedClaimPsbt("zz", 0)).toBeUndefined();
    expect(classifyDelegatedClaimPsbt("abcd", 0)).toBeUndefined();
    expect(classifyDelegatedClaimPsbt("", 0)).toBeUndefined();
  });

  it("carries input 0's prevout as the Claim spends it (internal order)", () => {
    // Not a firmware pin: the provider shows nothing of it. Guards the fixture's
    // reproduction of `_build_claim_psbt`'s hard-coded prevout.
    const psbt = Psbt.fromHex(buildClaimShapedPsbt());

    expect(Buffer.from(psbt.txInputs[0].hash)).toEqual(CLAIM_PREV_HASH);
  });
});

describe("augmentPsbtForDelegatedClaim", () => {
  const base = {
    depositorXOnlyHex: DEPOSITOR_XONLY,
    masterFingerprintHex: MASTER_FINGERPRINT,
    depositorPath: DEPOSITOR_PATH,
  };

  it.each([
    ["claim", buildClaimShapedPsbt(), 0],
    ["wronglyChallenged", buildWcShapedPsbt(), 0],
    ["payoutFinalize", buildPayoutShapedPsbt(), 1],
    ["assert", buildAssertShapedPsbt(), 0],
  ] as const)(
    "%s: REPLACES the WASM zero-fingerprint entry for D on the signed input with the device entry",
    (kind, psbtHex, index) => {
      const augmented = Psbt.fromHex(augmentPsbtForDelegatedClaim({ kind, psbtHex, ...base }));

      const deriv = augmented.data.inputs[index].tapBip32Derivation;
      expect(deriv).toHaveLength(1);
      expect(deriv![0].pubkey.toString("hex")).toBe(DEPOSITOR_XONLY);
      expect(deriv![0].masterFingerprint.toString("hex")).toBe(MASTER_FINGERPRINT);
      expect(deriv![0].path).toBe("m/86'/1'/0'/0/0");
      expect(deriv![0].leafHashes).toEqual([]);
      // No output entries: the device derives P2TR(D) from D itself on these paths.
      for (const output of augmented.data.outputs) {
        expect(output.tapBip32Derivation).toBeUndefined();
      }
    },
  );

  it("payoutFinalize: leaves input 0 untouched — no entry is added to the input the device never signs", () => {
    const augmented = Psbt.fromHex(
      augmentPsbtForDelegatedClaim({
        kind: "payoutFinalize",
        psbtHex: buildPayoutShapedPsbt(),
        ...base,
      }),
    );

    expect(augmented.data.inputs[0].tapBip32Derivation).toBeUndefined();
    expect(augmented.data.inputs[0].tapLeafScript).toBeUndefined();
  });

  it("replaces the builder's entries — D's and every challenger's — with the single device entry", () => {
    const psbt = Psbt.fromHex(buildClaimShapedPsbt({ derivation: "none" }));
    psbt.updateInput(0, {
      tapBip32Derivation: [
        {
          masterFingerprint: Buffer.alloc(4, 0),
          pubkey: Buffer.from(DEPOSITOR_XONLY, "hex"),
          path: "m",
          leafHashes: [],
        },
        {
          masterFingerprint: Buffer.alloc(4, 0),
          pubkey: Buffer.from(FOREIGN_XONLY, "hex"),
          path: "m",
          leafHashes: [],
        },
      ],
    });

    const augmented = Psbt.fromHex(
      augmentPsbtForDelegatedClaim({
        kind: "claim",
        psbtHex: psbt.toHex(),
        ...base,
      }),
    );

    const entries = augmented.data.inputs[0].tapBip32Derivation!;
    expect(entries.map((e) => e.pubkey.toString("hex"))).toEqual([DEPOSITOR_XONLY]);
    expect(entries[0].masterFingerprint.toString("hex")).toBe(MASTER_FINGERPRINT);
  });

  it("is idempotent: augmenting an already-augmented PSBT yields the same bytes", () => {
    const once = augmentPsbtForDelegatedClaim({
      kind: "wronglyChallenged",
      psbtHex: buildWcShapedPsbt(),
      ...base,
    });

    expect(
      augmentPsbtForDelegatedClaim({
        kind: "wronglyChallenged",
        psbtHex: once,
        ...base,
      }),
    ).toBe(once);
  });

  it("never touches the unsigned transaction", () => {
    const psbtHex = buildPayoutShapedPsbt();
    const before = Psbt.fromHex(psbtHex).data.globalMap.unsignedTx.toBuffer();

    const after = Psbt.fromHex(
      augmentPsbtForDelegatedClaim({
        kind: "payoutFinalize",
        psbtHex,
        ...base,
      }),
    ).data.globalMap.unsignedTx.toBuffer();

    expect(after.equals(before)).toBe(true);
  });

  it("throws when the PSBT does not classify as the stated kind", () => {
    expect(() =>
      augmentPsbtForDelegatedClaim({
        kind: "claim",
        psbtHex: buildWcShapedPsbt(),
        ...base,
      }),
    ).toThrow(/not a claim-shaped/);
    expect(() =>
      augmentPsbtForDelegatedClaim({
        kind: "payoutFinalize",
        psbtHex: buildPayoutShapedPsbt({
          input0Leaf: vaultUtxoLeaf(DEPOSITOR_XONLY),
        }),
        ...base,
      }),
    ).toThrow(/not a payoutFinalize-shaped/);
  });

  it("refuses payoutDepositor — its signer takes the path from the intent, so it goes through signPsbt", () => {
    expect(() =>
      augmentPsbtForDelegatedClaim({
        kind: "payoutDepositor",
        psbtHex: buildPayoutShapedPsbt({ input0Leaf: vaultUtxoLeaf(DEPOSITOR_XONLY) }),
        ...base,
      }),
    ).toThrow(/signPsbt/);
  });

  it("throws when the leaf key is not the depositor key", () => {
    expect(() =>
      augmentPsbtForDelegatedClaim({
        kind: "claim",
        psbtHex: buildClaimShapedPsbt({ leafKeyHex: FOREIGN_XONLY }),
        ...base,
      }),
    ).toThrow(/depositor/);
  });

  it("rejects a malformed depositor path or fingerprint before touching the PSBT", () => {
    expect(() =>
      augmentPsbtForDelegatedClaim({
        kind: "claim",
        psbtHex: buildClaimShapedPsbt(),
        ...base,
        depositorPath: [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0],
      }),
    ).toThrow(/5 levels|depositorPath/);
    expect(() =>
      augmentPsbtForDelegatedClaim({
        kind: "claim",
        psbtHex: buildClaimShapedPsbt(),
        ...base,
        masterFingerprintHex: "73c5da",
      }),
    ).toThrow(/fingerprint/);
  });
});
