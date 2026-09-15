import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("../../clients/transaction", () => ({
  getCoreSpokeAddress: vi.fn(),
  getVaultBtcReserveId: vi.fn(),
}));

vi.mock("../../clients/spoke", () => ({
  getReservesBatch: vi.fn(),
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: vi.fn(),
}));

import { graphqlClient } from "../../../../clients/graphql";
import { getReservesBatch } from "../../clients/spoke";
import {
  getCoreSpokeAddress,
  getVaultBtcReserveId,
} from "../../clients/transaction";
import { getAaveAdapterAddress } from "../../config";
import { ReserveMismatchError } from "../assertReserveMatchesOnChain";
import { fetchAaveAppConfig } from "../fetchConfig";

const mockRequest = vi.mocked(graphqlClient.request);
const mockGetCoreSpokeAddress = vi.mocked(getCoreSpokeAddress);
const mockGetVaultBtcReserveId = vi.mocked(getVaultBtcReserveId);
const mockGetReservesBatch = vi.mocked(getReservesBatch);
const mockGetAaveAdapterAddress = vi.mocked(getAaveAdapterAddress);

const ENV_ADAPTER = "0x1111111111111111111111111111111111111111" as Address;
const INDEXER_ADAPTER = "0x2222222222222222222222222222222222222222" as Address;
const CORE_SPOKE = "0x3333333333333333333333333333333333333333" as Address;
const VAULT_BTC = "0x4444444444444444444444444444444444444444";
const BTC_VAULT_REGISTRY = "0x5555555555555555555555555555555555555555";
const VBTC_TOKEN = "0x6666666666666666666666666666666666666666" as Address;
const USDC_TOKEN = "0x7777777777777777777777777777777777777777" as Address;
const VBTC_HUB = "0x8888888888888888888888888888888888888888" as Address;
const USDC_HUB = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const OTHER_ADDRESS = "0x9999999999999999999999999999999999999999" as Address;

const ON_CHAIN_VBTC_RESERVE = {
  underlying: VBTC_TOKEN,
  hub: VBTC_HUB,
  assetId: 1,
  decimals: 8,
  collateralRisk: 0,
  flags: 0,
  dynamicConfigKey: 1,
};

const ON_CHAIN_USDC_RESERVE = {
  underlying: USDC_TOKEN,
  hub: USDC_HUB,
  assetId: 2,
  decimals: 6,
  collateralRisk: 0,
  flags: 4,
  dynamicConfigKey: 1,
};

function makeResponse(
  adapterAddress: Address = ENV_ADAPTER,
  vaultBtcReserveId = "1",
  usdcToken: { address: Address; decimals: number } = {
    address: USDC_TOKEN,
    decimals: 6,
  },
) {
  return {
    aaveConfig: {
      id: 1,
      adapterAddress,
      vaultBtcAddress: VAULT_BTC,
      btcVaultRegistryAddress: BTC_VAULT_REGISTRY,
      vaultBtcReserveId,
    },
    aaveReserves: {
      items: [
        {
          id: "1",
          underlying: VBTC_TOKEN,
          hub: VBTC_HUB,
          assetId: 1,
          decimals: 8,
          dynamicConfigKey: 1,
          paused: false,
          frozen: false,
          borrowable: false,
          collateralRisk: 0,
          collateralFactor: 8000,
          underlyingToken: {
            address: VBTC_TOKEN,
            symbol: "vBTC",
            name: "Vault BTC",
            decimals: 8,
          },
        },
        {
          id: "2",
          underlying: USDC_TOKEN,
          hub: USDC_HUB,
          assetId: 2,
          decimals: 6,
          dynamicConfigKey: 1,
          paused: false,
          frozen: false,
          borrowable: true,
          collateralRisk: 0,
          collateralFactor: 0,
          underlyingToken: {
            address: usdcToken.address,
            symbol: "USDC",
            name: "USD Coin",
            decimals: usdcToken.decimals,
          },
        },
      ],
    },
  };
}

describe("fetchAaveAppConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAaveAdapterAddress.mockReturnValue(ENV_ADAPTER);
    mockGetCoreSpokeAddress.mockResolvedValue(CORE_SPOKE);
    mockGetVaultBtcReserveId.mockResolvedValue(1n);
    mockGetReservesBatch.mockResolvedValue([
      ON_CHAIN_VBTC_RESERVE,
      ON_CHAIN_USDC_RESERVE,
    ]);
  });

  it("resolves the Core Spoke from the env-pinned adapter when the indexer agrees", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());

    const result = await fetchAaveAppConfig();

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledWith(ENV_ADAPTER);
    expect(result?.config.adapterAddress).toBe(ENV_ADAPTER);
    expect(result?.config.coreSpokeAddress).toBe(CORE_SPOKE);
    expect(result?.vbtcReserve?.reserveId).toBe(1n);
    expect(result?.borrowableReserves).toHaveLength(1);
    expect(result?.allBorrowReserves).toHaveLength(1);
  });

  it("accepts checksum/case differences between the indexer and env adapter", async () => {
    mockGetAaveAdapterAddress.mockReturnValue(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
    );
    mockRequest.mockResolvedValueOnce(
      makeResponse("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address),
    );

    await expect(fetchAaveAppConfig()).resolves.not.toThrow();

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    );
  });

  it("fails closed when the indexer adapter differs from the env-pinned adapter", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(INDEXER_ADAPTER));

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      `Aave adapter mismatch: indexer returned ${INDEXER_ADAPTER}, expected ${ENV_ADAPTER}`,
    );

    expect(mockGetCoreSpokeAddress).not.toHaveBeenCalled();
    expect(mockGetVaultBtcReserveId).not.toHaveBeenCalled();
  });

  it("returns null when the indexer has no Aave config", async () => {
    mockRequest.mockResolvedValueOnce({
      aaveConfig: null,
      aaveReserves: { items: [] },
    });

    await expect(fetchAaveAppConfig()).resolves.toBeNull();
    expect(mockGetCoreSpokeAddress).not.toHaveBeenCalled();
  });

  it("resolves the vBTC reserve ID on-chain when the indexer agrees", async () => {
    mockGetVaultBtcReserveId.mockResolvedValue(1n);
    mockRequest.mockResolvedValueOnce(makeResponse(ENV_ADAPTER, "1"));

    const result = await fetchAaveAppConfig();

    expect(mockGetVaultBtcReserveId).toHaveBeenCalledWith(ENV_ADAPTER);
    expect(result?.config.vaultBtcReserveId).toBe(1n);
    expect(result?.vbtcReserve?.reserveId).toBe(1n);
  });

  it("fails closed when the indexer reserve ID differs from the on-chain adapter", async () => {
    mockGetVaultBtcReserveId.mockResolvedValue(1n);
    mockRequest.mockResolvedValueOnce(makeResponse(ENV_ADAPTER, "2"));

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      "Aave vBTC reserve ID mismatch: indexer returned 2, expected 1",
    );
  });

  it("fails closed when the on-chain reserve ID read fails", async () => {
    mockGetVaultBtcReserveId.mockRejectedValueOnce(new Error("rpc down"));
    mockRequest.mockResolvedValueOnce(makeResponse());

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      `Failed to resolve vBTC reserve ID from adapter ${ENV_ADAPTER}`,
    );
  });

  it("proves every indexed reserve against the Core Spoke in one batch read", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());

    const result = await fetchAaveAppConfig();

    expect(mockGetReservesBatch).toHaveBeenCalledTimes(1);
    expect(mockGetReservesBatch).toHaveBeenCalledWith(CORE_SPOKE, [1n, 2n]);
    expect(result?.borrowableReserves[0]?.reserve.hub).toBe(USDC_HUB);
  });

  it("fails closed when the indexer reports a different underlying than the Core Spoke", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([
      ON_CHAIN_VBTC_RESERVE,
      { ...ON_CHAIN_USDC_RESERVE, underlying: OTHER_ADDRESS },
    ]);

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      `Aave reserve 2 underlying mismatch: indexer returned ${USDC_TOKEN}, expected ${OTHER_ADDRESS}`,
    );
  });

  it("fails closed when the indexer token address differs from the on-chain underlying", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(ENV_ADAPTER, "1", { address: OTHER_ADDRESS, decimals: 6 }),
    );

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      `Aave reserve 2 token address mismatch: indexer returned ${OTHER_ADDRESS}, expected ${USDC_TOKEN}`,
    );
  });

  it("fails closed when the indexer reports a different hub than the Core Spoke", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([
      ON_CHAIN_VBTC_RESERVE,
      { ...ON_CHAIN_USDC_RESERVE, hub: OTHER_ADDRESS },
    ]);

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      `Aave reserve 2 hub mismatch: indexer returned ${USDC_HUB}, expected ${OTHER_ADDRESS}`,
    );
  });

  it("fails closed when the indexer reports a different asset ID than the Core Spoke", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([
      ON_CHAIN_VBTC_RESERVE,
      { ...ON_CHAIN_USDC_RESERVE, assetId: 7 },
    ]);

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      "Aave reserve 2 asset ID mismatch: indexer returned 2, expected 7",
    );
  });

  it("fails closed when the indexer reports different decimals than the Core Spoke", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([
      ON_CHAIN_VBTC_RESERVE,
      { ...ON_CHAIN_USDC_RESERVE, decimals: 18 },
    ]);

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      "Aave reserve 2 decimals mismatch: indexer returned 6, expected 18",
    );
  });

  it("fails closed when the indexer token decimals differ from the on-chain decimals", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(ENV_ADAPTER, "1", { address: USDC_TOKEN, decimals: 18 }),
    );

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      "Aave reserve 2 token decimals mismatch: indexer returned 18, expected 6",
    );
  });

  it("accepts checksum/case differences between indexer and on-chain reserve addresses", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([
      ON_CHAIN_VBTC_RESERVE,
      {
        ...ON_CHAIN_USDC_RESERVE,
        hub: "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD" as Address,
      },
    ]);

    await expect(fetchAaveAppConfig()).resolves.not.toBeNull();
  });

  it("fails closed when the indexer reports a different hub for the vBTC reserve", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([
      { ...ON_CHAIN_VBTC_RESERVE, hub: OTHER_ADDRESS },
      ON_CHAIN_USDC_RESERVE,
    ]);

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      `Aave reserve 1 hub mismatch: indexer returned ${VBTC_HUB}, expected ${OTHER_ADDRESS}`,
    );
  });

  it("fails closed when the indexer lists the same reserve twice", async () => {
    const response = makeResponse();
    const [vbtcRow, usdcRow] = response.aaveReserves.items;
    mockRequest.mockResolvedValueOnce({
      ...response,
      aaveReserves: { items: [vbtcRow, usdcRow, usdcRow] },
    });

    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      "Aave indexer listed reserve 2 more than once",
    );
    expect(mockGetReservesBatch).not.toHaveBeenCalled();
  });

  it("fails closed when the Core Spoke reserve read fails", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockRejectedValueOnce(new Error("rpc down"));

    // A read failure may be transient, so it must stay retryable.
    const error = await fetchAaveAppConfig().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ReserveMismatchError);
    expect(error).toHaveProperty(
      "message",
      `Failed to read reserves from Core Spoke ${CORE_SPOKE}`,
    );
  });

  it("fails closed when the Core Spoke returns fewer reserves than the indexer listed", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());
    mockGetReservesBatch.mockResolvedValueOnce([ON_CHAIN_VBTC_RESERVE]);

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      `Core Spoke ${CORE_SPOKE} returned no reserve for indexed reserve 2`,
    );
  });
});
