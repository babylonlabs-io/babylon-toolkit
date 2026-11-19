// @vitest-environment node
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { tarEndOfArchive, tarHeader, tarPadding } from "../tarWriter";

const PK_A = "11".repeat(32);
const PK_B = "22".repeat(32);
const entry = (name: string, data: Uint8Array) => [
  tarHeader(name, data.byteLength),
  data,
  tarPadding(data.byteLength),
];
const patternBytes = (n: number) => {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = (i * 7919 + 13) & 0xff;
  return bytes;
};

describe("system tar reads the writer's output", () => {
  it("lists the entries and extracts byte-identical data", () => {
    const a = patternBytes(4_113);
    const b = patternBytes(8_192);
    const claim = new TextEncoder().encode(
      JSON.stringify({ format: "babylon-btc-vault-recovery-kit" }),
    );
    const parts = [
      ...entry(`sessions/${PK_A}.cbor`, a),
      ...entry(`sessions/${PK_B}.cbor`, b),
      ...entry("claim.json", claim),
      tarEndOfArchive(),
    ];
    const archive = Buffer.concat(parts.map((p) => Buffer.from(p)));
    const dir = mkdtempSync(join(tmpdir(), "kit-"));
    const file = join(dir, "kit.tar");
    writeFileSync(file, archive);

    const listed = execFileSync("tar", ["-tf", file], { encoding: "utf8" })
      .trim()
      .split("\n");
    expect(listed).toEqual([
      `sessions/${PK_A}.cbor`,
      `sessions/${PK_B}.cbor`,
      "claim.json",
    ]);
    for (const [name, data] of [
      [`sessions/${PK_A}.cbor`, a],
      [`sessions/${PK_B}.cbor`, b],
      ["claim.json", claim],
    ] as const) {
      const out = execFileSync("tar", ["-xOf", file, name]);
      expect(bytesToHex(sha256(new Uint8Array(out)))).toBe(
        bytesToHex(sha256(data)),
      );
    }
  });
});
