import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../../clients/graphql/client";
import {
  fetchVaultById,
  fetchVaultIdsByDepositor,
  fetchVaultRefundData,
  fetchVaultsByDepositor,
} from "../fetchVaults";

vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedRequest = vi.mocked(graphqlClient.request);
const mockedLoggerError = vi.mocked(logger.error);

const VALID_VAULT_ID = "0x" + "ab".repeat(32);
const VALID_ETH_ADDRESS = "0x" + "dd".repeat(20);
const VALID_HEX_64 = "0x" + "cc".repeat(32);
const VALID_HEX_SHORT = "0x" + "ee".repeat(16);

function makeGraphQLVaultItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: VALID_VAULT_ID,
    depositor: VALID_ETH_ADDRESS,
    depositorBtcPubKey: VALID_HEX_64,
    vaultProvider: VALID_ETH_ADDRESS,
    amount: "100000",
    applicationEntryPoint: VALID_ETH_ADDRESS,
    status: "pending",
    inUse: false,
    ackCount: 0,
    depositorSignedPeginTx: VALID_HEX_SHORT,
    unsignedPrePeginTx: VALID_HEX_SHORT,
    peginTxHash: VALID_HEX_64,
    hashlock: "0x" + "00".repeat(32),
    htlcVout: 0,
    secret: null,
    peginSigsPostedAt: null,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    currentOwner: null,
    referralCode: 0,
    depositorPayoutBtcAddress: VALID_HEX_SHORT,
    depositorWotsPkHash: "0x" + "ab".repeat(32),
    btcPopSignature: null,
    pendingAt: "1700000000",
    verifiedAt: null,
    activatedAt: null,
    expiredAt: null,
    expirationReason: null,
    blockNumber: "100",
    transactionHash: "0x" + "ff".repeat(32),
    ...overrides,
  };
}

function makeVaultsPage(
  items: Record<string, unknown>[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
) {
  return { vaults: { items, pageInfo } };
}

describe("fetchVaults", () => {
  afterEach(() => vi.clearAllMocks());

  describe("fetchVaultsByDepositor", () => {
    it("skips vault and logs error when depositorWotsPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([makeGraphQLVaultItem({ depositorWotsPkHash: null })]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(0);
      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("depositorWotsPkHash"),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({ vaultId: VALID_VAULT_ID }),
        }),
      );
    });

    it("returns vaults when depositorWotsPkHash is present", async () => {
      const hash = "0x" + "ab".repeat(32);
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([makeGraphQLVaultItem({ depositorWotsPkHash: hash })]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].depositorWotsPkHash).toBe(hash);
    });

    it("maps peginTxHash and new optional fields correctly", async () => {
      const peginHash = "0x" + "aa".repeat(32);
      const popSig = "0x" + "cc".repeat(32);
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([
          makeGraphQLVaultItem({
            peginTxHash: peginHash,
            btcPopSignature: popSig,
          }),
        ]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].peginTxHash).toBe(peginHash);
      expect(vaults[0].btcPopSignature).toBe(popSig);
    });

    it("normalizes null optional fields to undefined", async () => {
      // Base fixture has btcPopSignature: null
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([makeGraphQLVaultItem()]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].btcPopSignature).toBeUndefined();
    });

    it("normalizes zero-hash and empty-bytes optional fields to undefined", async () => {
      const zeroHash =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([
          makeGraphQLVaultItem({
            btcPopSignature: "0x",
            hashlock: zeroHash,
          }),
        ]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(1);
      expect(vaults[0].btcPopSignature).toBeUndefined();
      expect(vaults[0].hashlock).toBeUndefined();
    });

    it("skips vault and logs error when peginTxHash is null", async () => {
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([makeGraphQLVaultItem({ peginTxHash: null })]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(0);
      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("peginTxHash"),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({ vaultId: VALID_VAULT_ID }),
        }),
      );
    });

    it("skips vaults with unknown GraphQL status and returns valid ones", async () => {
      const id1 = "0x" + "11".repeat(32);
      const id2 = "0x" + "22".repeat(32);
      const id3 = "0x" + "33".repeat(32);
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([
          makeGraphQLVaultItem({ id: id1, status: "pending" }),
          makeGraphQLVaultItem({ id: id2, status: "bogus_status" }),
          makeGraphQLVaultItem({ id: id3, status: "available" }),
        ]),
      );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(2);
      expect(vaults[0].id).toBe(id1);
      expect(vaults[1].id).toBe(id3);
    });

    it("logs error to Sentry when vault has unknown status", async () => {
      const badId = "0x" + "ba".repeat(32);
      mockedRequest.mockResolvedValueOnce(
        makeVaultsPage([
          makeGraphQLVaultItem({ id: badId, status: "bogus_status" }),
        ]),
      );

      await fetchVaultsByDepositor("0xdepositor" as `0x${string}`);

      expect(mockedLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'Unknown GraphQL vault status "bogus_status"',
          ),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({
            vaultId: badId,
            component: "fetchVaults",
          }),
          data: expect.objectContaining({ rawStatus: "bogus_status" }),
        }),
      );
    });

    it("walks cursor pagination and returns vaults from every page", async () => {
      const firstId = "0x" + "11".repeat(32);
      const secondId = "0x" + "22".repeat(32);
      mockedRequest
        .mockResolvedValueOnce(
          makeVaultsPage([makeGraphQLVaultItem({ id: firstId })], {
            hasNextPage: true,
            endCursor: "cursor-1",
          }),
        )
        .mockResolvedValueOnce(
          makeVaultsPage([makeGraphQLVaultItem({ id: secondId })]),
        );

      const vaults = await fetchVaultsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(vaults).toHaveLength(2);
      expect(vaults[0].id).toBe(firstId);
      expect(vaults[1].id).toBe(secondId);
      expect(mockedRequest).toHaveBeenCalledTimes(2);
      expect(mockedRequest).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ after: "cursor-1" }),
      );
    });
  });

  describe("fetchVaultById", () => {
    it("throws when peginTxHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ peginTxHash: null }),
      });

      await expect(
        fetchVaultById(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(
        `Missing required field "peginTxHash" for vault ${VALID_VAULT_ID}`,
      );
    });

    it("throws when depositorWotsPkHash is null", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorWotsPkHash: null }),
      });

      await expect(
        fetchVaultById(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(
        `Missing required field "depositorWotsPkHash" for vault ${VALID_VAULT_ID}`,
      );
    });

    it("returns vault when depositorWotsPkHash is present", async () => {
      const hash = "0x" + "ab".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorWotsPkHash: hash }),
      });

      const vault = await fetchVaultById(VALID_VAULT_ID as `0x${string}`);

      expect(vault).not.toBeNull();
      expect(vault!.depositorWotsPkHash).toBe(hash);
    });

    it("returns null when vault is not found", async () => {
      mockedRequest.mockResolvedValueOnce({ vault: null });

      const result = await fetchVaultById(VALID_VAULT_ID as `0x${string}`);
      expect(result).toBeNull();
    });

    it("throws when vault has unknown GraphQL status", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ status: "some_future_status" }),
      });

      await expect(
        fetchVaultById(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow('Unknown GraphQL vault status "some_future_status"');
    });

    it("throws when depositorBtcPubKey has invalid hex format", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositorBtcPubKey: "not-hex" }),
      });

      await expect(
        fetchVaultById(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(/Invalid BTC public key.*depositorBtcPubKey/);
    });

    it("throws when depositor has invalid address format", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ depositor: "0xshort" }),
      });

      await expect(
        fetchVaultById(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(/Invalid address.*depositor/);
    });

    it("throws when vaultProvider has invalid address format", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: makeGraphQLVaultItem({ vaultProvider: "bad-address" }),
      });

      await expect(
        fetchVaultById(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(/Invalid address.*vaultProvider/);
    });
  });

  describe("fetchVaultRefundData", () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it("returns the minimal refund-needed fields, mapping to typed output", async () => {
      const btcPub = "0x" + "aa".repeat(32);
      const preTx = "0x" + "bb".repeat(16);
      mockedRequest.mockResolvedValueOnce({
        vault: {
          id: VALID_VAULT_ID,
          depositorBtcPubKey: btcPub,
          unsignedPrePeginTx: preTx,
        },
      });

      const uppercaseId = VALID_VAULT_ID.toUpperCase().replace(
        "0X",
        "0x",
      ) as `0x${string}`;
      const result = await fetchVaultRefundData(uppercaseId);

      expect(result).toEqual({
        depositorBtcPubkey: btcPub,
        unsignedPrePeginTx: preTx,
      });
      expect(mockedRequest).toHaveBeenCalledOnce();
      expect(mockedRequest).toHaveBeenCalledWith(expect.anything(), {
        id: VALID_VAULT_ID,
      });
    });

    it("returns null when the vault does not exist", async () => {
      mockedRequest.mockResolvedValueOnce({ vault: null });

      const result = await fetchVaultRefundData("0xnotfound" as `0x${string}`);

      expect(result).toBeNull();
    });

    it("throws when unsignedPrePeginTx is missing — refund cannot be built without it", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: {
          id: VALID_VAULT_ID,
          depositorBtcPubKey: VALID_HEX_64,
          amount: "150000",
          unsignedPrePeginTx: null,
        },
      });

      await expect(
        fetchVaultRefundData(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(
        new RegExp(
          `Vault ${VALID_VAULT_ID} is missing unsignedPrePeginTx; cannot build refund`,
        ),
      );
    });

    it("throws when depositorBtcPubKey has invalid hex format", async () => {
      mockedRequest.mockResolvedValueOnce({
        vault: {
          id: VALID_VAULT_ID,
          depositorBtcPubKey: "not-valid-hex",
          amount: "150000",
          unsignedPrePeginTx: VALID_HEX_SHORT,
        },
      });

      await expect(
        fetchVaultRefundData(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow(/Invalid BTC public key.*depositorBtcPubKey/);
    });

    it("propagates GraphQL request errors unchanged", async () => {
      mockedRequest.mockRejectedValueOnce(new Error("indexer unavailable"));

      await expect(
        fetchVaultRefundData(VALID_VAULT_ID as `0x${string}`),
      ).rejects.toThrow("indexer unavailable");
    });
  });

  describe("fetchVaultIdsByDepositor", () => {
    // The lean enumerator must NOT drop rows on transform failures of
    // unrelated fields (e.g. a transient null depositorWotsPkHash on a
    // sibling vault) — refund's sibling discovery depends on a
    // complete vault-id list for the depositor.
    it("returns ids for every vault row regardless of unrelated indexer fields", async () => {
      // Three vault rows: one well-formed, one with a null
      // depositorWotsPkHash (which `fetchVaultsByDepositor` would
      // drop), and one with a null hashlock. Lean enumerator must
      // surface all three.
      const SIBLING_ID = "0x" + "11".repeat(32);
      const OTHER_ID = "0x" + "22".repeat(32);
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [{ id: VALID_VAULT_ID }, { id: SIBLING_ID }, { id: OTHER_ID }],
          totalCount: 3,
        },
      });

      const ids = await fetchVaultIdsByDepositor(
        "0xdepositor" as `0x${string}`,
      );

      expect(ids).toEqual([VALID_VAULT_ID, SIBLING_ID, OTHER_ID]);
    });

    it("lower-cases the depositor address in the GraphQL variable", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: { items: [], totalCount: 0 },
      });

      await fetchVaultIdsByDepositor(
        "0xAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAbAb" as `0x${string}`,
      );

      expect(mockedRequest).toHaveBeenCalledWith(expect.anything(), {
        depositor: "0xabababababababababababababababababababab",
      });
    });

    it("throws if a returned id is malformed hex", async () => {
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [{ id: "not-a-hex-id" }],
          totalCount: 1,
        },
      });

      await expect(
        fetchVaultIdsByDepositor("0xdepositor" as `0x${string}`),
      ).rejects.toThrow(/Malformed hex/);
    });

    it("throws when the response is page-cap truncated (items.length < totalCount)", async () => {
      // Indexer page caps would silently drop tail siblings of a batched
      // Pre-PegIn. Refund's sibling discovery must fail closed instead of
      // signing against an incomplete batch.
      mockedRequest.mockResolvedValueOnce({
        vaults: {
          items: [
            { id: "0x" + "11".repeat(32) },
            { id: "0x" + "22".repeat(32) },
          ],
          totalCount: 5,
        },
      });

      await expect(
        fetchVaultIdsByDepositor("0xdepositor" as `0x${string}`),
      ).rejects.toThrow(/truncated by a page-size cap/);
    });
  });
});
