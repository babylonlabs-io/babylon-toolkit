import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  joinBabeSessions,
  splitArtifactsForJoin,
} from "../join-babe-sessions.mjs";

const CHALLENGER_A = "aa".repeat(32);
const CHALLENGER_B = "bb".repeat(32);
const HIGH_WATER_MARK = 64 * 1024;
// 50x the read buffer, so a scanner that accumulates the span would show it.
const SESSION_HEX_CHARS = 50 * HIGH_WATER_MARK;

const ARTIFACTS = {
  vault_core_version: 3,
  tx_graph: '{"babe_sessions":{}}',
  claim_tx: "0200",
  signatures: { assert_claimer_sig: "cc".repeat(64) },
  vault_id: "0x" + "dd".repeat(32),
  babe_sessions: {},
};

const BUNDLE = {
  tx_graph_json: JSON.stringify({
    note: 'contains "babe_sessions":{} as text',
    braces: "}{",
  }),
  babe_sessions: {
    [CHALLENGER_A]: {
      decryptor_artifacts_hex: "ab".repeat(SESSION_HEX_CHARS / 2),
    },
    [CHALLENGER_B]: {
      decryptor_artifacts_hex: "cd".repeat(SESSION_HEX_CHARS / 2),
    },
  },
  verifying_key_hex: "ee".repeat(132),
};

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "join-babe-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(artifacts, bundle) {
  const artifactsPath = join(dir, "artifacts.json");
  const bundlePath = join(dir, "bundle.json");
  const outPath = join(dir, "joined.json");
  await writeFile(
    artifactsPath,
    typeof artifacts === "string" ? artifacts : JSON.stringify(artifacts),
  );
  await writeFile(
    bundlePath,
    typeof bundle === "string" ? bundle : JSON.stringify(bundle),
  );
  const stats = await joinBabeSessions({
    artifactsPath,
    bundlePath,
    outPath,
    highWaterMark: HIGH_WATER_MARK,
  });
  return { stats, out: await readFile(outPath, "utf8") };
}

describe("joinBabeSessions", () => {
  it("replaces an empty babe_sessions with the bundle's, byte-identical elsewhere, without buffering the span", async () => {
    const { stats, out } = await run(ARTIFACTS, BUNDLE);

    expect(JSON.parse(out)).toEqual({
      ...ARTIFACTS,
      babe_sessions: BUNDLE.babe_sessions,
    });
    // Everything before the spliced value is the original file's bytes.
    expect(
      out.startsWith(JSON.stringify(ARTIFACTS).slice(0, -"{}}".length)),
    ).toBe(true);
    expect(stats.babeSessionsBytes).toBe(
      Buffer.byteLength(JSON.stringify(BUNDLE.babe_sessions)),
    );
    expect(stats.maxChunkBytes).toBeLessThanOrEqual(HIGH_WATER_MARK);
  });

  it("appends babe_sessions when the artifacts carry no such key", async () => {
    const { babe_sessions: _omitted, ...withoutKey } = ARTIFACTS;
    const { out } = await run(withoutKey, BUNDLE);

    expect(JSON.parse(out)).toEqual({
      ...withoutKey,
      babe_sessions: BUNDLE.babe_sessions,
    });
  });

  it("replaces the browser's placeholder map (one \"00\" entry per challenger) with the bundle's sessions", async () => {
    const placeholder = {
      ...ARTIFACTS,
      babe_sessions: { [CHALLENGER_A]: { decryptor_artifacts_hex: "00" } },
    };
    const { out } = await run(placeholder, BUNDLE);

    expect(JSON.parse(out)).toEqual({
      ...ARTIFACTS,
      babe_sessions: BUNDLE.babe_sessions,
    });
  });

  it("refuses artifacts that already carry real sessions", async () => {
    const withSessions = {
      ...ARTIFACTS,
      babe_sessions: { [CHALLENGER_A]: { decryptor_artifacts_hex: "ab" } },
    };

    await expect(run(withSessions, BUNDLE)).rejects.toThrow(
      /already carries real babe_sessions/,
    );
  });

  it("refuses a bundle whose babe_sessions object never closes", async () => {
    // Sessions last, then drop the two closing braces (babe_sessions and the
    // top level) so the scanner reaches EOF while still inside the value.
    const sessionsLast = {
      tx_graph_json: BUNDLE.tx_graph_json,
      verifying_key_hex: BUNDLE.verifying_key_hex,
      babe_sessions: BUNDLE.babe_sessions,
    };
    const truncated = JSON.stringify(sessionsLast).slice(0, -2);

    await expect(run(ARTIFACTS, truncated)).rejects.toThrow(
      /no complete top-level babe_sessions/,
    );
    // No half-written output survives a failure.
    expect(
      (await readdir(dir)).filter((name) => name.startsWith("joined")),
    ).toEqual([]);
  });
});

describe("splitArtifactsForJoin", () => {
  it("splits at the top-level entry, ignoring escaped and nested copies", () => {
    expect(
      splitArtifactsForJoin(
        '{"tx_graph":"{\\"babe_sessions\\":{}}","x":1,"babe_sessions":{}}',
      ),
    ).toEqual({
      head: '{"tx_graph":"{\\"babe_sessions\\":{}}","x":1,"babe_sessions":',
      tail: "}",
    });
    expect(
      splitArtifactsForJoin(
        '{"nested":{"babe_sessions":{}},"babe_sessions":{}}',
      ),
    ).toEqual({
      head: '{"nested":{"babe_sessions":{}},"babe_sessions":',
      tail: "}",
    });
  });
});
