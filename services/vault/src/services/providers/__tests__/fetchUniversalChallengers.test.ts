import { describe, expect, it, vi } from "vitest";

import { graphqlClient } from "../../../clients/graphql";
import { fetchAllUniversalChallengers } from "../fetchUniversalChallengers";

vi.mock("../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

const mockRequest = vi.mocked(graphqlClient.request);

const VALID_ETH_ADDR_1 = "0x" + "a".repeat(40);
const VALID_ETH_ADDR_2 = "0x" + "b".repeat(40);
const VALID_BTC_PUBKEY_1 = "0x" + "d".repeat(64);
const VALID_BTC_PUBKEY_2 = "0x" + "e".repeat(64);

describe("fetchUniversalChallengers", () => {
  describe("fetchAllUniversalChallengers", () => {
    it("groups challengers by version and returns the latest version number", async () => {
      mockRequest.mockResolvedValueOnce({
        universalChallengerVersions: {
          items: [
            {
              version: 1,
              challengerInfo: { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1 },
            },
            {
              version: 2,
              challengerInfo: { id: VALID_ETH_ADDR_2, btcPubKey: VALID_BTC_PUBKEY_2 },
            },
            {
              version: 2,
              challengerInfo: { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1 },
            },
          ],
        },
      });

      const result = await fetchAllUniversalChallengers();

      expect(result.latestVersion).toBe(2);
      expect(result.byVersion.get(1)).toHaveLength(1);
      expect(result.byVersion.get(2)).toHaveLength(2);
      expect(result.byVersion.get(1)?.[0]).toEqual({
        id: VALID_ETH_ADDR_1,
        btcPubKey: VALID_BTC_PUBKEY_1,
      });
    });

    it("skips a challenger with an invalid ETH address and warns", async () => {
      mockRequest.mockResolvedValueOnce({
        universalChallengerVersions: {
          items: [
            {
              version: 1,
              challengerInfo: { id: "not-an-address", btcPubKey: VALID_BTC_PUBKEY_1 },
            },
            {
              version: 1,
              challengerInfo: { id: VALID_ETH_ADDR_1, btcPubKey: VALID_BTC_PUBKEY_1 },
            },
          ],
        },
      });

      const { logger } = await import("@/infrastructure");
      const result = await fetchAllUniversalChallengers();

      expect(result.byVersion.get(1)).toHaveLength(1);
      expect(result.byVersion.get(1)?.[0].id).toBe(VALID_ETH_ADDR_1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("invalid id"),
      );
    });

    it("skips a challenger with an invalid BTC pubkey and warns", async () => {
      mockRequest.mockResolvedValueOnce({
        universalChallengerVersions: {
          items: [
            {
              version: 1,
              challengerInfo: { id: VALID_ETH_ADDR_1, btcPubKey: "not-a-pubkey" },
            },
            {
              version: 1,
              challengerInfo: { id: VALID_ETH_ADDR_2, btcPubKey: VALID_BTC_PUBKEY_2 },
            },
          ],
        },
      });

      const { logger } = await import("@/infrastructure");
      const result = await fetchAllUniversalChallengers();

      expect(result.byVersion.get(1)).toHaveLength(1);
      expect(result.byVersion.get(1)?.[0].btcPubKey).toBe(VALID_BTC_PUBKEY_2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("invalid btcPubKey"),
      );
    });

    it("returns empty byVersion and latestVersion 0 when all items fail validation", async () => {
      mockRequest.mockResolvedValueOnce({
        universalChallengerVersions: {
          items: [
            { version: 1, challengerInfo: { id: "bad-addr", btcPubKey: "bad-key" } },
          ],
        },
      });

      const result = await fetchAllUniversalChallengers();

      expect(result.byVersion.size).toBe(0);
      expect(result.latestVersion).toBe(0);
    });

    it("returns empty byVersion and latestVersion 0 when items array is empty", async () => {
      mockRequest.mockResolvedValueOnce({
        universalChallengerVersions: { items: [] },
      });

      const result = await fetchAllUniversalChallengers();

      expect(result.byVersion.size).toBe(0);
      expect(result.latestVersion).toBe(0);
    });
  });
});
