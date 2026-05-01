import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

vi.mock("../../clients/transaction", () => ({
  getCoreSpokeAddress: vi.fn(),
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: vi.fn(),
}));

import { graphqlClient } from "../../../../clients/graphql";
import { getCoreSpokeAddress } from "../../clients/transaction";
import { getAaveAdapterAddress } from "../../config";
import { fetchAaveAppConfig } from "../fetchConfig";

const mockRequest = vi.mocked(graphqlClient.request);
const mockGetCoreSpokeAddress = vi.mocked(getCoreSpokeAddress);
const mockGetAaveAdapterAddress = vi.mocked(getAaveAdapterAddress);

const ENV_ADAPTER = "0x1111111111111111111111111111111111111111" as Address;
const INDEXER_ADAPTER = "0x2222222222222222222222222222222222222222" as Address;
const CORE_SPOKE = "0x3333333333333333333333333333333333333333" as Address;
const VAULT_BTC = "0x4444444444444444444444444444444444444444";
const BTC_VAULT_REGISTRY = "0x5555555555555555555555555555555555555555";
const VBTC_TOKEN = "0x6666666666666666666666666666666666666666";
const USDC_TOKEN = "0x7777777777777777777777777777777777777777";

function makeResponse(adapterAddress: Address = ENV_ADAPTER) {
  return {
    aaveConfig: {
      id: 1,
      adapterAddress,
      vaultBtcAddress: VAULT_BTC,
      btcVaultRegistryAddress: BTC_VAULT_REGISTRY,
      btcVaultCoreVbtcReserveId: "1",
    },
    aaveReserves: {
      items: [
        {
          id: "1",
          underlying: VBTC_TOKEN,
          hub: "0x8888888888888888888888888888888888888888",
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
          hub: "0x9999999999999999999999999999999999999999",
          assetId: 2,
          decimals: 6,
          dynamicConfigKey: 1,
          paused: false,
          frozen: false,
          borrowable: true,
          collateralRisk: 0,
          collateralFactor: 0,
          underlyingToken: {
            address: USDC_TOKEN,
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
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
  });

  it("returns null when the indexer has no Aave config", async () => {
    mockRequest.mockResolvedValueOnce({
      aaveConfig: null,
      aaveReserves: { items: [] },
    });

    await expect(fetchAaveAppConfig()).resolves.toBeNull();
    expect(mockGetCoreSpokeAddress).not.toHaveBeenCalled();
  });
});
