import { describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import {
  fetchAppProviders,
  fetchVaultKeepersByVersion,
  getLatestVersionKeepers,
} from "../fetchProviders";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

const mockRequest = vi.mocked(graphqlClient.request);

describe("fetchProviders", () => {
  describe("fetchAppProviders", () => {
    it("should return raw keeper items with version info", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: {
          items: [
            {
              vaultKeeper: "0xkeeper1",
              version: 1,
              vaultKeeperInfo: { btcPubKey: "0xpubkey1" },
            },
            {
              vaultKeeper: "0xkeeper1",
              version: 3,
              vaultKeeperInfo: { btcPubKey: "0xpubkey1" },
            },
            {
              vaultKeeper: "0xkeeper2",
              version: 2,
              vaultKeeperInfo: { btcPubKey: "0xpubkey2" },
            },
          ],
        },
      });

      const result = await fetchAppProviders("0xAppController");

      // All items returned with version info — no filtering
      expect(result.vaultKeeperItems).toEqual([
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 1 },
        { id: "0xkeeper1", btcPubKey: "0xpubkey1", version: 3 },
        { id: "0xkeeper2", btcPubKey: "0xpubkey2", version: 2 },
      ]);
    });

    it("should return empty keeper items when no keeper items exist", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: { items: [] },
        vaultKeeperApplications: { items: [] },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultKeeperItems).toEqual([]);
    });

    it("should filter providers without rpcUrl", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultProviders: {
          items: [
            {
              id: "0xprovider1",
              btcPubKey: "0xpk1",
              name: "provider-1",
              rpcUrl: "https://rpc.example.com",
            },
            {
              id: "0xprovider2",
              btcPubKey: "0xpk2",
              name: "provider-2",
              rpcUrl: null,
            },
          ],
        },
        vaultKeeperApplications: { items: [] },
      });

      const result = await fetchAppProviders("0xAppController");

      expect(result.vaultProviders).toEqual([
        {
          id: "0xprovider1",
          btcPubKey: "0xpk1",
          url: "https://rpc.example.com",
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

      // Only keepers from version 3: keeper1 and keeper3
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

  describe("fetchVaultKeepersByVersion", () => {
    it("should fetch keepers and map to VaultKeeper format", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultKeeperApplications: {
          items: [
            {
              vaultKeeper: "0xkeeper1",
              version: 1,
              vaultKeeperInfo: { btcPubKey: "0xpubkey1" },
            },
            {
              vaultKeeper: "0xkeeper2",
              version: 2,
              vaultKeeperInfo: { btcPubKey: "0xpubkey2" },
            },
          ],
        },
      });

      const result = await fetchVaultKeepersByVersion("0xAppController", 2);

      expect(result).toEqual([
        { id: "0xkeeper1", btcPubKey: "0xpubkey1" },
        { id: "0xkeeper2", btcPubKey: "0xpubkey2" },
      ]);
    });

    it("should pass correct variables to GraphQL query", async () => {
      mockRequest.mockResolvedValueOnce({
        vaultKeeperApplications: { items: [] },
      });

      await fetchVaultKeepersByVersion("0xABCDEF", 3);

      expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
        appController: "0xabcdef",
        keepersVersion: 3,
      });
    });
  });
});
