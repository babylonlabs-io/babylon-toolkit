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
import {
  isApplicationEntryPointMismatchError,
  validateOnChainParticipantKeys,
} from "../validateOnChainParticipantKeys";

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

// Real 20-byte addresses: the application entry point is now compared with
// `isAddressEqual`, which parses its arguments and rejects a placeholder.
const APP_ENTRY_POINT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const VP_ETH_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const OTHER_APP_ENTRY_POINT =
  "0xcccccccccccccccccccccccccccccccccccccccc" as Address;

// Four distinct values across the two roster axes, so a swapped assignment
// between a version and an epoch — or between the keeper and challenger sides
// — changes an assertion rather than hiding behind an equal value.
const KEEPERS_VERSION = 7;
const CHALLENGERS_VERSION = 11;
const APP_KEEPER_KEY_EPOCH = 13n;
const UC_KEY_EPOCH = 17n;

/** Every read must resolve against the caller's block; there is no unpinned path. */
const TEST_BLOCK = 9_000_001n;

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
  registryApplicationEntryPoint = APP_ENTRY_POINT,
}: {
  vpKey?: string;
  keeperKeys?: string[];
  challengerKeys?: string[];
  registryApplicationEntryPoint?: Address;
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
    getVaultProviderApplication: vi
      .fn()
      .mockResolvedValue(registryApplicationEntryPoint),
  };
  const vaultKeeperReader: VaultKeeperReader = {
    getVaultKeepersByVersion: vi.fn().mockResolvedValue(keeperKeys.map(pair)),
    getCurrentVaultKeepers: vi.fn(),
    getCurrentVaultKeepersVersion: vi.fn().mockResolvedValue(KEEPERS_VERSION),
    getCurrentAppKeeperKeyEpoch: vi
      .fn()
      .mockResolvedValue(APP_KEEPER_KEY_EPOCH),
  };
  const universalChallengerReader: UniversalChallengerReader = {
    getUniversalChallengersByVersion: vi
      .fn()
      .mockResolvedValue(challengerKeys.map(pair)),
    getCurrentUniversalChallengers: vi.fn(),
    getLatestUniversalChallengersVersion: vi
      .fn()
      .mockResolvedValue(CHALLENGERS_VERSION),
    getCurrentUcKeyEpoch: vi.fn().mockResolvedValue(UC_KEY_EPOCH),
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

  it("resolves every read against the caller's block when one is given", async () => {
    const readers = buildReaders();
    const operationKeyReader: OperationKeyReader = {
      ...readers.operationKeyReader,
      getCurrentOperationKeys: vi.fn(async (query: OperationKeyQuery) => ({
        vaultProvider: query.vaultProviderGenesisBtcPubkey,
        vaultKeepers: query.vaultKeepers.map((k) => k.btcPubKey),
        universalChallengers: query.universalChallengers.map(
          (c) => c.btcPubKey,
        ),
      })),
    };
    const blockNumber = 4_242_042n;

    await validateOnChainParticipantKeys({
      ...readers,
      operationKeyReader,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      blockNumber,
    });

    // The three rounds are dependent — versions, then members at those
    // versions, then those members' operation keys — so an unpinned read in any
    // one of them reopens the window this parameter exists to close.
    expect(
      readers.vaultRegistryReader.getVaultProviderGenesisBtcPubKey,
    ).toHaveBeenCalledWith(VP_ETH_ADDRESS, blockNumber);
    expect(
      readers.vaultKeeperReader.getCurrentVaultKeepersVersion,
    ).toHaveBeenCalledWith(APP_ENTRY_POINT, blockNumber);
    expect(
      readers.universalChallengerReader.getLatestUniversalChallengersVersion,
    ).toHaveBeenCalledWith(blockNumber);
    expect(
      readers.vaultKeeperReader.getVaultKeepersByVersion,
    ).toHaveBeenCalledWith(APP_ENTRY_POINT, KEEPERS_VERSION, blockNumber);
    expect(
      readers.universalChallengerReader.getUniversalChallengersByVersion,
    ).toHaveBeenCalledWith(CHALLENGERS_VERSION, blockNumber);
    expect(operationKeyReader.getCurrentOperationKeys).toHaveBeenCalledWith(
      expect.anything(),
      blockNumber,
    );
    // The application entry point and the two key epochs feed the peg-in
    // fingerprint, which the registry re-derives at inclusion. An unpinned read
    // here would commit to a block the Bitcoin scripts were never built from.
    expect(
      readers.vaultRegistryReader.getVaultProviderApplication,
    ).toHaveBeenCalledWith(VP_ETH_ADDRESS, blockNumber);
    expect(
      readers.vaultKeeperReader.getCurrentAppKeeperKeyEpoch,
    ).toHaveBeenCalledWith(APP_ENTRY_POINT, blockNumber);
    expect(
      readers.universalChallengerReader.getCurrentUcKeyEpoch,
    ).toHaveBeenCalledWith(blockNumber);
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
      blockNumber: TEST_BLOCK,
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
    expect(result.appKeeperKeyEpoch).toBe(APP_KEEPER_KEY_EPOCH);
    expect(result.ucKeyEpoch).toBe(UC_KEY_EPOCH);
  });

  it("returns the key epochs as bigint, never narrowed to number", async () => {
    const readers = buildReaders();

    const result = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      blockNumber: TEST_BLOCK,
    });

    // The contract encodes both as `uint64`. A `Number` round-trip is lossless
    // for the small values a fixture uses and lossy above 2^53, so the type is
    // asserted rather than only the value.
    expect(typeof result.appKeeperKeyEpoch).toBe("bigint");
    expect(typeof result.ucKeyEpoch).toBe("bigint");
  });

  it("rejects when the registry's application entry point differs from the caller's", async () => {
    const readers = buildReaders({
      registryApplicationEntryPoint: OTHER_APP_ENTRY_POINT,
    });

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
        blockNumber: TEST_BLOCK,
      }),
    ).rejects.toThrow(/is registered to application/);
  });

  it("types the entry-point mismatch so a consumer can substitute its own copy", async () => {
    // The message names two addresses and the three protocol values at stake.
    // That belongs in a bug report, not in a callout — so the error has to be
    // recognisable rather than land in a mapper's raw-message fallback.
    const readers = buildReaders({
      registryApplicationEntryPoint: OTHER_APP_ENTRY_POINT,
    });

    const thrown = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      blockNumber: TEST_BLOCK,
    }).catch((err: unknown) => err);

    expect(isApplicationEntryPointMismatchError(thrown)).toBe(true);
  });

  it("names the malformed entry point rather than letting viem's parser throw", async () => {
    // Callers reach this with a plain `string` cast to `Address`. Comparing
    // parses both sides, so without the shape check first the depositor would
    // get viem's InvalidAddressError instead of the error written for this.
    const readers = buildReaders();

    const thrown = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: "0xAppController" as Address,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      blockNumber: TEST_BLOCK,
    }).catch((err: unknown) => err);

    expect(isApplicationEntryPointMismatchError(thrown)).toBe(true);
    expect((thrown as Error).message).toMatch(/not a valid address/);
  });

  it("fails closed on an entry-point mismatch, before any roster is read", async () => {
    const readers = buildReaders({
      registryApplicationEntryPoint: OTHER_APP_ENTRY_POINT,
    });

    await expect(
      validateOnChainParticipantKeys({
        ...readers,
        vaultProviderEthAddress: VP_ETH_ADDRESS,
        applicationEntryPoint: APP_ENTRY_POINT,
        expectedVaultProviderBtcPubkey: VP_KEY,
        expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
        expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
        blockNumber: TEST_BLOCK,
      }),
    ).rejects.toThrow();

    // The point of the check is that it precedes every read keyed on the entry
    // point. Throwing after the rosters were fetched would still surface the
    // fault, but it would mean the wrong application had already been queried.
    expect(
      readers.vaultKeeperReader.getCurrentVaultKeepersVersion,
    ).not.toHaveBeenCalled();
    expect(
      readers.vaultKeeperReader.getCurrentAppKeeperKeyEpoch,
    ).not.toHaveBeenCalled();
    expect(
      readers.vaultKeeperReader.getVaultKeepersByVersion,
    ).not.toHaveBeenCalled();
  });

  it("accepts an entry point that matches but differs in EIP-55 casing", async () => {
    // The two values reach this function from different sources and need not
    // agree on checksum casing, so the comparison must parse addresses rather
    // than compare strings.
    const readers = buildReaders({
      registryApplicationEntryPoint: APP_ENTRY_POINT.toUpperCase().replace(
        "0X",
        "0x",
      ) as Address,
    });

    const result = await validateOnChainParticipantKeys({
      ...readers,
      vaultProviderEthAddress: VP_ETH_ADDRESS,
      applicationEntryPoint: APP_ENTRY_POINT,
      expectedVaultProviderBtcPubkey: VP_KEY,
      expectedVaultKeeperBtcPubkeys: [KEEPER_1, KEEPER_2],
      expectedUniversalChallengerBtcPubkeys: [CHALLENGER_1, CHALLENGER_2],
      blockNumber: TEST_BLOCK,
    });

    expect(result.expectedAppVaultKeepersVersion).toBe(KEEPERS_VERSION);
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
      blockNumber: TEST_BLOCK,
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
      blockNumber: TEST_BLOCK,
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
      blockNumber: TEST_BLOCK,
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
        getVaultProviderApplication: vi
          .fn()
          .mockResolvedValue(ADDRESSES.applicationEntryPoint),
      } as VaultRegistryReader,
      vaultKeeperReader: {
        getVaultKeepersByVersion: vi.fn().mockResolvedValue(query.vaultKeepers),
        getCurrentVaultKeepers: vi.fn(),
        getCurrentVaultKeepersVersion: vi.fn().mockResolvedValue(3),
        getCurrentAppKeeperKeyEpoch: vi.fn().mockResolvedValue(2n),
      } as VaultKeeperReader,
      universalChallengerReader: {
        getUniversalChallengersByVersion: vi
          .fn()
          .mockResolvedValue(query.universalChallengers),
        getCurrentUniversalChallengers: vi.fn(),
        getLatestUniversalChallengersVersion: vi.fn().mockResolvedValue(5),
        getCurrentUcKeyEpoch: vi.fn().mockResolvedValue(4n),
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
      blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
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
        blockNumber: TEST_BLOCK,
      }),
    ).rejects.toThrow(/Vault provider BTC pubkey/);
  });
});
