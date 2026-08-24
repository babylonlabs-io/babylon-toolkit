import {
  TAP_INTERNAL_KEY as WASM_TAP_INTERNAL_KEY,
  tapInternalPubkey as wasmTapInternalPubkey,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { describe, expect, it } from "vitest";

import { TAP_INTERNAL_KEY, tapInternalPubkey } from "../constants";

describe("WASM-free protocol constants", () => {
  it("keeps the local BIP-341 internal key hex identical to the WASM package's", () => {
    expect(TAP_INTERNAL_KEY).toBe(WASM_TAP_INTERNAL_KEY);
  });

  it("keeps the decoded internal key bytes identical to the WASM package's", () => {
    expect(Array.from(tapInternalPubkey)).toEqual(
      Array.from(wasmTapInternalPubkey),
    );
  });

  it("decodes the internal key to 32 bytes", () => {
    expect(tapInternalPubkey).toHaveLength(32);
  });
});
