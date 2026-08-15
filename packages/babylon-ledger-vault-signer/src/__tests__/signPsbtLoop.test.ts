/**
 * SIGN_PSBT loop vs scripted device transcripts (spec §7.2, T1-T14).
 *
 * The fake RawApduSender is an ordered script of
 * { expectApduHex, respondSw, respondDataHex }; any out-of-order, unexpected,
 * or extra APDU fails the test, so "no further sends after a throw" is proven
 * by the sender itself. Happy paths replay the committed Python-oracle
 * command traces through the real loop; the synthetic YIELD placeholders in
 * those traces are replaced with payloads valid against the prepared table
 * (the placeholders carry sha256-derived key/leaf bytes no table accepts).
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  LedgerDeviceError,
  LedgerSignPsbtAbortedError,
  LedgerSignPsbtProtocolError,
  LedgerUserRefusedError,
  LedgerYieldMismatchError,
  isLedgerDeviceLockedError,
  isLedgerSignPsbtAbortedError,
  isLedgerSignPsbtIncompleteError,
  type LedgerYieldMismatchKind,
} from "../errors";
import { createYieldCollector, type ExpectedSignatureTable } from "../expectedSignatures";
import type { Apdu, RawApduSender } from "../rawApdu";
import { runSignPsbtLoop, type SignPsbtProgress } from "../signPsbtLoop";
import { prepareSignPsbt, type PreparedSignPsbt } from "../signPsbtPrepare";
import { ClientCommandInterpreter } from "../vendor/ledger-bitcoin/clientCommands";
import { createVarint } from "../vendor/ledger-bitcoin/varint";

const VECTORS_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "signpsbt");
const TRACES_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "command-traces");

interface Trace {
  command_name: string;
  request_hex: string;
  response_hex: string;
}
interface TraceFile {
  vector_id: string;
  elements_hex?: string[];
  traces: Trace[];
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// Valid x-only point (the generated fixtures' depositor key).
const TEST_DEPOSITOR_KEY_HEX = "e49662aea97a89551401ce54de10474b24b4ab71383b69cf164ea59b3a209e0d";
const TEST_SIG_HEX = "cd".repeat(64);
const CONTINUE_HEADER_HEX = "f8010000";
const SIGN_PSBT_HEADER_HEX = "e1040001";

interface ScriptedExchange {
  readonly expectApduHex: string;
  readonly respondSw: number;
  readonly respondDataHex: string;
  /** Side effect fired when this exchange answers (e.g. abort mid-loop). */
  readonly onRespond?: () => void;
}

function apduHex(apdu: Apdu): string {
  return (
    [apdu.cla, apdu.ins, apdu.p1, apdu.p2].map((byte) => byte.toString(16).padStart(2, "0")).join("") +
    Buffer.from(apdu.data).toString("hex")
  );
}

function createScriptedSender(script: readonly ScriptedExchange[]): { send: RawApduSender; sent: () => number } {
  let calls = 0;
  const send: RawApduSender = async (apdu) => {
    const expected = script[calls];
    if (!expected) throw new Error(`unexpected extra APDU #${calls}: ${apduHex(apdu)}`);
    expect(apduHex(apdu), `APDU #${calls}`).toBe(expected.expectApduHex);
    calls += 1;
    expected.onRespond?.();
    return { sw: expected.respondSw, data: Uint8Array.from(Buffer.from(expected.respondDataHex, "hex")) };
  };
  return { send, sent: () => calls };
}

function initialApduHexOf(prepared: PreparedSignPsbt): string {
  return SIGN_PSBT_HEADER_HEX + Buffer.from(prepared.cdata).toString("hex");
}

/** `0x10 ‖ varint(i) ‖ 0x40 ‖ signer(32) ‖ leaf(32) ‖ sig(64)` — wire-spec §5 tapscript YIELD. */
function tapscriptYieldRequestHex(inputIndex: number, signerHex: string, leafHex: string, sigHex: string): string {
  return "10" + createVarint(inputIndex).toString("hex") + "40" + signerHex + leafHex + sigHex;
}

/** `0x10 ‖ varint(i) ‖ 0x20 ‖ outputKey(32) ‖ sig(64)` — wire-spec §5 keypath YIELD. */
function keypathYieldRequestHex(inputIndex: number, outputKeyHex: string, sigHex: string): string {
  return "10" + createVarint(inputIndex).toString("hex") + "20" + outputKeyHex + sigHex;
}

function tableLeafHex(table: ExpectedSignatureTable, inputIndex: number): string {
  const expectation = table.byInput.get(inputIndex);
  if (expectation?.kind !== "tapscript") throw new Error(`input ${inputIndex} is not tapscript in the table`);
  const [leafHex] = [...expectation.expectedLeafHashHexes];
  return leafHex;
}

/** Chain traces into exchanges: each request rides 0xE000, each response rides the next CONTINUE. */
function scriptFromTraces(initialApduHex: string, traces: readonly Trace[]): ScriptedExchange[] {
  const exchanges: ScriptedExchange[] = [];
  let expectApduHex = initialApduHex;
  for (const trace of traces) {
    exchanges.push({ expectApduHex, respondSw: 0xe000, respondDataHex: trace.request_hex });
    expectApduHex = CONTINUE_HEADER_HEX + trace.response_hex;
  }
  exchanges.push({ expectApduHex, respondSw: 0x9000, respondDataHex: "" });
  return exchanges;
}

function prepareFromVector(vectorId: string): PreparedSignPsbt {
  const vector = loadJson<{ psbt_hex: string; input_maps: [string, string][][] }>(
    join(VECTORS_DIR, `${vectorId}.json`),
  );
  const internalKey = vector.input_maps[0].find(([key]) => key === "17");
  const depositorXOnlyHex = vectorId.includes("pre_pegin") && internalKey ? internalKey[1] : TEST_DEPOSITOR_KEY_HEX;
  return prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex });
}

/**
 * Replace the synthetic YIELD trace with table-valid YIELD request(s) — one
 * per table entry, covering the pre_pegin one-yield-per-input expansion.
 */
function tracesWithValidYields(prepared: PreparedSignPsbt, traces: readonly Trace[]): Trace[] {
  const validYields: Trace[] = [...prepared.table.byInput.entries()].map(([inputIndex, expectation]) => ({
    command_name: "YIELD",
    request_hex:
      expectation.kind === "tapscript"
        ? tapscriptYieldRequestHex(
            inputIndex,
            expectation.expectedSignerXOnlyHex,
            tableLeafHex(prepared.table, inputIndex),
            TEST_SIG_HEX,
          )
        : keypathYieldRequestHex(inputIndex, expectation.expectedOutputKeyHex, TEST_SIG_HEX),
    response_hex: "",
  }));
  return traces.flatMap((trace) => (trace.command_name === "YIELD" ? validYields : [trace]));
}

describe("happy-path trace replay through the loop (T1, T11, T12)", () => {
  // 175 committed oracle traces across the four flows; claimer_payout__2
  // carries the GET_MORE_ELEMENTS continuation round (chunking through the loop).
  const REPLAY_CASES: { file: string; expectedYieldCount: number; expectedKind: "tapscript" | "taproot-keypath" }[] = [
    { file: "generated__deposit-flow__pegin__0.json", expectedYieldCount: 1, expectedKind: "tapscript" },
    { file: "deposit-flow__claimer_payout__2.json", expectedYieldCount: 1, expectedKind: "tapscript" },
    { file: "generated__deposit-flow__depositor_graph__1.json", expectedYieldCount: 1, expectedKind: "tapscript" },
    { file: "deposit-flow__pre_pegin__0.json", expectedYieldCount: 2, expectedKind: "taproot-keypath" },
  ];

  it.each(REPLAY_CASES)("$file replays to completion", async ({ file, expectedYieldCount, expectedKind }) => {
    const traceFile = loadJson<TraceFile>(join(TRACES_DIR, file));
    const prepared = prepareFromVector(traceFile.vector_id);
    const traces = tracesWithValidYields(prepared, traceFile.traces);
    const script = scriptFromTraces(initialApduHexOf(prepared), traces);
    const { send, sent } = createScriptedSender(script);
    const progress: SignPsbtProgress[] = [];

    const yields = await runSignPsbtLoop(send, prepared, { onProgress: (p) => progress.push(p) });

    expect(sent()).toBe(script.length);
    expect(yields.length).toBe(expectedYieldCount);
    for (const yielded of yields) {
      expect(yielded.kind).toBe(expectedKind);
      expect(Buffer.from(yielded.signature).toString("hex")).toBe(TEST_SIG_HEX);
    }
    expect(progress.length).toBe(expectedYieldCount);
    expect(progress[progress.length - 1]).toEqual({
      inputIndex: yields[yields.length - 1].inputIndex,
      yieldedCount: expectedYieldCount,
      expectedYieldCount,
    });
  });

  it("replays the synthetic deep tree through the loop (proof depth 8 + GET_MORE_ELEMENTS)", async () => {
    const traceFile = loadJson<TraceFile>(join(TRACES_DIR, "synthetic__deep_tree.json"));
    const elements = (traceFile.elements_hex ?? []).map((hex) => Buffer.from(hex, "hex"));
    expect(elements.length).toBeGreaterThan(0);

    // Hand-built prepared state: the loop only needs interpreter + collector.
    const fakeLeafHex = "ef".repeat(32);
    const table: ExpectedSignatureTable = {
      byInput: new Map([
        [
          0,
          {
            kind: "tapscript",
            expectedLeafHashHexes: new Set([fakeLeafHex]),
            expectedSignerXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
          },
        ],
      ]),
      expectedYieldCount: 1,
    };
    const collector = createYieldCollector(table);
    const interpreter = new ClientCommandInterpreter(undefined, (payload) => collector.assertAndRecord(payload));
    interpreter.addKnownList(elements);
    const prepared: PreparedSignPsbt = {
      cdata: Uint8Array.from(Buffer.alloc(4, 0x11)),
      interpreter,
      collector,
      table,
      originalPsbtHex: "",
    };

    const traces = [
      ...traceFile.traces,
      {
        command_name: "YIELD",
        request_hex: tapscriptYieldRequestHex(0, TEST_DEPOSITOR_KEY_HEX, fakeLeafHex, TEST_SIG_HEX),
        response_hex: "",
      },
    ];
    const script = scriptFromTraces(initialApduHexOf(prepared), traces);
    const { send, sent } = createScriptedSender(script);

    const yields = await runSignPsbtLoop(send, prepared, {});

    expect(sent()).toBe(script.length);
    expect(yields.length).toBe(1);
  });
});

describe("resend-once on 0x6A80 (T2-T5)", () => {
  function peginSetup() {
    const traceFile = loadJson<TraceFile>(join(TRACES_DIR, "generated__deposit-flow__pegin__0.json"));
    const prepared = prepareFromVector(traceFile.vector_id);
    return { prepared, traces: tracesWithValidYields(prepared, traceFile.traces) };
  }

  it("T2: flag on — the initial APDU is resent byte-identical once, then the loop completes", async () => {
    const { prepared, traces } = peginSetup();
    const initial = initialApduHexOf(prepared);
    const script: ScriptedExchange[] = [
      { expectApduHex: initial, respondSw: 0x6a80, respondDataHex: "" },
      ...scriptFromTraces(initial, traces),
    ];
    const { send, sent } = createScriptedSender(script);

    const yields = await runSignPsbtLoop(send, prepared, { resendOnceOnIncorrectData: true });

    expect(yields.length).toBe(1);
    expect(sent()).toBe(script.length);
  });

  it("T3b: abort racing the first exchange suppresses the recovery resend", async () => {
    const { prepared } = peginSetup();
    const controller = new AbortController();
    // The sender aborts DURING the first exchange; the 0x6A80 recovery branch
    // must observe it and never issue the second APDU.
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0x6a80, respondDataHex: "" },
    ];
    const { send: rawSend, sent } = createScriptedSender(script);
    const send: typeof rawSend = async (apdu) => {
      const response = await rawSend(apdu);
      controller.abort();
      return response;
    };

    await expect(
      runSignPsbtLoop(send, prepared, {
        resendOnceOnIncorrectData: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: LedgerSignPsbtAbortedError.name });
    expect(sent()).toBe(1);
  });

  it("T3: flag off — 0x6A80 on the initial APDU is terminal after exactly one send", async () => {
    const { prepared } = peginSetup();
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0x6a80, respondDataHex: "" },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, {})).rejects.toMatchObject({
      name: LedgerDeviceError.name,
      statusWord: 0x6a80,
    });
    expect(sent()).toBe(1);
  });

  it("T4: a second 0x6A80 after the resend is terminal — never a second resend", async () => {
    const { prepared } = peginSetup();
    const initial = initialApduHexOf(prepared);
    const script: ScriptedExchange[] = [
      { expectApduHex: initial, respondSw: 0x6a80, respondDataHex: "" },
      { expectApduHex: initial, respondSw: 0x6a80, respondDataHex: "" },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, { resendOnceOnIncorrectData: true })).rejects.toMatchObject({
      statusWord: 0x6a80,
    });
    expect(sent()).toBe(2);
  });

  it("T5: 0xB007 on the resent APDU is terminal (signing-phase abandonment invalidated the intent)", async () => {
    const { prepared } = peginSetup();
    const initial = initialApduHexOf(prepared);
    const script: ScriptedExchange[] = [
      { expectApduHex: initial, respondSw: 0x6a80, respondDataHex: "" },
      { expectApduHex: initial, respondSw: 0xb007, respondDataHex: "" },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, { resendOnceOnIncorrectData: true })).rejects.toMatchObject({
      statusWord: 0xb007,
    });
    expect(sent()).toBe(2);
  });
});

describe("terminal status words mid-loop (T6)", () => {
  function firstRoundScript(prepared: PreparedSignPsbt, firstTrace: Trace, terminalSw: number): ScriptedExchange[] {
    return [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0xe000, respondDataHex: firstTrace.request_hex },
      { expectApduHex: CONTINUE_HEADER_HEX + firstTrace.response_hex, respondSw: terminalSw, respondDataHex: "" },
    ];
  }

  it("0x6985 on a CONTINUE surfaces as a user refusal", async () => {
    const traceFile = loadJson<TraceFile>(join(TRACES_DIR, "generated__deposit-flow__pegin__0.json"));
    const prepared = prepareFromVector(traceFile.vector_id);
    const script = firstRoundScript(prepared, traceFile.traces[0], 0x6985);
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, {})).rejects.toMatchObject({
      name: LedgerUserRefusedError.name,
      statusWord: 0x6985,
    });
    expect(sent()).toBe(2);
  });

  it("0x5515 on a CONTINUE surfaces as a locked device", async () => {
    const traceFile = loadJson<TraceFile>(join(TRACES_DIR, "generated__deposit-flow__pegin__0.json"));
    const prepared = prepareFromVector(traceFile.vector_id);
    const script = firstRoundScript(prepared, traceFile.traces[0], 0x5515);
    const { send } = createScriptedSender(script);

    const outcome = await runSignPsbtLoop(send, prepared, {}).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isLedgerDeviceLockedError(outcome)).toBe(true);
  });
});

describe("abort signal (T7 + entry check)", () => {
  it("aborted before the initial send: zero device I/O", async () => {
    const prepared = prepareFromVector("generated__deposit-flow__pegin__0");
    const { send, sent } = createScriptedSender([]);
    const controller = new AbortController();
    controller.abort();

    const outcome = await runSignPsbtLoop(send, prepared, { signal: controller.signal }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isLedgerSignPsbtAbortedError(outcome)).toBe(true);
    expect(sent()).toBe(0);
  });

  it("aborted between rounds: the pending CONTINUE is never sent", async () => {
    const traceFile = loadJson<TraceFile>(join(TRACES_DIR, "generated__deposit-flow__pegin__0.json"));
    const prepared = prepareFromVector(traceFile.vector_id);
    const controller = new AbortController();
    const script: ScriptedExchange[] = [
      {
        expectApduHex: initialApduHexOf(prepared),
        respondSw: 0xe000,
        respondDataHex: traceFile.traces[0].request_hex,
        onRespond: () => controller.abort(),
      },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, { signal: controller.signal })).rejects.toBeInstanceOf(
      LedgerSignPsbtAbortedError,
    );
    expect(sent()).toBe(1);
  });
});

describe("YIELD assertions abort the ceremony (T8, T9)", () => {
  function flipFirstHexByte(hex: string): string {
    const flipped = ((parseInt(hex.slice(0, 2), 16) ^ 0x01) & 0xff).toString(16).padStart(2, "0");
    return flipped + hex.slice(2);
  }

  interface MutationCase {
    label: string;
    kind: LedgerYieldMismatchKind;
    requestHex: (prepared: PreparedSignPsbt) => string;
  }

  const MUTATIONS: MutationCase[] = [
    {
      label: "flipped leaf-hash byte",
      kind: "unknown-leaf-hash",
      requestHex: (p) =>
        tapscriptYieldRequestHex(0, TEST_DEPOSITOR_KEY_HEX, flipFirstHexByte(tableLeafHex(p.table, 0)), TEST_SIG_HEX),
    },
    {
      label: "flipped signer-key byte",
      kind: "wrong-signer-key",
      requestHex: (p) =>
        tapscriptYieldRequestHex(0, flipFirstHexByte(TEST_DEPOSITOR_KEY_HEX), tableLeafHex(p.table, 0), TEST_SIG_HEX),
    },
    {
      label: "input index outside the table",
      kind: "unexpected-input",
      requestHex: (p) => tapscriptYieldRequestHex(7, TEST_DEPOSITOR_KEY_HEX, tableLeafHex(p.table, 0), TEST_SIG_HEX),
    },
    {
      label: "keypath augm on a tapscript input",
      kind: "wrong-spend-type",
      requestHex: () => keypathYieldRequestHex(0, TEST_DEPOSITOR_KEY_HEX, TEST_SIG_HEX),
    },
    {
      label: "65-byte signature (non-zero sighash byte appended)",
      kind: "non-default-sighash",
      requestHex: (p) =>
        tapscriptYieldRequestHex(0, TEST_DEPOSITOR_KEY_HEX, tableLeafHex(p.table, 0), TEST_SIG_HEX + "01"),
    },
    {
      label: "33-byte augm (ECDSA compressed key)",
      kind: "unexpected-encoding",
      requestHex: () => "10" + "00" + "21" + "02" + TEST_DEPOSITOR_KEY_HEX + TEST_SIG_HEX,
    },
  ];

  it.each(MUTATIONS)("$label -> $kind, no further sends", async ({ kind, requestHex }) => {
    const prepared = prepareFromVector("generated__deposit-flow__pegin__0");
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0xe000, respondDataHex: requestHex(prepared) },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, {})).rejects.toMatchObject({
      name: LedgerYieldMismatchError.name,
      kind,
    });
    expect(sent()).toBe(1);
  });

  it("a duplicate YIELD for the same (input, leaf) aborts on the second delivery", async () => {
    const prepared = prepareFromVector("generated__deposit-flow__pegin__0");
    const validYieldHex = tapscriptYieldRequestHex(
      0,
      TEST_DEPOSITOR_KEY_HEX,
      tableLeafHex(prepared.table, 0),
      TEST_SIG_HEX,
    );
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0xe000, respondDataHex: validYieldHex },
      { expectApduHex: CONTINUE_HEADER_HEX, respondSw: 0xe000, respondDataHex: validYieldHex },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, {})).rejects.toMatchObject({
      name: LedgerYieldMismatchError.name,
      kind: "duplicate-yield",
    });
    expect(sent()).toBe(2);
  });

  it("T9: a YIELD for Payout input 1 (witnessUtxo-only) is unexpected-input", async () => {
    const prepared = prepareFromVector("deposit-flow__claimer_payout__2");
    const requestHex = tapscriptYieldRequestHex(
      1,
      TEST_DEPOSITOR_KEY_HEX,
      tableLeafHex(prepared.table, 0),
      TEST_SIG_HEX,
    );
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0xe000, respondDataHex: requestHex },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, {})).rejects.toMatchObject({
      name: LedgerYieldMismatchError.name,
      kind: "unexpected-input",
      inputIndex: 1,
    });
    expect(sent()).toBe(1);
  });
});

describe("completion check (T10)", () => {
  it("0x9000 with a missing YIELD lists the missing (input, leaf)", async () => {
    const prepared = prepareFromVector("generated__deposit-flow__pegin__0");
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0x9000, respondDataHex: "" },
    ];
    const { send } = createScriptedSender(script);

    const outcome = await runSignPsbtLoop(send, prepared, {}).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isLedgerSignPsbtIncompleteError(outcome)).toBe(true);
    if (!isLedgerSignPsbtIncompleteError(outcome)) throw new Error("expected an incomplete error");
    expect(outcome.missing).toEqual([`0:${tableLeafHex(prepared.table, 0)}`]);
  });
});

describe("protocol failures stop the loop (T13, T14)", () => {
  it.each([
    ["unknown client-command code", "99"],
    ["GET_PREIMAGE for an unknown hash", "4000" + "ee".repeat(32)],
    ["YIELD truncated inside the varint", "10" + "fd01"],
    ["YIELD truncated inside the augm block", "10" + "00" + "40" + "aa".repeat(8)],
  ])("%s -> LedgerSignPsbtProtocolError, no further sends", async (_label, requestHex) => {
    const prepared = prepareFromVector("generated__deposit-flow__pegin__0");
    const script: ScriptedExchange[] = [
      { expectApduHex: initialApduHexOf(prepared), respondSw: 0xe000, respondDataHex: requestHex },
    ];
    const { send, sent } = createScriptedSender(script);

    await expect(runSignPsbtLoop(send, prepared, {})).rejects.toBeInstanceOf(LedgerSignPsbtProtocolError);
    expect(sent()).toBe(1);
  });
});

describe("empty table never reaches the wire (G6)", () => {
  it("prepare throws before the loop can send anything", () => {
    const { sent } = createScriptedSender([]);
    // 1-in/1-out v0 PSBT with a witnessUtxo-only input — nothing signable.
    const psbt = new Psbt();
    psbt.addInput({ hash: Buffer.alloc(32, 0x01), index: 0 });
    psbt.updateInput(0, {
      witnessUtxo: { script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0x40)]), value: 5000 },
    });
    psbt.addOutput({ script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0x2b)]), value: 1000 });

    expect(() => prepareSignPsbt({ psbtHex: psbt.toHex(), depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX })).toThrow(
      /no depositor-signable input/,
    );
    expect(sent()).toBe(0);
  });
});
