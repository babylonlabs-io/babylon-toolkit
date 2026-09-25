import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { OnChainBtcPubkey, VaultData } from "../../../clients/eth/types";
import { readStampedParticipantKeys } from "../readStampedParticipantKeys";

// secp256k1 points G, 2G, 3G, 4G (x-only): assertOnChainBtcPubkey curve-checks them.
const VP_GENESIS =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const VP_OPERATION =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const KEEPER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const CHALLENGER =
  "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13";
const VAULT_ID = `0x${"ab".repeat(32)}` as Hex;
const APP = "0xaaaa000000000000000000000000000000000001" as Address;
const VP_ADDRESS = "0xbbbb000000000000000000000000000000000002" as Address;
const EPOCHS = { vpKeyEpoch: 3n, appKeeperKeyEpoch: 4n, ucKeyEpoch: 5n };

function vault(): VaultData {
  return {
    basic: {
      applicationEntryPoint: APP,
      vaultProvider: VP_ADDRESS,
    } as VaultData["basic"],
    protocol: {
      appVaultKeepersVersion: 7,
      universalChallengersVersion: 9,
    } as VaultData["protocol"],
  };
}

function readers(over: { keepers?: unknown[]; challengers?: unknown[] } = {}) {
  return {
    registryReader: {
      getVaultProviderGenesisBtcPubKey: vi
        .fn()
        .mockResolvedValue(VP_GENESIS as OnChainBtcPubkey),
      getVaultKeyEpochs: vi.fn().mockResolvedValue(EPOCHS),
    },
    vaultKeeperReader: {
      getVaultKeepersByVersion: vi.fn().mockResolvedValue(
        over.keepers ?? [
          {
            ethAddress: "0x0000000000000000000000000000000000000011",
            btcPubKey: `0x${KEEPER}`,
          },
        ],
      ),
    },
    universalChallengerReader: {
      getUniversalChallengersByVersion: vi.fn().mockResolvedValue(
        over.challengers ?? [
          {
            ethAddress: "0x0000000000000000000000000000000000000022",
            btcPubKey: `0x${CHALLENGER}`,
          },
        ],
      ),
    },
    operationKeyReader: {
      getOperationKeysAtEpochs: vi.fn().mockResolvedValue({
        vaultProvider: `0x${VP_OPERATION}`,
        vaultKeepers: [`0x${KEEPER}`],
        universalChallengers: [`0x${CHALLENGER}`],
      }),
    },
  };
}

describe("readStampedParticipantKeys", () => {
  it("reads rosters at the vault's stamped versions and resolves operation keys at its frozen epochs", async () => {
    const r = readers();

    const keys = await readStampedParticipantKeys({
      vaultId: VAULT_ID,
      vault: vault(),
      readers: r,
    });

    expect(r.vaultKeeperReader.getVaultKeepersByVersion).toHaveBeenCalledWith(
      APP,
      7,
    );
    expect(
      r.universalChallengerReader.getUniversalChallengersByVersion,
    ).toHaveBeenCalledWith(9);
    expect(r.registryReader.getVaultKeyEpochs).toHaveBeenCalledWith(VAULT_ID);
    expect(r.operationKeyReader.getOperationKeysAtEpochs).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultProviderEthAddress: VP_ADDRESS,
        vaultProviderGenesisBtcPubkey: `0x${VP_GENESIS}`,
        applicationEntryPoint: APP,
      }),
      EPOCHS,
    );
    // The key the scripts commit to is the operation key, not the genesis key.
    expect(keys.vaultProvider.operationBtcPubkey).toBe(VP_OPERATION);
    expect(keys.vaultProvider.rotated).toBe(true);
    expect(keys.vaultKeeperOperationKeysSorted).toEqual([KEEPER]);
    expect(keys.universalChallengerOperationKeysSorted).toEqual([CHALLENGER]);
  });

  it("refuses an empty keeper roster instead of resolving zero keepers", async () => {
    await expect(
      readStampedParticipantKeys({
        vaultId: VAULT_ID,
        vault: vault(),
        readers: readers({ keepers: [] }),
      }),
    ).rejects.toThrow(/No vault keepers for version 7/);
  });

  it("refuses an empty universal-challenger roster", async () => {
    await expect(
      readStampedParticipantKeys({
        vaultId: VAULT_ID,
        vault: vault(),
        readers: readers({ challengers: [] }),
      }),
    ).rejects.toThrow(/No universal challengers for version 9/);
  });
});
