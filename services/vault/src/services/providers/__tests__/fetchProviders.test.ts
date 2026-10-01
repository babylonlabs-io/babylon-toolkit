import { beforeEach, describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import {
  fetchAppProviderMetadata,
  fetchAppProviders,
  getLatestVersionKeepers,
} from "../fetchProviders";
import { MAX_ROSTER_PAGES } from "../rosterPagination";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

const mockLoggerEvent = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), event: mockLoggerEvent },
}));

const mockRequest = vi.mocked(graphqlClient.request);

// Valid test addresses and keys
const VALID_ETH_ADDR_1 = "0x" + "a".repeat(40);
const VALID_ETH_ADDR_2 = "0x" + "b".repeat(40);
const VALID_ETH_ADDR_3 = "0x" + "c".repeat(40);
const VALID_BTC_PUBKEY_1 = "0x" + "d".repeat(66);
const VALID_BTC_PUBKEY_2 = "0x" + "e".repeat(66);
const VALID_BTC_PUBKEY_3 = "0x" + "f".repeat(66);
const COMPLETE_PAGE_INFO = { hasNextPage: false, endCursor: null };

function keeperPage<T>(items: T[]) {
  return { items, pageInfo: COMPLETE_PAGE_INFO };
}

describe("fetchProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAppProviders", () => {
    it("emits onboarding.providers.empty when the indexer knows providers but every row is dropped", async () => {
      mockLoggerEvent.mockClear();
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            // Dropped by validation (malformed BTC public key).
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: "not-a-public-key",
              name: "a",
              rpcUrl: null,
              metadataStatus: "missing",
              metadataRejectionReason: null,
            },
            // Dropped by validation (malformed id).
            {
              id: "not-an-address",
              btcPubKey: VALID_BTC_PUBKEY_2,
              name: "b",
              rpcUrl: "https://vp.example",
              metadataStatus: null,
              metadataRejectionReason: null,
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders(VALID_ETH_ADDR_3);

      expect(result.vaultProviders).toEqual([]);
      expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
      const [name, ctx] = mockLoggerEvent.mock.calls[0];
      expect(name).toBe("onboarding.providers.empty");
      expect(ctx.tags.reason).toBe("all_rows_invalid");
      expect(ctx.total).toBe(2);
      expect(ctx.applicationId).toBe("0xcc...cccc");
    });

    it("does not re-emit onboarding.providers.empty on repeated fetches for the same application", async () => {
      mockLoggerEvent.mockClear();
      // Fresh address: the once-per-application gate is module-scoped and
      // survives across tests in this file.
      const appAddress = "0x" + "1".repeat(40);
      const allInvalidResponse = {
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: "not-a-public-key",
              name: "a",
              rpcUrl: null,
              metadataStatus: "missing",
              metadataRejectionReason: null,
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      };
      mockRequest.mockResolvedValueOnce(allInvalidResponse);
      mockRequest.mockResolvedValueOnce(allInvalidResponse);

      await fetchAppProviders(appAddress);
      await fetchAppProviders(appAddress);

      expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    });

    it("treats checksummed and lowercase forms of one application as the same for the emit gate", async () => {
      mockLoggerEvent.mockClear();
      const appAddress = "0x" + "Ab".repeat(20);
      const allInvalidResponse = {
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: "not-a-public-key",
              name: "a",
              rpcUrl: null,
              metadataStatus: "missing",
              metadataRejectionReason: null,
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      };
      mockRequest.mockResolvedValueOnce(allInvalidResponse);
      mockRequest.mockResolvedValueOnce(allInvalidResponse);

      await fetchAppProviders(appAddress);
      await fetchAppProviders(appAddress.toLowerCase());

      expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    });

    it("does not emit onboarding.providers.empty when a provider survives filtering", async () => {
      mockLoggerEvent.mockClear();
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "a",
              rpcUrl: "https://vp.example",
              metadataStatus: null,
              metadataRejectionReason: null,
            },
            {
              id: VALID_ETH_ADDR_2,
              btcPubKey: VALID_BTC_PUBKEY_2,
              name: "b",
              rpcUrl: null,
              metadataStatus: "missing",
              metadataRejectionReason: null,
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders(VALID_ETH_ADDR_3);

      expect(result.vaultProviders).toHaveLength(2);
      expect(mockLoggerEvent).not.toHaveBeenCalled();
    });

    it("should return raw keeper items and pre-computed latest keepers", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: [
            {
              vaultKeeper: VALID_ETH_ADDR_1,
              version: 1,
              vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_1 },
            },
            {
              vaultKeeper: VALID_ETH_ADDR_1,
              version: 3,
              vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_1 },
            },
            {
              vaultKeeper: VALID_ETH_ADDR_2,
              version: 2,
              vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_2 },
            },
          ],
          pageInfo: COMPLETE_PAGE_INFO,
        },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultKeeperItems).toEqual([
        { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1, version: 1 },
        { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1, version: 3 },
        { id: VALID_ETH_ADDR_2, btcPubKey: VALID_BTC_PUBKEY_2, version: 2 },
      ]);

      // Pre-computed latest version keepers (version 3 only)
      expect(result.vaultKeepers).toEqual([
        { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1 },
      ]);
    });

    it("walks keeper pages and derives the latest version from the complete roster", async () => {
      const fullFirstPage = Array.from({ length: 1000 }, () => ({
        vaultKeeper: VALID_ETH_ADDR_1,
        version: 1,
        vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_1 },
      }));
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: fullFirstPage,
          pageInfo: { hasNextPage: true, endCursor: "keeper-cursor-1" },
        },
      });
      mockRequest.mockResolvedValueOnce({
        vaultKeeperApplications: keeperPage([
          {
            vaultKeeper: VALID_ETH_ADDR_2,
            version: 2,
            vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_2 },
          },
          {
            vaultKeeper: VALID_ETH_ADDR_3,
            version: 2,
            vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_3 },
          },
        ]),
      });

      const result = await fetchAppProviders("0xABCDEF");

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest).toHaveBeenLastCalledWith(expect.anything(), {
        appController: "0xabcdef",
        limit: 1000,
        after: "keeper-cursor-1",
      });
      expect(result.vaultKeeperItems).toHaveLength(1002);
      expect(result.vaultKeepers).toEqual([
        { id: VALID_ETH_ADDR_2, btcPubKey: VALID_BTC_PUBKEY_2 },
        { id: VALID_ETH_ADDR_3, btcPubKey: VALID_BTC_PUBKEY_3 },
      ]);
    });

    it("rejects an incomplete keeper roster when another page has no cursor", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: [],
          pageInfo: { hasNextPage: true, endCursor: null },
        },
      });

      const error = await fetchAppProviders("0xABCDEF").catch(
        (caught: unknown) => caught,
      );

      expect(error).toMatchObject({
        name: "IncompleteRosterError",
        retryable: false,
      });
      expect(String(error)).toMatch(
        /another vault keeper page without a cursor/,
      );
    });

    it.each([
      ["missing hasNextPage", { endCursor: null }],
      ["null pageInfo", null],
      ["wrong-typed hasNextPage", { hasNextPage: "false", endCursor: null }],
    ])("rejects malformed keeper pagination: %s", async (_name, pageInfo) => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: { items: [], pageInfo },
      });

      const error = await fetchAppProviders("0xABCDEF").catch(
        (caught: unknown) => caught,
      );

      expect(error).toMatchObject({
        name: "IncompleteRosterError",
        retryable: false,
      });
      expect(String(error)).toMatch(/malformed roster pagination metadata/);
    });

    it("rejects instead of returning a prefix after the keeper page limit", async () => {
      const continuingPage = {
        items: [],
        pageInfo: { hasNextPage: true, endCursor: "stuck-cursor" },
      };
      mockRequest.mockResolvedValue({
        vaultKeeperApplications: continuingPage,
      });
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: continuingPage,
      });

      const error = await fetchAppProviders("0xABCDEF").catch(
        (caught: unknown) => caught,
      );

      expect(mockRequest).toHaveBeenCalledTimes(MAX_ROSTER_PAGES);
      expect(error).toMatchObject({
        name: "IncompleteRosterError",
        retryable: false,
      });
      expect(String(error)).toMatch(/roster exceeds/);
    });

    it("fetches provider metadata without selecting the keeper roster", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "provider-1",
              rpcUrl: "https://rpc.example.com",
              metadataStatus: "ok",
              metadataRejectionReason: null,
            },
          ],
        },
      });

      const result = await fetchAppProviderMetadata("0xABCDEF");

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const [document, variables] = mockRequest.mock.calls[0] as unknown as [
        unknown,
        unknown,
      ];
      expect(String(document)).toContain("query GetAppProviderMetadata");
      expect(String(document)).not.toContain("vaultKeeperApplications");
      expect(variables).toEqual({ appController: "0xabcdef" });
      expect(result.vaultProviders).toHaveLength(1);
      expect(result.vaultKeepers).toEqual([]);
    });

    it("should return empty keeper items when no keeper items exist", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultKeeperItems).toEqual([]);
      expect(result.vaultKeepers).toEqual([]);
    });

    it("keeps providers with a null rpcUrl and preserves missing metadata status", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "provider-1",
              rpcUrl: "https://rpc.example.com",
            },
            {
              id: VALID_ETH_ADDR_2,
              btcPubKey: VALID_BTC_PUBKEY_2,
              name: "provider-2",
              rpcUrl: null,
              metadataStatus: "missing",
              metadataRejectionReason: "rpcUrl is missing",
            },
            {
              id: VALID_ETH_ADDR_3,
              btcPubKey: VALID_BTC_PUBKEY_3,
              name: null,
              rpcUrl: "https://rpc3.example.com",
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_1,
          btcPubKey: VALID_BTC_PUBKEY_1,
          name: "provider-1",
          url: "https://rpc.example.com",
          metadataStatus: "ok",
        },
        {
          id: VALID_ETH_ADDR_2,
          btcPubKey: VALID_BTC_PUBKEY_2,
          name: "provider-2",
          url: undefined,
          metadataStatus: "missing",
          metadataRejectionReason: "rpcUrl is missing",
        },
        {
          id: VALID_ETH_ADDR_3,
          btcPubKey: VALID_BTC_PUBKEY_3,
          name: undefined,
          url: "https://rpc3.example.com",
          metadataStatus: "ok",
        },
      ]);
    });

    it("should lowercase the application controller address", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: keeperPage([]),
      });

      await fetchAppProviders("0xABCDEF");

      expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
        appController: "0xabcdef",
        limit: 1000,
      });
    });

    it("should filter out providers with invalid id", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: "not-an-address",
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "bad-provider",
              rpcUrl: "https://rpc.example.com",
            },
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "good-provider",
              rpcUrl: "https://rpc.example.com",
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_1,
          btcPubKey: VALID_BTC_PUBKEY_1,
          name: "good-provider",
          url: "https://rpc.example.com",
          metadataStatus: "ok",
        },
      ]);
    });

    it("should filter out providers with invalid btcPubKey", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: "0xinvalid",
              name: "bad-pubkey-provider",
              rpcUrl: "https://rpc.example.com",
            },
            {
              id: VALID_ETH_ADDR_2,
              btcPubKey: VALID_BTC_PUBKEY_2,
              name: "good-provider",
              rpcUrl: "https://rpc.example.com",
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_2,
          btcPubKey: VALID_BTC_PUBKEY_2,
          name: "good-provider",
          url: "https://rpc.example.com",
          metadataStatus: "ok",
        },
      ]);
    });

    it("preserves metadataStatus and metadataRejectionReason from indexer", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "ok-provider",
              rpcUrl: "https://rpc.example.com",
              metadataStatus: "ok",
              metadataRejectionReason: null,
            },
            {
              id: VALID_ETH_ADDR_2,
              btcPubKey: VALID_BTC_PUBKEY_2,
              name: "private-host-provider",
              rpcUrl: "http://10.0.0.1",
              metadataStatus: "private_host",
              metadataRejectionReason:
                "host is a private/loopback/link-local IP: 10.0.0.1",
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_1,
          btcPubKey: VALID_BTC_PUBKEY_1,
          name: "ok-provider",
          url: "https://rpc.example.com",
          metadataStatus: "ok",
        },
        {
          id: VALID_ETH_ADDR_2,
          btcPubKey: VALID_BTC_PUBKEY_2,
          name: "private-host-provider",
          url: "http://10.0.0.1",
          metadataStatus: "private_host",
          metadataRejectionReason:
            "host is a private/loopback/link-local IP: 10.0.0.1",
        },
      ]);
    });

    it("falls back to metadataStatus 'ok' on null/unknown indexer values", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: VALID_ETH_ADDR_1,
              btcPubKey: VALID_BTC_PUBKEY_1,
              name: "legacy-provider",
              rpcUrl: "https://rpc.example.com",
              metadataStatus: null,
              metadataRejectionReason: null,
            },
            {
              id: VALID_ETH_ADDR_2,
              btcPubKey: VALID_BTC_PUBKEY_2,
              name: "future-provider",
              rpcUrl: "https://rpc.example.com",
              metadataStatus: "some_future_status",
              metadataRejectionReason: null,
            },
          ],
        },
        vaultKeeperApplications: keeperPage([]),
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders.map((p) => p.metadataStatus)).toEqual([
        "ok",
        "ok",
      ]);
    });

    it("rejects keeper items with an invalid vaultKeeper id", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: [
            {
              vaultKeeper: "bad-address",
              version: 1,
              vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_1 },
            },
            {
              vaultKeeper: VALID_ETH_ADDR_1,
              version: 1,
              vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_1 },
            },
          ],
          pageInfo: COMPLETE_PAGE_INFO,
        },
      });

      await expect(fetchAppProviders("0xAppController")).rejects.toMatchObject({
        name: "IncompleteRosterError",
        retryable: false,
      });
    });

    it("rejects keeper items with an invalid btcPubKey", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: [
            {
              vaultKeeper: VALID_ETH_ADDR_1,
              version: 1,
              vaultKeeperInfo: { btcPubKey: "0xshort" },
            },
            {
              vaultKeeper: VALID_ETH_ADDR_2,
              version: 1,
              vaultKeeperInfo: { btcPubKey: VALID_BTC_PUBKEY_2 },
            },
          ],
          pageInfo: COMPLETE_PAGE_INFO,
        },
      });

      await expect(fetchAppProviders("0xAppController")).rejects.toMatchObject({
        name: "IncompleteRosterError",
        retryable: false,
      });
    });

    it("rejects a malformed keeper on a continuation page", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: [],
          pageInfo: { hasNextPage: true, endCursor: "next" },
        },
      });
      mockRequest.mockResolvedValueOnce({
        vaultKeeperApplications: keeperPage([
          {
            vaultKeeper: VALID_ETH_ADDR_1,
            version: 2,
            vaultKeeperInfo: null,
          },
        ]),
      });

      const error = await fetchAppProviders("0xAppController").catch(
        (caught: unknown) => caught,
      );

      expect(error).toMatchObject({
        name: "IncompleteRosterError",
        retryable: false,
      });
      expect(String(error)).toMatch(/malformed roster item at index 0/);
    });
  });

  describe("getLatestVersionKeepers", () => {
    it("should filter to latest version only", () => {
      const items = [
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 1 },
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 3 },
        { id: "0xkeeper2", btcPubKey: "0xpubkey2", version: 2 },
        { id: "0xkeeper3", btcPubKey: "0xpubkey3", version: 1 },
        { id: "0xkeeper3", btcPubKey: "0xpubkey3", version: 3 },
      ];

      const result = getLatestVersionKeepers(items);

      expect(result).toEqual([
        { id: "0xkeeper1", btcPubKey: "0xpubkey1" },
        { id: "0xkeeper3", btcPubKey: "0xpubkey3" },
      ]);
    });

    it("should deduplicate keepers within the same version", () => {
      const items = [
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 2 },
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 2 },
      ];

      const result = getLatestVersionKeepers(items);

      expect(result).toEqual([{ id: "0xkeeper1", btcPubKey: "0xpubkey1" }]);
    });

    it("should return empty array for empty input", () => {
      expect(getLatestVersionKeepers([])).toEqual([]);
    });

    it("should return all keepers when only one version exists", () => {
      const items = [
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 1 },
        { id: "0xkeeper2", btcPubKey: "0xpubkey2", version: 1 },
      ];

      const result = getLatestVersionKeepers(items);

      expect(result).toEqual([
        { id: "0xkeeper1", btcPubKey: "0xpubkey1" },
        { id: "0xkeeper2", btcPubKey: "0xpubkey2" },
      ]);
    });
  });
});
