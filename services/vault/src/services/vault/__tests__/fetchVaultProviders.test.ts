import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../../clients/graphql/client";
import {
  fetchVaultProviderById,
  fetchVaultProviders,
} from "../fetchVaultProviders";

vi.mock("../../../clients/graphql/client", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const mockedRequest = vi.mocked(graphqlClient.request);
const mockedLoggerWarn = vi.mocked(logger.warn);

const VALID_ETH_ADDRESS = "0x" + "ab".repeat(20);
const VALID_BTC_PUBKEY = "0x" + "cc".repeat(32);

function makeVaultProvider(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: VALID_ETH_ADDRESS,
    btcPubKey: VALID_BTC_PUBKEY,
    applicationEntryPoint: VALID_ETH_ADDRESS,
    name: "Test Provider",
    rpcUrl: "https://rpc.example.com",
    grpcUrl: null,
    registeredAt: "1700000000",
    blockNumber: "100",
    transactionHash: "0x" + "ff".repeat(32),
    ...overrides,
  };
}

describe("fetchVaultProviders", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns valid vault providers", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProviders: { items: [makeVaultProvider()] },
    });

    const providers = await fetchVaultProviders();

    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe(VALID_ETH_ADDRESS);
  });

  it("filters out provider with invalid id and logs warning", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProviders: {
        items: [makeVaultProvider({ id: "not-an-address" })],
      },
    });

    const providers = await fetchVaultProviders();

    expect(providers).toHaveLength(0);
    expect(mockedLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("invalid id"),
    );
  });

  it("filters out provider with invalid btcPubKey and logs warning", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProviders: {
        items: [makeVaultProvider({ btcPubKey: "not-hex" })],
      },
    });

    const providers = await fetchVaultProviders();

    expect(providers).toHaveLength(0);
    expect(mockedLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("invalid btcPubKey"),
    );
  });

  it("filters out provider with invalid applicationEntryPoint and logs warning", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProviders: {
        items: [makeVaultProvider({ applicationEntryPoint: "0xshort" })],
      },
    });

    const providers = await fetchVaultProviders();

    expect(providers).toHaveLength(0);
    expect(mockedLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("invalid applicationEntryPoint"),
    );
  });

  it("keeps valid providers and filters invalid ones", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProviders: {
        items: [
          makeVaultProvider({ id: VALID_ETH_ADDRESS }),
          makeVaultProvider({ id: "bad" }),
          makeVaultProvider({ id: "0x" + "dd".repeat(20) }),
        ],
      },
    });

    const providers = await fetchVaultProviders();

    expect(providers).toHaveLength(2);
    expect(providers[0].id).toBe(VALID_ETH_ADDRESS);
    expect(providers[1].id).toBe("0x" + "dd".repeat(20));
  });

  it("accepts compressed pubkey (66 hex chars after 0x)", async () => {
    const compressedPubkey = "0x" + "aa".repeat(33);
    mockedRequest.mockResolvedValueOnce({
      vaultProviders: {
        items: [makeVaultProvider({ btcPubKey: compressedPubkey })],
      },
    });

    const providers = await fetchVaultProviders();

    expect(providers).toHaveLength(1);
  });
});

describe("fetchVaultProviderById", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns null when provider is not found", async () => {
    mockedRequest.mockResolvedValueOnce({ vaultProvider: null });

    const result = await fetchVaultProviderById("0x" + "ab".repeat(20));
    expect(result).toBeNull();
  });

  it("returns null and warns when provider has invalid fields", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProvider: makeVaultProvider({ btcPubKey: "invalid" }),
    });

    const result = await fetchVaultProviderById("0x" + "ab".repeat(20));

    expect(result).toBeNull();
    expect(mockedLoggerWarn).toHaveBeenCalled();
  });

  it("returns validated provider", async () => {
    mockedRequest.mockResolvedValueOnce({
      vaultProvider: makeVaultProvider(),
    });

    const result = await fetchVaultProviderById("0x" + "ab".repeat(20));

    expect(result).not.toBeNull();
    expect(result!.id).toBe(VALID_ETH_ADDRESS);
  });
});
