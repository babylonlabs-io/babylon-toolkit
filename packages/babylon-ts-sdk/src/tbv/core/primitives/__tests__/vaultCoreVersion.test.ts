/**
 * Pins the tx-graph version the vendored vault-wasm binary supports and
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
  it("supports exactly graph version 1", async () => {
    expect(await supportedTxGraphVersions()).toEqual([1]);
  });

  // The testnet reset renumbered the active Vault Core from 3 to 1, so the
  // binary refuses the pre-reset numbers 2 and 3 as well as unknown ones.
  it.each([2, 3, 4])(
    "fails closed on graph version %i, which the binary does not support",
    async (version) => {
      await expect(computeMinPeginFee(version, 2, 1, 1n)).rejects.toThrow(
        `unsupported tx graph version: ${version} (supported: 1)`,
      );
    },
  );
});

describe("PegIn P2A anchor surface (vendored vault-wasm binary)", () => {
  it("v1 anchor pins to 240 sats at vout 2 with the P2A script", async () => {
    expect(await peginP2aAnchorOutput(1)).toEqual({
      value: 240n,
      vout: 2,
      scriptPubKey: "51024e73",
    });
  });

  it("fails closed on an unsupported version instead of returning no anchor", async () => {
    await expect(peginP2aAnchorOutput(2)).rejects.toThrow(
      "unsupported tx graph version: 2 (supported: 1)",
    );
  });

  // The pinned Core 1 golden PegIn hex from pegin.test.ts, and an anchorless
  // two-output nVersion-2 PegIn: the pre-reset Core 1 shape, which the reset
  // retired while reusing its version number.
  const CORE_1_PEGIN_HEX =
    "030000000173ce2a94c3e428d7e7bdc83db4427f790c78e623397566c16834c984da4d0ff50000000000feffffff03a086010000000000225120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc06e5100000000000022512089b13f1de2d5bc700695813283363c8c3464dd9597994c072ca5e4df022c3947f0000000000000000451024e7300000000";
  const ANCHORLESS_PEGIN_HEX =
    "0200000001c66b93ce2325af6f2e8488d50fb2d48e7e320d5c5206de5152c859ad3b189da90000000000feffffff02a086010000000000225120367fb4fcbbe8a43626f4fb89398f47407d7e8e0318985c7a0d8fdb74b718bfc0fe5000000000000022512089b13f1de2d5bc700695813283363c8c3464dd9597994c072ca5e4df022c394700000000";

  it("accepts the Core 1 golden PegIn under v1 rules", async () => {
    await expect(
      validatePeginP2aAnchor(1, CORE_1_PEGIN_HEX),
    ).resolves.toBeUndefined();
  });

  it("rejects an anchorless PegIn under v1 rules (missing anchor)", async () => {
    await expect(
      validatePeginP2aAnchor(1, ANCHORLESS_PEGIN_HEX),
    ).rejects.toThrow(/missing P2A anchor/);
  });

  it("refuses to validate the Core 1 golden PegIn under graph version 3", async () => {
    await expect(validatePeginP2aAnchor(3, CORE_1_PEGIN_HEX)).rejects.toThrow(
      "unsupported tx graph version: 3 (supported: 1)",
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
