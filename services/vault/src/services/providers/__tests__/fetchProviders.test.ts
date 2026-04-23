import { describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import { fetchAppProviders, getLatestVersionKeepers } from "../fetchProviders";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

const mockRequest = vi.mocked(graphqlClient.request);

// Valid test addresses and keys
const VALID_ETH_ADDR_1 = "0x" + "a".repeat(40);
const VALID_ETH_ADDR_2 = "0x" + "b".repeat(40);
const VALID_ETH_ADDR_3 = "0x" + "c".repeat(40);
const VALID_BTC_PUBKEY_1 = "0x" + "d".repeat(66);
const VALID_BTC_PUBKEY_2 = "0x" + "e".repeat(66);
const VALID_BTC_PUBKEY_3 = "0x" + "f".repeat(66);

describe("fetchProviders", () => {
  describe("fetchAppProviders", () => {
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

    it("should return empty keeper items when no keeper items exist", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: { items: [] },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultKeeperItems).toEqual([]);
      expect(result.vaultKeepers).toEqual([]);
    });

    it("should only return providers with rpcUrl", async () => {
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
            },
            {
              id: VALID_ETH_ADDR_3,
              btcPubKey: VALID_BTC_PUBKEY_3,
              name: null,
              rpcUrl: "https://rpc3.example.com",
            },
          ],
        },
        vaultKeeperApplications: { items: [] },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_1,
          btcPubKey: VALID_BTC_PUBKEY_1,
          name: "provider-1",
          url: "https://rpc.example.com",
        },
        {
          id: VALID_ETH_ADDR_3,
          btcPubKey: VALID_BTC_PUBKEY_3,
          name: undefined,
          url: "https://rpc3.example.com",
        },
      ]);
    });

    it("should lowercase the application controller address", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: { items: [] },
      });

      await fetchAppProviders("0xABCDEF");

      expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
        appController: "0xabcdef",
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
        vaultKeeperApplications: { items: [] },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_1,
          btcPubKey: VALID_BTC_PUBKEY_1,
          name: "good-provider",
          url: "https://rpc.example.com",
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
        vaultKeeperApplications: { items: [] },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: VALID_ETH_ADDR_2,
          btcPubKey: VALID_BTC_PUBKEY_2,
          name: "good-provider",
          url: "https://rpc.example.com",
        },
      ]);
    });

    it("should filter out keeper items with invalid vaultKeeper id", async () => {
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
        },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultKeeperItems).toEqual([
        { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1, version: 1 },
      ]);
    });

    it("should filter out keeper items with invalid btcPubKey", async () => {
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
        },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultKeeperItems).toEqual([
        { id: VALID_ETH_ADDR_2, btcPubKey: VALID_BTC_PUBKEY_2, version: 1 },
      ]);
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
