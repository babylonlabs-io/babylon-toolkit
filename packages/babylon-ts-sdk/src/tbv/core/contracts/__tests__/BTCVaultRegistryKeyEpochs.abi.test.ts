import { decodeFunctionResult, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";

import { BTCVaultRegistryABI } from "../abis/BTCVaultRegistry.abi";
import { BTCVaultRegistryKeyEpochsABI } from "../abis/BTCVaultRegistryKeyEpochs.abi";

/**
 * `getBtcVaultProtocolInfo` is declared twice on purpose: the shared ABI keeps
 * the 13-field shape that decodes against every deployed registry, and the
 * key-epochs ABI carries the three RFC-006 epoch fields. These tests pin the
 * two properties that make that split safe.
 */

type AbiComponent = { readonly name: string; readonly type: string };

function protocolInfoComponents(
  abi: typeof BTCVaultRegistryABI | typeof BTCVaultRegistryKeyEpochsABI,
): AbiComponent[] {
  const entry = abi.find(
    (item) =>
      item.type === "function" && item.name === "getBtcVaultProtocolInfo",
  );
  if (!entry || !("outputs" in entry)) {
    throw new Error("getBtcVaultProtocolInfo not found in ABI");
  }
  const output = entry.outputs[0] as { components?: readonly AbiComponent[] };
  if (!output.components) {
    throw new Error("getBtcVaultProtocolInfo output has no components");
  }
  return [...output.components];
}

/** A legacy (pre-RFC-006) protocol-info tuple, as a 13-field registry returns it. */
const LEGACY_PROTOCOL_INFO = {
  depositorSignedPeginTx: "0xdeadbeef",
  universalChallengersVersion: 1,
  appVaultKeepersVersion: 2,
  offchainParamsVersion: 3,
  verifiedAt: 4n,
  depositorWotsPkHash: `0x${"11".repeat(32)}`,
  hashlock: `0x${"22".repeat(32)}`,
  htlcVout: 0,
  depositorPopSignature: "0xc0ffee",
  prePeginTxHash: `0x${"33".repeat(32)}`,
  vaultProviderCommissionBps: 100,
  claimExpiredUntil: 0n,
  vaultCoreVersion: 1,
} as const;

const RFC006_PROTOCOL_INFO = {
  ...LEGACY_PROTOCOL_INFO,
  vpKeyEpoch: 7n,
  appKeeperKeyEpoch: 8n,
  ucKeyEpoch: 9n,
} as const;

describe("BTCVaultRegistryKeyEpochsABI", () => {
  it("declares the 13 shared components as an exact prefix of its 16", () => {
    const shared = protocolInfoComponents(BTCVaultRegistryABI);
    const extended = protocolInfoComponents(BTCVaultRegistryKeyEpochsABI);

    expect(shared).toHaveLength(13);
    expect(extended).toHaveLength(16);

    // Name AND type, in order. The tuple is positional, so a rename or a
    // widened type in one copy and not the other silently misaligns every
    // field after it.
    expect(extended.slice(0, shared.length)).toEqual(shared);
  });

  it("appends exactly the three RFC-006 uint64 key epochs", () => {
    const extended = protocolInfoComponents(BTCVaultRegistryKeyEpochsABI);

    expect(extended.slice(13)).toEqual([
      { name: "vpKeyEpoch", type: "uint64", internalType: "uint64" },
      { name: "appKeeperKeyEpoch", type: "uint64", internalType: "uint64" },
      { name: "ucKeyEpoch", type: "uint64", internalType: "uint64" },
    ]);
  });

  it("silently mis-decodes a populated pre-RFC-006 registry response", () => {
    // The hazard, stated exactly. `BTCVaultProtocolInfo` is a *dynamic* tuple
    // (it contains `bytes`), so its encoding is a 13-word head followed by the
    // tail holding the dynamic payloads. Asking for 16 head words does not run
    // off the end of the returndata — it reads three words of *tail* and hands
    // them back as epochs. No throw, no warning, plausible-looking small
    // integers.
    //
    // So the extended ABI must never be read on a registry that has not been
    // upgraded. Being careful with the values is not enough; the capability
    // probe below is the only thing standing between this and resolving
    // participant keys at a fabricated epoch.
    const legacyReturndata = encodeFunctionResult({
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultProtocolInfo",
      result: LEGACY_PROTOCOL_INFO,
    });

    const decoded = decodeFunctionResult({
      abi: BTCVaultRegistryKeyEpochsABI,
      functionName: "getBtcVaultProtocolInfo",
      data: legacyReturndata,
    }) as unknown as Record<string, bigint>;

    // Garbage, not an error — and not the zeros a real pre-rotation vault has.
    expect(decoded.vpKeyEpoch).not.toBe(0n);
  });

  it("throws on an empty response from a legacy registry", () => {
    // A *nonexistent* vault has empty `bytes` fields, so its tail is only two
    // length words — too short to satisfy a 16-word head, and viem throws.
    // Contrast with the populated-vault case above, where a legacy registry
    // decodes silently into garbage epochs instead of failing.
    //
    // On an upgraded registry the same call decodes cleanly to all-zero.
    const emptyLegacyReturndata = encodeFunctionResult({
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultProtocolInfo",
      result: {
        ...LEGACY_PROTOCOL_INFO,
        depositorSignedPeginTx: "0x",
        depositorPopSignature: "0x",
      },
    });

    expect(() =>
      decodeFunctionResult({
        abi: BTCVaultRegistryKeyEpochsABI,
        functionName: "getBtcVaultProtocolInfo",
        data: emptyLegacyReturndata,
      }),
    ).toThrow();
  });

  it("lets the shared ABI keep decoding an upgraded registry response", () => {
    // The other direction must NOT throw: the 13-field shared entry is read on
    // every legacy code path and has to keep working after a registry is
    // upgraded, ignoring the trailing epoch fields.
    const rfc006Returndata = encodeFunctionResult({
      abi: BTCVaultRegistryKeyEpochsABI,
      functionName: "getBtcVaultProtocolInfo",
      result: RFC006_PROTOCOL_INFO,
    });

    const decoded = decodeFunctionResult({
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultProtocolInfo",
      data: rfc006Returndata,
    });

    expect(decoded).toMatchObject(LEGACY_PROTOCOL_INFO);
  });

  it("decodes the epochs from an upgraded registry response", () => {
    const rfc006Returndata = encodeFunctionResult({
      abi: BTCVaultRegistryKeyEpochsABI,
      functionName: "getBtcVaultProtocolInfo",
      result: RFC006_PROTOCOL_INFO,
    });

    const decoded = decodeFunctionResult({
      abi: BTCVaultRegistryKeyEpochsABI,
      functionName: "getBtcVaultProtocolInfo",
      data: rfc006Returndata,
    });

    expect(decoded).toMatchObject({
      vpKeyEpoch: 7n,
      appKeeperKeyEpoch: 8n,
      ucKeyEpoch: 9n,
    });
  });
});
