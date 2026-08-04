import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  resolveCurrentParticipantKeys,
  resolveParticipantKeysAtEpochs,
} from "../resolveParticipantKeys";
import {
  ADDRESSES,
  EPOCH_AFTER_ROTATION,
  EPOCH_GENESIS,
  FakeOperationKeyReader,
  KEYS,
  buildQuery,
  epochsAt,
} from "./fixtures/rotation";

describe("resolveParticipantKeysAtEpochs", () => {
  it("resolves every participant to its genesis key at epoch 0", async () => {
    // The proof that turning the flag on before anyone rotates is a no-op:
    // epoch-aware resolution must reproduce the registration/roster keys
    // byte-for-byte.
    const result = await resolveParticipantKeysAtEpochs({
      operationKeyReader: new FakeOperationKeyReader(),
      query: buildQuery(),
      epochs: epochsAt(EPOCH_GENESIS),
    });

    expect(result.vaultProvider.operationBtcPubkey).toBe(KEYS.vpGenesis);
    expect(result.vaultProvider.rotated).toBe(false);
    expect(result.vaultKeeperOperationKeysSorted).toEqual(
      [KEYS.keeperAGenesis, KEYS.keeperBGenesis, KEYS.keeperCGenesis].sort(),
    );
    expect(result.universalChallengerOperationKeysSorted).toEqual(
      [KEYS.challenger1Genesis, KEYS.challenger2Genesis].sort(),
    );
    expect(result.vaultKeepers.every((k) => !k.rotated)).toBe(true);
  });

  it("resolves rotated participants to their new keys after the rotation epoch", async () => {
    const result = await resolveParticipantKeysAtEpochs({
      operationKeyReader: new FakeOperationKeyReader(),
      query: buildQuery(),
      epochs: epochsAt(EPOCH_AFTER_ROTATION),
    });

    expect(result.vaultProvider.operationBtcPubkey).toBe(KEYS.vpRotated);
    expect(result.vaultProvider.rotated).toBe(true);

    const keeperB = result.vaultKeepers.find(
      (k) => k.adminAddress === ADDRESSES.keeperB,
    );
    expect(keeperB?.operationBtcPubkey).toBe(KEYS.keeperBRotated);
    expect(keeperB?.rotated).toBe(true);

    // Keeper A never rotated and must be untouched by B's rotation.
    const keeperA = result.vaultKeepers.find(
      (k) => k.adminAddress === ADDRESSES.keeperA,
    );
    expect(keeperA?.operationBtcPubkey).toBe(KEYS.keeperAGenesis);
    expect(keeperA?.rotated).toBe(false);
  });

  it("keeps each resolved key paired with its own admin address after a reorder", async () => {
    // Keeper B's rotated key sorts ahead of its genesis, so the sorted array
    // reorders between the two epochs while the roster order does not. The
    // pairs must follow the operator, not the sort position — anything that
    // index-joins a sorted array back to the roster breaks here.
    const reader = new FakeOperationKeyReader();
    const query = buildQuery();

    const atGenesis = await resolveParticipantKeysAtEpochs({
      operationKeyReader: reader,
      query,
      epochs: epochsAt(EPOCH_GENESIS),
    });
    const afterRotation = await resolveParticipantKeysAtEpochs({
      operationKeyReader: reader,
      query,
      epochs: epochsAt(EPOCH_AFTER_ROTATION),
    });

    const positionOf = (keys: string[], key: string) => keys.indexOf(key);
    expect(
      positionOf(atGenesis.vaultKeeperOperationKeysSorted, KEYS.keeperBGenesis),
    ).not.toBe(
      positionOf(
        afterRotation.vaultKeeperOperationKeysSorted,
        KEYS.keeperBRotated,
      ),
    );

    // Roster order is unchanged, and every pair still names its own operator.
    expect(afterRotation.vaultKeepers.map((k) => k.adminAddress)).toEqual([
      ADDRESSES.keeperA,
      ADDRESSES.keeperB,
      ADDRESSES.keeperC,
    ]);
    expect(
      afterRotation.vaultKeepers.find(
        (k) => k.adminAddress === ADDRESSES.keeperB,
      )?.genesisBtcPubkey,
    ).toBe(KEYS.keeperBGenesis);
  });

  it("rejects two participants resolving to the same operation key", async () => {
    // Registration guarantees distinct registered keys, but nothing stops two
    // operators rotating onto the same key. A duplicate would collapse the
    // sorted script key set and silently build the wrong lock.
    const reader = new FakeOperationKeyReader({
      forceKey: new Map<Address, Hex>([
        [ADDRESSES.keeperA, `0x${KEYS.keeperCGenesis}` as Hex],
      ]),
    });

    await expect(
      resolveParticipantKeysAtEpochs({
        operationKeyReader: reader,
        query: buildQuery(),
        epochs: epochsAt(EPOCH_GENESIS),
      }),
    ).rejects.toThrow(/operation key collision/i);
  });

  it("rejects a keeper that rotated onto the vault provider's key", async () => {
    const reader = new FakeOperationKeyReader({
      forceKey: new Map<Address, Hex>([
        [ADDRESSES.keeperA, `0x${KEYS.vpGenesis}` as Hex],
      ]),
    });

    await expect(
      resolveParticipantKeysAtEpochs({
        operationKeyReader: reader,
        query: buildQuery(),
        epochs: epochsAt(EPOCH_GENESIS),
      }),
    ).rejects.toThrow(/operation key collision/i);
  });

  it("rejects a key that is not on the secp256k1 curve", async () => {
    const reader = new FakeOperationKeyReader({
      forceKey: new Map<Address, Hex>([
        [ADDRESSES.keeperA, `0x${"ff".repeat(32)}` as Hex],
      ]),
    });

    await expect(
      resolveParticipantKeysAtEpochs({
        operationKeyReader: reader,
        query: buildQuery(),
        epochs: epochsAt(EPOCH_GENESIS),
      }),
    ).rejects.toThrow(/secp256k1 curve/i);
  });

  it("rejects a zero-hash key rather than treating it as absent", async () => {
    const reader = new FakeOperationKeyReader({
      forceKey: new Map<Address, Hex>([
        [ADDRESSES.keeperA, `0x${"00".repeat(32)}` as Hex],
      ]),
    });

    await expect(
      resolveParticipantKeysAtEpochs({
        operationKeyReader: reader,
        query: buildQuery(),
        epochs: epochsAt(EPOCH_GENESIS),
      }),
    ).rejects.toThrow(/secp256k1 curve/i);
  });

  it("records the epochs it resolved against", async () => {
    const result = await resolveParticipantKeysAtEpochs({
      operationKeyReader: new FakeOperationKeyReader(),
      query: buildQuery(),
      epochs: epochsAt(EPOCH_AFTER_ROTATION),
    });

    expect(result.resolvedAt).toEqual({
      mode: "epochs",
      epochs: epochsAt(EPOCH_AFTER_ROTATION),
    });
  });
});

describe("resolveCurrentParticipantKeys", () => {
  it("matches the latest epoch resolution without issuing an epoch read", async () => {
    // The new-pegin and VP-auth paths use this, and must never touch the
    // extended `getBtcVaultProtocolInfo` ABI to do so.
    const currentReader = new FakeOperationKeyReader();
    const current = await resolveCurrentParticipantKeys({
      operationKeyReader: currentReader,
      query: buildQuery(),
    });

    const atLatest = await resolveParticipantKeysAtEpochs({
      operationKeyReader: new FakeOperationKeyReader(),
      query: buildQuery(),
      epochs: epochsAt(EPOCH_AFTER_ROTATION),
    });

    expect(current.vaultProvider.operationBtcPubkey).toBe(
      atLatest.vaultProvider.operationBtcPubkey,
    );
    expect(current.vaultKeeperOperationKeysSorted).toEqual(
      atLatest.vaultKeeperOperationKeysSorted,
    );
    expect(current.universalChallengerOperationKeysSorted).toEqual(
      atLatest.universalChallengerOperationKeysSorted,
    );

    expect(currentReader.calls).toEqual(["getCurrentOperationKeys"]);
    expect(currentReader.calls).not.toContain("getOperationKeysAtEpochs");
    expect(current.resolvedAt).toEqual({ mode: "current" });
  });

  it("rejects a registry response whose length does not match the roster", async () => {
    const shortReader = {
      getCurrentOperationKeys: async () => ({
        vaultProvider: `0x${KEYS.vpGenesis}` as Hex,
        vaultKeepers: [`0x${KEYS.keeperAGenesis}` as Hex],
        universalChallengers: [],
      }),
      getOperationKeysAtEpochs: async () => {
        throw new Error("unused");
      },
      getPayoutScriptsAtEpochs: async () => {
        throw new Error("unused");
      },
    };

    await expect(
      resolveCurrentParticipantKeys({
        operationKeyReader: shortReader,
        query: buildQuery(),
      }),
    ).rejects.toThrow(/for a roster of/i);
  });
});
