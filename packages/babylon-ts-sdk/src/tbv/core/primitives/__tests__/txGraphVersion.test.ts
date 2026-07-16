/**
 * Pins the tx-graph versions the vendored vault-wasm binary supports, and
 * that the facade fails closed on anything else. A pin bump that drops v1
 * (stranding in-flight deposits) or silently adds a version surfaces here.
 */

import { computeMinPeginFee, supportedTxGraphVersions } from "..";
import { describe, expect, it } from "vitest";

import { TX_GRAPH_VERSION_V1 } from "../txGraphVersion";

describe("tx graph version surface (vendored vault-wasm binary)", () => {
  it("supports exactly graph versions 1 and 2", async () => {
    expect(await supportedTxGraphVersions()).toEqual([1, 2]);
  });

  it("the Phase-1 pinned version is supported by the binary", async () => {
    expect(await supportedTxGraphVersions()).toContain(TX_GRAPH_VERSION_V1);
  });

  it("fails closed on a version the binary does not support", async () => {
    await expect(computeMinPeginFee(3, 2, 1, 1n)).rejects.toThrow(
      /unsupported tx graph version/,
    );
  });
});
