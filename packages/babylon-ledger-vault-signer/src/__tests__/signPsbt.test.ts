/**
 * `signVaultPsbt` composition: prepare → loop → merge over a scripted device.
 *
 * The sender is an ordered script of { expectApduHex, respondSw,
 * respondDataHex }; any out-of-order or extra APDU fails the test, so "no
 * further sends" is proven by the sender itself. The PegIn transcript is the
 * committed Python-oracle trace with its synthetic YIELD replaced by a payload
 * built from the fixture's own tapleaf (the placeholder's key/leaf bytes are
 * sha256-derived and no table accepts them).
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { isLedgerSignPsbtAbortedError } from "../errors";
import type { RawApduSender } from "../rawApdu";
import { signVaultPsbt } from "../signPsbt";
import { tapLeafHash } from "../tapLeafHash";

const VECTORS_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "signpsbt");
const TRACES_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "command-traces");
const FIXTURE = "generated__deposit-flow__pegin__0";

// Valid x-only point (the generated fixtures' depositor key).
const TEST_DEPOSITOR_KEY_HEX = "e49662aea97a89551401ce54de10474b24b4ab71383b69cf164ea59b3a209e0d";
const TEST_SIG_HEX = "cd".repeat(64);
const SIGN_PSBT_HEADER_HEX = "e1040001";
const CONTINUE_HEADER_HEX = "f8010000";
const TAPSCRIPT_LEAF_VERSION = 0xc0;

interface Trace {
  command_name: string;
  request_hex: string;
  response_hex: string;
}

const vector = JSON.parse(readFileSync(join(VECTORS_DIR, `${FIXTURE}.json`), "utf8")) as {
  psbt_hex: string;
  sign_psbt_cdata_hex: string;
  input_maps: [string, string][][];
};
const traceFile = JSON.parse(readFileSync(join(TRACES_DIR, `${FIXTURE}.json`), "utf8")) as { traces: Trace[] };

/** The fixture's own input-0 tapleaf: BIP-371 value = script ‖ leaf_version(1B). */
function fixtureLeafHashHex(): string {
  const entry = vector.input_maps[0].find(([keyHex]) => keyHex.startsWith("15"));
  if (!entry) throw new Error("fixture input 0 has no TAP_LEAF_SCRIPT entry");
  const value = Buffer.from(entry[1], "hex");
  expect(value[value.length - 1]).toBe(TAPSCRIPT_LEAF_VERSION);
  return tapLeafHash(TAPSCRIPT_LEAF_VERSION, value.subarray(0, value.length - 1)).toString("hex");
}

interface ScriptedExchange {
  readonly expectApduHex: string;
  readonly respondSw: number;
  readonly respondDataHex: string;
  /** Side effect fired when this exchange answers (e.g. abort mid-loop). */
  readonly onRespond?: () => void;
}

function createScriptedSender(script: readonly ScriptedExchange[]): { send: RawApduSender; sent: () => number } {
  let calls = 0;
  const send: RawApduSender = async (apdu) => {
    const apduHex =
      [apdu.cla, apdu.ins, apdu.p1, apdu.p2].map((byte) => byte.toString(16).padStart(2, "0")).join("") +
      Buffer.from(apdu.data).toString("hex");
    const expected = script[calls];
    if (!expected) throw new Error(`unexpected extra APDU #${calls}: ${apduHex}`);
    expect(apduHex, `APDU #${calls}`).toBe(expected.expectApduHex);
    calls += 1;
    expected.onRespond?.();
    return { sw: expected.respondSw, data: Uint8Array.from(Buffer.from(expected.respondDataHex, "hex")) };
  };
  return { send, sent: () => calls };
}

/** `0x10 ‖ varint(0) ‖ 0x40 ‖ signer(32) ‖ leaf(32) ‖ sig(64)` — wire-spec §5 tapscript YIELD. */
function peginYieldRequestHex(leafHashHex: string): string {
  return "10" + "00" + "40" + TEST_DEPOSITOR_KEY_HEX + leafHashHex + TEST_SIG_HEX;
}

/** Each oracle request rides a 0xE000; its response rides the next CONTINUE. */
function peginScript(leafHashHex: string): ScriptedExchange[] {
  const exchanges: ScriptedExchange[] = [];
  let expectApduHex = SIGN_PSBT_HEADER_HEX + vector.sign_psbt_cdata_hex;
  for (const trace of traceFile.traces) {
    const requestHex = trace.command_name === "YIELD" ? peginYieldRequestHex(leafHashHex) : trace.request_hex;
    exchanges.push({ expectApduHex, respondSw: 0xe000, respondDataHex: requestHex });
    expectApduHex = CONTINUE_HEADER_HEX + trace.response_hex;
  }
  exchanges.push({ expectApduHex, respondSw: 0x9000, respondDataHex: "" });
  return exchanges;
}

function unsignedTxHex(psbtHex: string): string {
  return Psbt.fromHex(psbtHex).data.globalMap.unsignedTx.toBuffer().toString("hex");
}

describe("signVaultPsbt", () => {
  it("signs a PegIn PSBT end-to-end: yields collected, signature merged, nothing finalized", async () => {
    const leafHashHex = fixtureLeafHashHex();
    const script = peginScript(leafHashHex);
    const { send, sent } = createScriptedSender(script);
    const progress: { inputIndex: number; yieldedCount: number; expectedYieldCount: number }[] = [];

    const result = await signVaultPsbt(send, {
      psbtHex: vector.psbt_hex,
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      onProgress: (p) => progress.push(p),
      signal: new AbortController().signal,
    });

    expect(sent()).toBe(script.length);
    expect(result.yields).toHaveLength(1);
    expect(result.yields[0]).toMatchObject({ kind: "tapscript", inputIndex: 0, leafHashHex });
    expect(progress).toEqual([{ inputIndex: 0, yieldedCount: 1, expectedYieldCount: 1 }]);

    expect(unsignedTxHex(result.signedPsbtHex)).toBe(unsignedTxHex(vector.psbt_hex));
    const signedInput = Psbt.fromHex(result.signedPsbtHex).data.inputs[0];
    expect(signedInput.tapScriptSig).toHaveLength(1);
    expect(signedInput.tapScriptSig?.[0].leafHash.toString("hex")).toBe(leafHashHex);
    expect(signedInput.tapScriptSig?.[0].signature.toString("hex")).toBe(TEST_SIG_HEX);
    expect(signedInput.finalScriptWitness).toBeUndefined();
  });

  it("completes the ceremony when onProgress throws", async () => {
    const leafHashHex = fixtureLeafHashHex();
    const script = peginScript(leafHashHex);
    const { send, sent } = createScriptedSender(script);

    const result = await signVaultPsbt(send, {
      psbtHex: vector.psbt_hex,
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      onProgress: () => {
        throw new Error("caller's progress handler is broken");
      },
    });

    expect(sent()).toBe(script.length);
    expect(result.yields).toHaveLength(1);
    expect(Psbt.fromHex(result.signedPsbtHex).data.inputs[0].tapScriptSig).toHaveLength(1);
  });

  it("rejects with the aborted error and sends nothing when the signal is already aborted", async () => {
    const { send, sent } = createScriptedSender([]);
    const controller = new AbortController();
    controller.abort();

    const outcome = await signVaultPsbt(send, {
      psbtHex: vector.psbt_hex,
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      signal: controller.signal,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(isLedgerSignPsbtAbortedError(outcome)).toBe(true);
    expect(sent()).toBe(0);
  });

  it("propagates a mid-loop abort instead of returning a half-merged PSBT", async () => {
    const controller = new AbortController();
    const script: ScriptedExchange[] = [
      {
        expectApduHex: SIGN_PSBT_HEADER_HEX + vector.sign_psbt_cdata_hex,
        respondSw: 0xe000,
        respondDataHex: traceFile.traces[0].request_hex,
        onRespond: () => controller.abort(),
      },
    ];
    const { send, sent } = createScriptedSender(script);

    const outcome = await signVaultPsbt(send, {
      psbtHex: vector.psbt_hex,
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      signal: controller.signal,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(isLedgerSignPsbtAbortedError(outcome)).toBe(true);
    expect(sent()).toBe(1);
  });
});
