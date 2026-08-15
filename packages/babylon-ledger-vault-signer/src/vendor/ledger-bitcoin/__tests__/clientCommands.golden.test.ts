/**
 * Command-trace replay goldens for the client-command interpreter.
 *
 * Every request/response pair in `vectors/command-traces/` was produced by
 * executing Ledger's Python `ClientCommandInterpreter` (`ledger-bitcoin==0.4.0`,
 * the oracle the vault firmware's own tests drive) over the firmware PSBT
 * fixtures, then independently re-verified with a plain-hashlib replay — see
 * `scripts/gen_command_traces.py` and the vendor `README.md` provenance.
 *
 * Traces replay IN ORDER through ONE interpreter per file: the element queue
 * carries state from a spilling command into its GET_MORE_ELEMENTS rounds.
 * Seeding mirrors the Python client's `sign_psbt` (maps + commitment lists via
 * `MerkelizedPsbt`); the `_NoWalletPolicy` material the oracle also seeds is
 * omitted here because no trace ever queries it — omitting lookup-only
 * material cannot change any response.
 */

import { Buffer } from "buffer";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { ClientCommandInterpreter } from "../clientCommands";
import { MerkelizedPsbt } from "../merkelizedPsbt";
import { PsbtV2 } from "../psbtv2";

interface Trace {
  command_name: string;
  request_hex: string;
  response_hex: string;
  notes?: string;
}

interface TraceFile {
  vector_id: string;
  synthetic?: boolean;
  source_vector?: string;
  elements_hex?: string[];
  traces: Trace[];
}

const TRACES_DIR = join(__dirname, "vectors", "command-traces");
const VECTORS_DIR = join(__dirname, "vectors", "signpsbt");

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Seed an interpreter exactly as the Python oracle was seeded for this file. */
function seededInterpreter(file: TraceFile): ClientCommandInterpreter {
  const interpreter = new ClientCommandInterpreter();

  if (file.synthetic) {
    // Synthetic deep-tree file: a flat known-list, elements recorded in-file.
    const elements = (file.elements_hex ?? []).map((h) => Buffer.from(h, "hex"));
    expect(elements.length).toBeGreaterThan(0);
    interpreter.addKnownList(elements);
    return interpreter;
  }

  // Real files: maps + commitment lists from the source signpsbt vector,
  // constructed through the same MerkelizedPsbt the signing prepare step uses.
  const vector = loadJson<{ psbt_hex: string }>(join(VECTORS_DIR, `${file.vector_id}.json`));
  const psbt = new PsbtV2();
  psbt.deserialize(Buffer.from(vector.psbt_hex, "hex"));
  const merkelized = new MerkelizedPsbt(psbt);

  interpreter.addKnownMapping(merkelized.globalMerkleMap);
  for (const m of merkelized.inputMerkleMaps) interpreter.addKnownMapping(m);
  for (const m of merkelized.outputMerkleMaps) interpreter.addKnownMapping(m);
  interpreter.addKnownList(merkelized.inputMapCommitments);
  interpreter.addKnownList(merkelized.outputMapCommitments);
  return interpreter;
}

const TRACE_INDEX = loadJson<{ files: { file: string; n_traces: number; per_command: Record<string, number> }[] }>(
  join(TRACES_DIR, "index.json"),
).files;

// A regenerated-but-empty fixture set must fail loudly, not create zero tests.
if (TRACE_INDEX.length === 0) {
  throw new Error("command-traces index.json lists no files");
}

describe("client-command interpreter replays the Python-oracle traces byte-for-byte", () => {
  it.each(TRACE_INDEX)("$file", ({ file: fileName, n_traces, per_command }) => {
    const file = loadJson<TraceFile>(join(TRACES_DIR, fileName));
    expect(file.traces.length).toBe(n_traces);
    expect(file.traces.length).toBeGreaterThan(0);
    const interpreter = seededInterpreter(file);

    const counts: Record<string, number> = {};
    for (const [i, trace] of file.traces.entries()) {
      counts[trace.command_name] = (counts[trace.command_name] ?? 0) + 1;
      const response = interpreter.execute(Buffer.from(trace.request_hex, "hex"));
      expect(response.toString("hex"), `${fileName} trace[${i}] ${trace.command_name}`).toBe(trace.response_hex);
    }
    expect(counts).toEqual(per_command);
  });

  it("index.json lists exactly the trace files on disk", () => {
    const onDisk = readdirSync(TRACES_DIR)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .sort();
    expect(onDisk).toEqual(TRACE_INDEX.map((f) => f.file).sort());
  });
});
