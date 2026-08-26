/**
 * Tests for getBtcVaultBasicInfoFromChain — the per-vault basic info
 * lookup used by the reorder integrity guard.
 */

import type { Address, Hex } from "viem";
import { zeroAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
  },
}));

const mockGetVaultBasicInfo = vi.fn();
const mockGetVaultData = vi.fn();
vi.mock("../../sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultBasicInfo: mockGetVaultBasicInfo,
    getVaultData: mockGetVaultData,
  }),
}));

import {
  getBtcVaultBasicInfoFromChain,
  getVaultFromChain,
  getVaultFromChainWithGrace,
} from "../query";

const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;
const DEPOSITOR = "0x000000000000000000000000000000000000beef" as Address;
const AAVE_ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;

function basicInfo(amount: bigint) {
  return {
    depositor: DEPOSITOR,
    depositorBtcPubKey: ("0x" + "0".repeat(64)) as Hex,
    amount,
    vaultProvider: ("0x" + "1".repeat(40)) as Address,
    status: 2,
    applicationEntryPoint: AAVE_ADAPTER,
    createdAt: 0n,
  };
}

describe("getBtcVaultBasicInfoFromChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns amount, status, and applicationEntryPoint keyed by lowercased vault ID", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (vaultId: Hex) => {
      if (vaultId === VAULT_A) return basicInfo(60_000_000n);
      if (vaultId === VAULT_B) return basicInfo(10_000_000n);
      throw new Error(`unexpected vault ${vaultId}`);
    });

    const result = await getBtcVaultBasicInfoFromChain([VAULT_A, VAULT_B]);

    expect(result.get(VAULT_A.toLowerCase() as Hex)).toEqual({
      amount: 60_000_000n,
      status: 2,
      applicationEntryPoint: AAVE_ADAPTER,
    });
    expect(result.get(VAULT_B.toLowerCase() as Hex)).toEqual({
      amount: 10_000_000n,
      status: 2,
      applicationEntryPoint: AAVE_ADAPTER,
    });
    expect(mockGetVaultBasicInfo).toHaveBeenCalledTimes(2);
    expect(mockGetVaultBasicInfo).toHaveBeenNthCalledWith(1, VAULT_A);
    expect(mockGetVaultBasicInfo).toHaveBeenNthCalledWith(2, VAULT_B);
  });

  it("returns an empty map and skips RPC when no vault IDs are supplied", async () => {
    const result = await getBtcVaultBasicInfoFromChain([]);

    expect(result.size).toBe(0);
    expect(mockGetVaultBasicInfo).not.toHaveBeenCalled();
  });

  it("throws when any returned vault has a zero depositor (unregistered)", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (vaultId: Hex) => {
      if (vaultId === VAULT_A) return basicInfo(60_000_000n);
      if (vaultId === VAULT_B) {
        return {
          ...basicInfo(0n),
          depositor: zeroAddress,
          applicationEntryPoint: zeroAddress,
          status: 0,
        };
      }
      throw new Error(`unexpected vault ${vaultId}`);
    });

    await expect(
      getBtcVaultBasicInfoFromChain([VAULT_A, VAULT_B]),
    ).rejects.toThrow(/not registered on-chain/);
  });
});

describe("getVaultFromChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function protocolInfo() {
    return {
      depositorSignedPeginTx: "0xdeadbeef" as Hex,
      universalChallengersVersion: 1n,
      appVaultKeepersVersion: 2n,
      offchainParamsVersion: 3n,
      vaultCoreVersion: 1,
      hashlock: ("0x" + "1".repeat(64)) as Hex,
      htlcVout: 0n,
      prePeginTxHash: ("0x" + "2".repeat(64)) as Hex,
    };
  }

  // Status is the load-bearing field for the broadcast precondition; if a
  // future refactor of the basic-info merge drops it, the broadcast gate
  // would fall back to `undefined` and pass every comparison.
  it("surfaces basic.status alongside protocol fields", async () => {
    mockGetVaultData.mockResolvedValue({
      basic: {
        ...basicInfo(60_000_000n),
        status: 4, // on-chain BTCVaultStatus.Expired
      },
      protocol: protocolInfo(),
    });

    const result = await getVaultFromChain(VAULT_A);

    expect(result.status).toBe(4);
    expect(result.amount).toBe(60_000_000n);
    expect(result.prePeginTxHash).toBe(("0x" + "2".repeat(64)) as Hex);
  });

  // `createdAt` is the ETH block the registration mined at; the Pre-PegIn
  // broadcast finality gate measures confirmation depth from it. Dropping it
  // in the basic+protocol merge would leave the gate comparing against
  // `undefined`.
  it("surfaces basic.createdAt as the registration block number", async () => {
    mockGetVaultData.mockResolvedValue({
      basic: { ...basicInfo(60_000_000n), createdAt: 21_000_000n },
      protocol: protocolInfo(),
    });

    const result = await getVaultFromChain(VAULT_A);

    expect(result.createdAt).toBe(21_000_000n);
  });

  it("surfaces the stamped vaultCoreVersion for resume flows", async () => {
    mockGetVaultData.mockResolvedValue({
      basic: basicInfo(60_000_000n),
      protocol: { ...protocolInfo(), vaultCoreVersion: 2 },
    });

    const result = await getVaultFromChain(VAULT_A);

    expect(result.vaultCoreVersion).toBe(2);
  });

  // A 0 means the vault predates the contract's vaultCoreVersion field (or
  // the read was mis-decoded) — signing with a guessed graph version must
  // never happen, so the mapper fails closed.
  it("throws when the on-chain vaultCoreVersion is 0", async () => {
    mockGetVaultData.mockResolvedValue({
      basic: basicInfo(60_000_000n),
      protocol: { ...protocolInfo(), vaultCoreVersion: 0 },
    });

    await expect(getVaultFromChain(VAULT_A)).rejects.toThrow(
      /Invalid vaultCoreVersion 0 from BTCVaultRegistry.getBtcVaultProtocolInfo/,
    );
  });
});

describe("getVaultFromChainWithGrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const emptyRecordError = () =>
    new Error(
      `Vault ${VAULT_A} not found on-chain or has no pegin transaction`,
    );

  // The #1835 race: a node that has not indexed the registration's block yet
  // answers with an empty record, then catches up moments later.
  it("retries an empty record and returns the vault once the node catches up", async () => {
    mockGetVaultData
      .mockRejectedValueOnce(emptyRecordError())
      .mockRejectedValueOnce(emptyRecordError())
      .mockResolvedValue({
        basic: basicInfo(60_000_000n),
        protocol: {
          depositorSignedPeginTx: "0xdeadbeef" as Hex,
          universalChallengersVersion: 1n,
          appVaultKeepersVersion: 2n,
          offchainParamsVersion: 3n,
          vaultCoreVersion: 1,
          hashlock: ("0x" + "1".repeat(64)) as Hex,
          htlcVout: 0n,
          prePeginTxHash: ("0x" + "2".repeat(64)) as Hex,
        },
      });

    const promise = getVaultFromChainWithGrace(VAULT_A);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ depositor: DEPOSITOR });
    expect(mockGetVaultData).toHaveBeenCalledTimes(3);
  });

  it("rethrows the empty-record error once the retry schedule is exhausted", async () => {
    mockGetVaultData.mockRejectedValue(emptyRecordError());

    const promise = getVaultFromChainWithGrace(VAULT_A);
    const assertion = expect(promise).rejects.toThrow("not found on-chain");
    await vi.runAllTimersAsync();
    await assertion;

    // Initial attempt plus one per backoff step; a longer schedule would
    // hold the resume button past a user's patience.
    expect(mockGetVaultData).toHaveBeenCalledTimes(5);
  });

  // Retrying a revert or a bad core version would only delay a real failure.
  it("does not retry errors other than the empty record", async () => {
    mockGetVaultData.mockRejectedValue(new Error("execution reverted"));

    await expect(getVaultFromChainWithGrace(VAULT_A)).rejects.toThrow(
      "execution reverted",
    );
    expect(mockGetVaultData).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the caller aborts mid-backoff", async () => {
    mockGetVaultData.mockRejectedValue(emptyRecordError());
    const controller = new AbortController();

    const promise = getVaultFromChainWithGrace(VAULT_A, controller.signal);
    const assertion = expect(promise).rejects.toBeDefined();
    controller.abort(new Error("unmounted"));
    await vi.runAllTimersAsync();
    await assertion;

    expect(mockGetVaultData).toHaveBeenCalledTimes(1);
  });
});
