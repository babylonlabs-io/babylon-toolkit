import type { VaultProtocolInfo } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  deriveConstructionOrderedVaultIds,
  isSameVaultOrder,
} from "../splitVaultOrder";

const OTHER = `0x${"0".repeat(64)}` as Hex;
const SACRIFICIAL = `0x${"1".repeat(64)}` as Hex;
const PROTECTED = `0x${"2".repeat(64)}` as Hex;

function info(prePeginTxHash: Hex, htlcVout: number): VaultProtocolInfo {
  return {
    depositorSignedPeginTx: "0x01",
    universalChallengersVersion: 1,
    appVaultKeepersVersion: 1,
    offchainParamsVersion: 1,
    verifiedAt: 1n,
    depositorWotsPkHash: `0x${"3".repeat(64)}`,
    hashlock: `0x${"4".repeat(64)}`,
    htlcVout,
    depositorPopSignature: "0x01",
    prePeginTxHash,
    vaultProviderCommissionBps: 1,
    claimExpiredUntil: 0n,
    vaultCoreVersion: 1,
  };
}

describe("deriveConstructionOrderedVaultIds", () => {
  it("restores sacrificial-before-protected without moving unrelated slots", () => {
    const splitHash = `0x${"a".repeat(64)}` as Hex;
    const otherHash = `0x${"b".repeat(64)}` as Hex;

    const result = deriveConstructionOrderedVaultIds(
      [OTHER, PROTECTED, SACRIFICIAL],
      [info(otherHash, 0), info(splitHash, 1), info(splitHash, 0)],
    );

    expect(result).toEqual([OTHER, SACRIFICIAL, PROTECTED]);
    expect(isSameVaultOrder([OTHER, PROTECTED, SACRIFICIAL], result)).toBe(
      false,
    );
  });

  it("keeps a correctly ordered split unchanged", () => {
    const splitHash = `0x${"a".repeat(64)}` as Hex;
    const current = [SACRIFICIAL, PROTECTED] as const;
    const result = deriveConstructionOrderedVaultIds(current, [
      info(splitHash, 0),
      info(splitHash, 1),
    ]);

    expect(isSameVaultOrder(current, result)).toBe(true);
  });

  it("rejects a registry read with a different record count", () => {
    expect(() =>
      deriveConstructionOrderedVaultIds(
        [SACRIFICIAL, PROTECTED],
        [info(`0x${"a".repeat(64)}`, 0)],
      ),
    ).toThrow("different number of registry records");
  });

  it("rejects two siblings claiming the same HTLC index", () => {
    const splitHash = `0x${"a".repeat(64)}` as Hex;

    expect(() =>
      deriveConstructionOrderedVaultIds(
        [SACRIFICIAL, PROTECTED],
        [info(splitHash, 0), info(splitHash, 0)],
      ),
    ).toThrow("invalid split construction indices");
  });
});
