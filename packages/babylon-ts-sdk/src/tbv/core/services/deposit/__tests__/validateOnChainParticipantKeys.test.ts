import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AddressBTCKeyPair,
  OnChainBtcPubkey,
  UniversalChallengerReader,
  VaultKeeperReader,
  VaultRegistryReader,
} from "../../../clients/eth/types";
import { validateOnChainParticipantKeys } from "../validateOnChainParticipantKeys";

const VP_KEY = "a".repeat(64);
const VP_KEY_COMPRESSED = `02${VP_KEY}`;
const VP_KEY_UPPERCASE = "A".repeat(64);
const VP_KEY_DIFFERENT = "b".repeat(64);

const KEEPER_1 = "1".repeat(64);
const KEEPER_2 = "2".repeat(64);
const KEEPER_3 = "3".repeat(64);
const KEEPER_OTHER = "9".repeat(64);

const CHALLENGER_1 = "4".repeat(64);
const CHALLENGER_2 = "5".repeat(64);
const CHALLENGER_OTHER = "8".repeat(64);

const APP_ENTRY_POINT = "0xApp" as Address;
const VP_ETH_ADDRESS = "0xVP" as Address;

const KEEPERS_VERSION = 7;
const CHALLENGERS_VERSION = 11;

function pair(btcPubKey: string): AddressBTCKeyPair {
  return { ethAddress: "0x0" as Address, btcPubKey: btcPubKey as `0x${string}` };
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
    getVaultProviderBtcPubKey: vi
      .fn()
      .mockResolvedValue(vpKey.toLowerCase() as OnChainBtcPubkey),
    getPegInFee: vi.fn(),
    getOffchainParamsVersionsByVaultIds: vi.fn(),
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
  return { vaultRegistryReader, vaultKeeperReader, universalChallengerReader };
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
      readers.vaultRegistryReader.getVaultProviderBtcPubKey as ReturnType<
        typeof vi.fn
      >
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
    const readers = buildReaders({ keeperKeys: [KEEPER_1, KEEPER_2, KEEPER_3] });

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
