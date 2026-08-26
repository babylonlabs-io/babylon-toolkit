import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TAP_INTERNAL_KEY, tapInternalPubkey } from "../constants";

// Differential source of truth: the engine's own constants, loaded from its
// TypeScript source rather than its package specifier. The specifier resolves
// to the engine's built `dist/`, so a stale build would pin this copy to bytes
// the engine no longer ships.
const ENGINE_CONSTANTS_SOURCE = resolve(
  __dirname,
  "../../../../../../babylon-tbv-rust-wasm/src/constants.ts",
);

const engineConstants = (await import(
  /* @vite-ignore */ ENGINE_CONSTANTS_SOURCE
)) as { TAP_INTERNAL_KEY: string; tapInternalPubkey: Uint8Array };

describe("WASM-free protocol constants", () => {
  it("keeps the local BIP-341 internal key hex identical to the engine source's", () => {
    expect(TAP_INTERNAL_KEY).toBe(engineConstants.TAP_INTERNAL_KEY);
  });

  it("keeps the decoded internal key bytes identical to the engine source's", () => {
    expect(Array.from(tapInternalPubkey)).toEqual(
      Array.from(engineConstants.tapInternalPubkey),
    );
  });

  it("decodes the internal key to 32 bytes", () => {
    expect(tapInternalPubkey).toHaveLength(32);
  });
});
