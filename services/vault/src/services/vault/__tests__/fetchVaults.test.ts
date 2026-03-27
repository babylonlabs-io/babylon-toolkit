import { describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql/client";
import { fetchVaultById, fetchVaultsByDepositor } from "../fetchVaults";

vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

const mockedRequest = vi.mocked(graphqlClient.request);

function makeGraphQLVaultItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "0xabc123",
    depositor: "0xdepositor",
    depositorBtcPubKey: "0xbtcpub",
    vaultProvider: "0xprovider",
    amount: "100000",
    applicationEntryPoint: "0xcontroller",
    status: "pending",
    inUse: false,
    ackCount: 0,
    unsignedPegInTx: "0xtx",
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    currentOwner: null,
    referralCode: 0,
    depositorPayoutBtcAddress: "0xpayout",
    depositorLamportPkHash: "0x" + "ab".repeat(32),
    pendingAt: "1700000000",
    verifiedAt: null,
    activatedAt: null,
    expiredAt: null,
    expirationReason: null,
    blockNumber: "100",
    transactionHash: "0xtxhash",
    ...overrides,
  };
}

describe("fetchVaults", () => {
  describe("fetchVaultsByDepositor", () => {
    it("throws when depositorLamportPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem({ depositorLamportPkHash: null })],
          totalCount: 1,
        },
      });

      await expect(
        fetchVaultsByDepositor("0xdepositor" as `0x${string}`),
      ).rejects.toThrow(
        'Missing required field "depositorLamportPkHash" for vault 0xabc123',
      );
    });

    it("returns vaults when depositorLamportPkHash is present", async () => {
      const hash = "0x" + "ab".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem({ depositorLamportPkHash: hash })],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].depositorLamportPkHash).toBe(hash);
    });
  });

  describe("fetchVaultById", () => {
    it("throws when depositorLamportPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorLamportPkHash: null }),
      });

      await expect(fetchVaultById("0xabc123" as `0x${string}`)).rejects.toThrow(
        'Missing required field "depositorLamportPkHash" for vault 0xabc123',
      );
    });

    it("returns vault when depositorLamportPkHash is present", async () => {
      const hash = "0x" + "ab".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorLamportPkHash: hash }),
      });

      const vault = await fetchVaultById("0xabc123" as `0x${string}`);

      expect(vault).not.toBeNull();
      expect(vault!.depositorLamportPkHash).toBe(hash);
    });

    it("returns null when vault is not found", async () => {
      mockedRequest.mockResolvedValueOnce({ vault: null });

      const result = await fetchVaultById("0xnotfound" as `0x${string}`);
      expect(result).toBeNull();
    });
  });
});
