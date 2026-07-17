/**
 * Pins the tx-graph versions the vendored vault-wasm binary supports and
 * that the facade fails closed on anything else (a pin bump that drops v1
 * would strand in-flight deposits), plus the on-chain-value validation
 * every version source runs before a version reaches a WASM builder.
 */

import { computeMinPeginFee, supportedTxGraphVersions } from "..";
import { describe, expect, it } from "vitest";

import { assertValidVaultCoreVersion } from "../vaultCoreVersion";

describe("tx graph version surface (vendored vault-wasm binary)", () => {
  it("supports exactly graph versions 1 and 2", async () => {
    expect(await supportedTxGraphVersions()).toEqual([1, 2]);
  });

  it("fails closed on a version the binary does not support", async () => {
    await expect(computeMinPeginFee(3, 2, 1, 1n)).rejects.toThrow(
      /unsupported tx graph version/,
    );
  });
});

describe("assertValidVaultCoreVersion", () => {
  it("accepts the uint16 bounds 1 and 65535", () => {
    expect(() => assertValidVaultCoreVersion(1, "test")).not.toThrow();
    expect(() => assertValidVaultCoreVersion(65_535, "test")).not.toThrow();
  });

  it("rejects 0 (pre-vaultCoreVersion vault or mis-decoded read)", () => {
    expect(() => assertValidVaultCoreVersion(0, "test")).toThrow(
      /Invalid vaultCoreVersion 0 from test/,
    );
  });

  it("rejects values above uint16", () => {
    expect(() => assertValidVaultCoreVersion(65_536, "test")).toThrow(
      /Invalid vaultCoreVersion 65536/,
    );
  });

  it("rejects non-integers and negatives", () => {
    expect(() => assertValidVaultCoreVersion(1.5, "test")).toThrow(
      /Invalid vaultCoreVersion 1.5/,
    );
    expect(() => assertValidVaultCoreVersion(-1, "test")).toThrow(
      /Invalid vaultCoreVersion -1/,
    );
    expect(() => assertValidVaultCoreVersion(NaN, "test")).toThrow(
      /Invalid vaultCoreVersion NaN/,
    );
  });

  it("names the offending source in the error", () => {
    expect(() =>
      assertValidVaultCoreVersion(0, "BTCVaultRegistry.getBtcVaultProtocolInfo(0xabc)"),
    ).toThrow(/BTCVaultRegistry\.getBtcVaultProtocolInfo\(0xabc\)/);
  });
});
