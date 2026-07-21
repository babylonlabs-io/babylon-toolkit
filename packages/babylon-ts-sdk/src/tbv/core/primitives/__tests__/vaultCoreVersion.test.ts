/**
 * Pins the tx-graph versions the vendored vault-wasm binary supports and
 * that the facade fails closed on anything else (a pin bump that drops v1
 * would strand in-flight deposits), plus the on-chain-value validation
 * every version source runs before a version reaches a WASM builder.
 */

import {
  computeMinPeginFee,
  peginP2aAnchorOutput,
  supportedTxGraphVersions,
  validatePeginP2aAnchor,
} from "..";
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

describe("PegIn P2A anchor surface (vendored vault-wasm binary)", () => {
  it("v1 has no anchor (null), never a zero-valued placeholder", async () => {
    expect(await peginP2aAnchorOutput(1)).toBeNull();
  });

  it("v2 anchor pins to 240 sats at vout 2 with the P2A script", async () => {
    expect(await peginP2aAnchorOutput(2)).toEqual({
      value: 240n,
      vout: 2,
      scriptPubKey: "51024e73",
    });
  });

  it("fails closed on an unsupported version instead of returning null", async () => {
    await expect(peginP2aAnchorOutput(3)).rejects.toThrow(
      /unsupported tx graph version/,
    );
  });

  // The pinned golden PegIn hexes from pegin.test.ts, reused to pin the
  // validator's cross-version fail-closed behavior against the real binary.
  const V1_PEGIN_HEX =
    "0200000001c66b93ce2325af6f2e8488d50fb2d48e7e320d5c5206de5152c859ad3b189da90000000000feffffff02a086010000000000225120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc0fe5000000000000022512089b13f1de2d5bc700695813283363c8c3464dd9597994c072ca5e4df022c394700000000";
  const V2_PEGIN_HEX =
    "030000000173ce2a94c3e428d7e7bdc83db4427f790c78e623397566c16834c984da4d0ff50000000000feffffff03a086010000000000225120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc06e5100000000000022512089b13f1de2d5bc700695813283363c8c3464dd9597994c072ca5e4df022c3947f0000000000000000451024e7300000000";

  it("accepts the v2 golden PegIn under v2 rules", async () => {
    await expect(
      validatePeginP2aAnchor(2, V2_PEGIN_HEX),
    ).resolves.toBeUndefined();
  });

  it("rejects the v1 golden PegIn under v2 rules (missing anchor)", async () => {
    await expect(validatePeginP2aAnchor(2, V1_PEGIN_HEX)).rejects.toThrow(
      /missing P2A anchor/,
    );
  });

  it("rejects the v2 golden PegIn under v1 rules (anchor must be absent)", async () => {
    await expect(validatePeginP2aAnchor(1, V2_PEGIN_HEX)).rejects.toThrow(
      /carry no P2A anchor/,
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
