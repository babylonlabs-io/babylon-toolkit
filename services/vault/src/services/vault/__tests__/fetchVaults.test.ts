import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../../clients/graphql/client";
import { fetchVaultById, fetchVaultsByDepositor } from "../fetchVaults";

vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: {
    error: vi.fn(),
  },
}));

const mockedRequest = vi.mocked(graphqlClient.request);
const mockedLoggerError = vi.mocked(logger.error);

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
  afterEach(() => vi.clearAllMocks());

  describe("fetchVaultsByDepositor", () => {
    it("skips vault and logs error when depositorLamportPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem({ depositorLamportPkHash: null })],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(0);
      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("depositorLamportPkHash"),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({ vaultId: "0xabc123" }),
        }),
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

    it("skips vaults with unknown GraphQL status and returns valid ones", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [
            makeGraphQLVaultItem({ id: "0x1", status: "pending" }),
            makeGraphQLVaultItem({ id: "0x2", status: "bogus_status" }),
            makeGraphQLVaultItem({ id: "0x3", status: "available" }),
          ],
          totalCount: 3,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(2);
      expect(vaults[0].id).toBe("0x1");
      expect(vaults[1].id).toBe("0x3");
    });

    it("logs error to Sentry when vault has unknown status", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [
            makeGraphQLVaultItem({ id: "0xbad", status: "bogus_status" }),
          ],
          totalCount: 1,
        },
      });

      await fetchVaultsByDepositor("0xdepositor" as `0x${string}`);

      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'Unknown GraphQL vault status "bogus_status"',
          ),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({
            vaultId: "0xbad",
            component: "fetchVaults",
          }),
          data: expect.objectContaining({ rawStatus: "bogus_status" }),
        }),
      );
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

    it("throws when vault has unknown GraphQL status", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ status: "some_future_status" }),
      });

      await expect(fetchVaultById("0xabc123" as `0x${string}`)).rejects.toThrow(
        'Unknown GraphQL vault status "some_future_status"',
      );
    });
  });
});
