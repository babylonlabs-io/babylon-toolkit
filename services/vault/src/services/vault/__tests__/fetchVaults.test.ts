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
    depositorSignedPeginTx: "0xtx",
    unsignedPrePeginTx: "0xpretx",
    peginTxHash: "0xpeginhash",
    hashlock: "0x" + "00".repeat(32),
    htlcVout: 0,
    secret: null,
    peginSigsPostedAt: null,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    currentOwner: null,
    referralCode: 0,
    depositorPayoutBtcAddress: "0xpayout",
    depositorWotsPkHash: "0x" + "ab".repeat(32),
    btcPopSignature: null,
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
    it("skips vault and logs error when depositorWotsPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem({ depositorWotsPkHash: null })],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(0);
      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("depositorWotsPkHash"),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({ vaultId: "0xabc123" }),
        }),
      );
    });

    it("returns vaults when depositorWotsPkHash is present", async () => {
      const hash = "0x" + "ab".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem({ depositorWotsPkHash: hash })],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].depositorWotsPkHash).toBe(hash);
    });

    it("maps peginTxHash and new optional fields correctly", async () => {
      const popSig = "0x" + "cc".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [
            makeGraphQLVaultItem({
              peginTxHash: "0xpegin123",
              btcPopSignature: popSig,
            }),
          ],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].peginTxHash).toBe("0xpegin123");
      expect(vaults[0].btcPopSignature).toBe(popSig);
    });

    it("normalizes null optional fields to undefined", async () => {
      // Base fixture has btcPopSignature: null
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem()],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].btcPopSignature).toBeUndefined();
    });

    it("normalizes zero-hash and empty-bytes optional fields to undefined", async () => {
      const zeroHash =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [
            makeGraphQLVaultItem({
              btcPopSignature: "0x",
              hashlock: zeroHash,
            }),
          ],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].btcPopSignature).toBeUndefined();
      expect(vaults[0].hashlock).toBeUndefined();
    });

    it("skips vault and logs error when peginTxHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [makeGraphQLVaultItem({ peginTxHash: null })],
          totalCount: 1,
        },
      });

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(0);
      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("peginTxHash"),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({ vaultId: "0xabc123" }),
        }),
      );
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
    it("throws when peginTxHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ peginTxHash: null }),
      });

      await expect(fetchVaultById("0xabc123" as `0x${string}`)).rejects.toThrow(
        'Missing required field "peginTxHash" for vault 0xabc123',
      );
    });

    it("throws when depositorWotsPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorWotsPkHash: null }),
      });

      await expect(fetchVaultById("0xabc123" as `0x${string}`)).rejects.toThrow(
        'Missing required field "depositorWotsPkHash" for vault 0xabc123',
      );
    });

    it("returns vault when depositorWotsPkHash is present", async () => {
      const hash = "0x" + "ab".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorWotsPkHash: hash }),
      });

      const vault = await fetchVaultById("0xabc123" as `0x${string}`);

      expect(vault).not.toBeNull();
      expect(vault!.depositorWotsPkHash).toBe(hash);
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
