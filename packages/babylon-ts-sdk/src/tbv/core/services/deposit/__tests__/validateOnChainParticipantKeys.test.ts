import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AddressBTCKeyPair,
  OnChainBtcPubkey,
  OperationKeyQuery,
  OperationKeyReader,
  RawOperationKeys,
  UniversalChallengerReader,
  VaultKeeperReader,
  VaultRegistryReader,
} from "../../../clients/eth/types";
import {
  ADDRESSES,
  FakeOperationKeyReader,
  KEYS,
  buildQuery,
  xOnlyFromSeed,
} from "../../participants/__tests__/fixtures/rotation";
import { validateOnChainParticipantKeys } from "../validateOnChainParticipantKeys";

// Real secp256k1 x-only keys: operation-key resolution asserts every roster
// key is a curve point, so placeholder hex will not survive it. Keeper and
// challenger names are assigned in sorted order so the lex-ordering
// expectations below hold by construction rather than by luck.
const VP_KEY = xOnlyFromSeed(101);
const VP_KEY_COMPRESSED = `02${VP_KEY}`;
const VP_KEY_UPPERCASE = VP_KEY.toUpperCase();
const VP_KEY_DIFFERENT = xOnlyFromSeed(102);

const [KEEPER_1, KEEPER_2, KEEPER_3, KEEPER_OTHER] = [
  xOnlyFromSeed(103),
  xOnlyFromSeed(104),
  xOnlyFromSeed(105),
  xOnlyFromSeed(106),
].sort();

const [CHALLENGER_1, CHALLENGER_2, CHALLENGER_OTHER] = [
  xOnlyFromSeed(107),
  xOnlyFromSeed(108),
  xOnlyFromSeed(109),
].sort();

const APP_ENTRY_POINT = "0xApp" as Address;
const VP_ETH_ADDRESS = "0xVP" as Address;

const KEEPERS_VERSION = 7;
const CHALLENGERS_VERSION = 11;

function pair(btcPubKey: string): AddressBTCKeyPair {
  // The registry always returns roster keys 0x-prefixed; the bare constants in
  // this file are for readability only.
  return {
    ethAddress: "0x0" as Address,
    btcPubKey: `0x${btcPubKey}` as `0x${string}`,
  };
}

function buildReaders({
  vpKey = VP_KEY,
  keeperKeys = [KEEPER_1, KEEPER_2],
  challengerKeys = [CHALLENGER_1, CHALLENGER_2],
}: {
  vpKey?: string;
  keeperKeys?: string[];
  challengerKeys?: string[];
} = {}) {
  const vaultRegistryReader: VaultRegistryReader = {
    getVaultBasicInfo: vi.fn(),
    getVaultProtocolInfo: vi.fn(),
    getProtocolInfoBatch: vi.fn(),
    getVaultData: vi.fn(),
    getVaultProviderGenesisBtcPubKey: vi
      .fn()
      .mockResolvedValue(vpKey.toLowerCase() as OnChainBtcPubkey),
    getPegInFee: vi.fn(),
    getVaultProviderCommission: vi.fn(),
    getVaultKeyEpochs: vi.fn(),
    getVaultKeyEpochsBatch: vi.fn(),
    getCurrentVaultProviderOperationBtcKey: vi.fn(),
  };
  const vaultKeeperReader: VaultKeeperReader = {
    getVaultKeepersByVersion: vi.fn().mockResolvedValue(keeperKeys.map(pair)),
    getCurrentVaultKeepers: vi.fn(),
    getCurrentVaultKeepersVersion: vi.fn().mockResolvedValue(KEEPERS_VERSION),
  };
  const universalChallengerReader: UniversalChallengerReader = {
    getUniversalChallengersByVersion: vi
      .fn()
      .mockResolvedValue(challengerKeys.map(pair)),
    getCurrentUniversalChallengers: vi.fn(),
    getLatestUniversalChallengersVersion: vi
      .fn()
      .mockResolvedValue(CHALLENGERS_VERSION),
  };
  return {
    vaultRegistryReader,
    vaultKeeperReader,
    universalChallengerReader,
    operationKeyReader: unrotatedOperationKeyReader(),
  };
}

/**
 * Operation-key reader for an operator set that has never rotated: every
 * participant's current operation key is its genesis/roster key. Mirrors what
 * the registry's own genesis fallback returns, so these cases stay focused on
 * the indexer-hint and sorting behaviour rather than on rotation.
 */
function unrotatedOperationKeyReader(): OperationKeyReader {
  const echo = async (query: OperationKeyQuery): Promise<RawOperationKeys> => ({
    vaultProvider: query.vaultProviderGenesisBtcPubkey,
    vaultKeepers: query.vaultKeepers.map((k) => k.btcPubKey),
    universalChallengers: query.universalChallengers.map((c) => c.btcPubKey),
  });
  return {
    getCurrentOperationKeys: echo,
    getOperationKeysAtEpochs: echo,
    getPayoutScriptsAtEpochs: vi.fn(),
  };
}

describe("validateOnChainParticipantKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canonical lowercase sorted sets and the on-chain versions on the happy path", async () => {
    const readers = buildReaders();

    const result = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
    });

    expect(result.vaultProviderBtcPubkeyXOnly).toBe(VP_KEY);
    expect(result.vaultKeeperBtcPubkeysSorted).toEqual([KEEPER_1, KEEPER_2]);
    expect(result.universalChallengerBtcPubkeysSorted).toEqual([
      CHALLENGER_1,
      CHALLENGER_2,
    ]);
    expect(result.expectedAppVaultKeepersVersion).toBe(KEEPERS_VERSION);
    expect(result.expectedUniversalChallengersVersion).toBe(
      CHALLENGERS_VERSION,
    );
  });

  it("rejects when on-chain VP key differs from the indexer hint", async () => {
    const readers = buildReaders({ vpKey: VP_KEY_DIFFERENT });

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      }),
    ).rejects.toThrow(/Vault provider BTC pubkey/);
  });

  it("propagates the original error when the on-chain VP key read rejects", async () => {
    const readers = buildReaders();
    (
      readers.vaultRegistryReader
        .getVaultProviderGenesisBtcPubKey as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error("Vault provider 0xVP has no registered BTC pubkey on-chain"),
    );

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      }),
    ).rejects.toThrow("has no registered BTC pubkey on-chain");
  });

  it("rejects when the keeper count differs from the on-chain set", async () => {
    const readers = buildReaders({
      keeperKeys: [KEEPER_1, KEEPER_2, KEEPER_3],
    });

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      }),
    ).rejects.toThrow(/keeper.*does not match/i);
  });

  it("rejects when one keeper key is substituted", async () => {
    const readers = buildReaders({ keeperKeys: [KEEPER_1, KEEPER_OTHER] });

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      }),
    ).rejects.toThrow(/keeper.*does not match/i);
  });

  it("rejects when one challenger key is substituted", async () => {
    const readers = buildReaders({
      challengerKeys: [CHALLENGER_1, CHALLENGER_OTHER],
    });

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      }),
    ).rejects.toThrow(/challenger.*does not match/i);
  });

  it("accepts a compressed indexer hint that matches the on-chain x-only key", async () => {
    const readers = buildReaders();

    const result = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY_COMPRESSED,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
    });

    expect(result.vaultProviderBtcPubkeyXOnly).toBe(VP_KEY);
  });

  it("returns lex-sorted keeper and challenger sets regardless of input order", async () => {
    const readers = buildReaders({
      keeperKeys: [KEEPER_3, KEEPER_1, KEEPER_2],
      challengerKeys: [CHALLENGER_2, CHALLENGER_1],
    });

    const result = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_2, KEEPER_3, KEEPER_1],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
    });

    expect(result.vaultKeeperBtcPubkeysSorted).toEqual([
      KEEPER_1,
      KEEPER_2,
      KEEPER_3,
    ]);
    expect(result.universalChallengerBtcPubkeysSorted).toEqual([
      CHALLENGER_1,
      CHALLENGER_2,
    ]);
  });

  it("accepts an uppercase hint and returns lowercase canonical hex", async () => {
    const readers = buildReaders();

    const result = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY_UPPERCASE,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
    });

    expect(result.vaultProviderBtcPubkeyXOnly).toBe(VP_KEY);
    expect(result.vaultProviderBtcPubkeyXOnly).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("validateOnChainParticipantKeys with operation-key resolution", () => {
  // Real secp256k1 points, because resolution validates curve membership —
  // the placeholder keys above would be rejected before any hint comparison.
  const REGISTRATION = {
    vp: KEYS.vpGenesis,
    keepers: [
      KEYS.keeperAGenesis,
      KEYS.keeperBGenesis,
      KEYS.keeperCGenesis,
    ].sort(),
    challengers: [KEYS.challenger1Genesis, KEYS.challenger2Genesis].sort(),
  };
  const OPERATION = {
    vp: KEYS.vpRotated,
    keepers: [
      KEYS.keeperAGenesis,
      KEYS.keeperBRotated,
      KEYS.keeperCGenesis,
    ].sort(),
    challengers: [KEYS.challenger1Rotated, KEYS.challenger2Genesis].sort(),
  };

  function buildRotationReaders() {
    const query = buildQuery();
    return {
      vaultRegistryReader: {
        getVaultBasicInfo: vi.fn(),
        getVaultProtocolInfo: vi.fn(),
        getProtocolInfoBatch: vi.fn(),
        getVaultData: vi.fn(),
        getVaultProviderGenesisBtcPubKey: vi
          .fn()
          .mockResolvedValue(KEYS.vpGenesis as OnChainBtcPubkey),
        getPegInFee: vi.fn(),
        getVaultProviderCommission: vi.fn(),
        getVaultKeyEpochs: vi.fn(),
        getVaultKeyEpochsBatch: vi.fn(),
        getCurrentVaultProviderOperationBtcKey: vi.fn(),
      } as VaultRegistryReader,
      vaultKeeperReader: {
        getVaultKeepersByVersion: vi.fn().mockResolvedValue(query.vaultKeepers),
        getCurrentVaultKeepers: vi.fn(),
        getCurrentVaultKeepersVersion: vi.fn().mockResolvedValue(3),
      } as VaultKeeperReader,
      universalChallengerReader: {
        getUniversalChallengersByVersion: vi
          .fn()
          .mockResolvedValue(query.universalChallengers),
        getCurrentUniversalChallengers: vi.fn(),
        getLatestUniversalChallengersVersion: vi.fn().mockResolvedValue(5),
      } as UniversalChallengerReader,
      operationKeyReader: new FakeOperationKeyReader(),
      vaultProviderEthAddress: ADDRESSES.vaultProvider,
      applicationEntryPoint: ADDRESSES.applicationEntryPoint,
    };
  }

  it("builds with the operation keys, not the registration keys", async () => {
    const readers = buildRotationReaders();

    const result = await validateOnChainParticipantKeys({
      ...readers,
      expectedVaultProviderBtcPubkey: REGISTRATION.vp,
      expectedVaultKeeperBtcPubkeys: REGISTRATION.keepers,
      expectedUniversalChallengerBtcPubkeys: REGISTRATION.challengers,
    });

    expect(result.vaultProviderBtcPubkeyXOnly).toBe(OPERATION.vp);
    expect(result.vaultKeeperBtcPubkeysSorted).toEqual(OPERATION.keepers);
    expect(result.universalChallengerBtcPubkeysSorted).toEqual(
      OPERATION.challengers,
    );
    // The registration keys stay available for diagnostics.
    expect(result.registrationKeys.vaultProvider).toBe(REGISTRATION.vp);
    expect(result.participantKeys).not.toBeNull();
  });

  it("accepts an indexer hint that still serves the registration keys", async () => {
    const readers = buildRotationReaders();
    const onIndexerServingOperationKeys = vi.fn();

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        expectedVaultProviderBtcPubkey: REGISTRATION.vp,
        expectedVaultKeeperBtcPubkeys: REGISTRATION.keepers,
        expectedUniversalChallengerBtcPubkeys: REGISTRATION.challengers,
        onIndexerServingOperationKeys,
      }),
    ).resolves.toBeDefined();

    expect(onIndexerServingOperationKeys).not.toHaveBeenCalled();
  });

  it("accepts an indexer hint that has caught up to the operation keys", async () => {
    const readers = buildRotationReaders();
    const onIndexerServingOperationKeys = vi.fn();

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        expectedVaultProviderBtcPubkey: OPERATION.vp,
        expectedVaultKeeperBtcPubkeys: OPERATION.keepers,
        expectedUniversalChallengerBtcPubkeys: OPERATION.challengers,
        onIndexerServingOperationKeys,
      }),
    ).resolves.toBeDefined();

    expect(onIndexerServingOperationKeys).toHaveBeenCalledTimes(1);
  });

  it("rejects a hint that mixes registration and operation keys across roles", async () => {
    // A half-applied indexer view: the VP is still pre-rotation while the
    // challengers have caught up. No single snapshot of the indexer ever held
    // this combination.
    const readers = buildRotationReaders();

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        expectedVaultProviderBtcPubkey: REGISTRATION.vp,
        expectedVaultKeeperBtcPubkeys: REGISTRATION.keepers,
        expectedUniversalChallengerBtcPubkeys: OPERATION.challengers,
      }),
    ).rejects.toThrow(/internally inconsistent/i);
  });

  // The block clears only when the indexer converges, so it must be reported
  // rather than surfacing as user reports of a provider nobody can deposit to.
  it("reports a half-applied indexer view before throwing", async () => {
    const readers = buildRotationReaders();
    const onIndexerHintsInconsistent = vi.fn();

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        expectedVaultProviderBtcPubkey: REGISTRATION.vp,
        expectedVaultKeeperBtcPubkeys: REGISTRATION.keepers,
        expectedUniversalChallengerBtcPubkeys: OPERATION.challengers,
        onIndexerHintsInconsistent,
      }),
    ).rejects.toThrow(/internally inconsistent/i);

    expect(onIndexerHintsInconsistent).toHaveBeenCalledTimes(1);
    expect(onIndexerHintsInconsistent).toHaveBeenCalledWith(
      expect.stringContaining(ADDRESSES.vaultProvider),
    );
  });

  it("rejects a hint matching neither key set", async () => {
    const readers = buildRotationReaders();

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        expectedVaultProviderBtcPubkey: KEYS.outsider,
        expectedVaultKeeperBtcPubkeys: REGISTRATION.keepers,
        expectedUniversalChallengerBtcPubkeys: REGISTRATION.challengers,
      }),
    ).rejects.toThrow(/Vault provider BTC pubkey/);
  });
});
