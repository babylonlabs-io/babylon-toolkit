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
  getVaultBtcAddress: vi.fn(),
}));

vi.mock("../../clients/spoke", () => ({
  getReserve: vi.fn(),
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: vi.fn(),
}));

import { graphqlClient } from "../../../../clients/graphql";
import { getReserve } from "../../clients/spoke";
import {
  getCoreSpokeAddress,
  getVaultBtcAddress,
  getVaultBtcReserveId,
} from "../../clients/transaction";
import { getAaveAdapterAddress } from "../../config";
import { fetchAaveAppConfig } from "../fetchConfig";

const mockRequest = vi.mocked(graphqlClient.request);
const mockGetCoreSpokeAddress = vi.mocked(getCoreSpokeAddress);
const mockGetVaultBtcReserveId = vi.mocked(getVaultBtcReserveId);
const mockGetVaultBtcAddress = vi.mocked(getVaultBtcAddress);
const mockGetReserve = vi.mocked(getReserve);
const mockGetAaveAdapterAddress = vi.mocked(getAaveAdapterAddress);

const ENV_ADAPTER = "0x1111111111111111111111111111111111111111" as Address;
const INDEXER_ADAPTER = "0x2222222222222222222222222222222222222222" as Address;
const CORE_SPOKE = "0x3333333333333333333333333333333333333333" as Address;
const VAULT_BTC = "0x4444444444444444444444444444444444444444" as Address;
const BTC_VAULT_REGISTRY = "0x5555555555555555555555555555555555555555";
const USDC_TOKEN = "0x7777777777777777777777777777777777777777" as Address;
const VBTC_RESERVE_ID = 1n;

function reserveStruct(underlying: Address) {
  return {
    underlying,
    hub: "0x8888888888888888888888888888888888888888" as Address,
    assetId: 1,
    decimals: 8,
    collateralRisk: 0,
    flags: 0,
    dynamicConfigKey: 1,
  };
}

function makeResponse(overrides?: {
  adapterAddress?: Address;
  vaultBtcAddress?: Address;
  vbtcReserveId?: string;
}) {
  return {
    aaveConfig: {
      id: 1,
      adapterAddress: overrides?.adapterAddress ?? ENV_ADAPTER,
      vaultBtcAddress: overrides?.vaultBtcAddress ?? VAULT_BTC,
      btcVaultRegistryAddress: BTC_VAULT_REGISTRY,
      btcVaultCoreVbtcReserveId:
        overrides?.vbtcReserveId ?? VBTC_RESERVE_ID.toString(),
    },
    aaveReserves: {
      items: [
        {
          id: VBTC_RESERVE_ID.toString(),
          underlying: VAULT_BTC,
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
            address: VAULT_BTC,
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
    mockGetVaultBtcReserveId.mockResolvedValue(VBTC_RESERVE_ID);
    mockGetVaultBtcAddress.mockResolvedValue(VAULT_BTC);
    mockGetReserve.mockResolvedValue(reserveStruct(VAULT_BTC));
  });

  it("resolves the Core Spoke from the env-pinned adapter when the indexer agrees", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse());

    const result = await fetchAaveAppConfig();

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledWith(ENV_ADAPTER);
    expect(mockGetVaultBtcReserveId).toHaveBeenCalledWith(ENV_ADAPTER);
    expect(mockGetVaultBtcAddress).toHaveBeenCalledWith(ENV_ADAPTER);
    expect(mockGetReserve).toHaveBeenCalledWith(CORE_SPOKE, VBTC_RESERVE_ID);
    expect(result?.config.adapterAddress).toBe(ENV_ADAPTER);
    expect(result?.config.coreSpokeAddress).toBe(CORE_SPOKE);
    expect(result?.config.btcVaultCoreVbtcReserveId).toBe(VBTC_RESERVE_ID);
    expect(result?.config.vaultBtcAddress).toBe(VAULT_BTC);
    expect(result?.vbtcReserve?.reserveId).toBe(VBTC_RESERVE_ID);
    expect(result?.borrowableReserves).toHaveLength(1);
    expect(result?.allBorrowReserves).toHaveLength(1);
  });

  it("accepts checksum/case differences between the indexer and env adapter", async () => {
    mockGetAaveAdapterAddress.mockReturnValue(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
    );
    mockRequest.mockResolvedValueOnce(
      makeResponse({
        adapterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      }),
    );

    await expect(fetchAaveAppConfig()).resolves.not.toThrow();

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledWith(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    );
  });

  it("fails closed when the indexer adapter differs from the env-pinned adapter", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse({ adapterAddress: INDEXER_ADAPTER }),
    );

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      `Aave adapter mismatch: indexer returned ${INDEXER_ADAPTER}, expected ${ENV_ADAPTER}`,
    );

    expect(mockGetCoreSpokeAddress).not.toHaveBeenCalled();
    expect(mockGetVaultBtcReserveId).not.toHaveBeenCalled();
    expect(mockGetVaultBtcAddress).not.toHaveBeenCalled();
  });

  it("fails closed when the indexer's vBTC reserve id differs from the adapter's on-chain value", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse({ vbtcReserveId: "42" }));

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      "Aave vBTC reserve id mismatch",
    );

    expect(mockGetReserve).not.toHaveBeenCalled();
  });

  it("fails closed when the indexer's vBTC token address differs from the adapter's on-chain value", async () => {
    const POISONED = "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead" as Address;
    mockRequest.mockResolvedValueOnce(
      makeResponse({ vaultBtcAddress: POISONED }),
    );

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      "Aave vBTC token mismatch",
    );

    expect(mockGetReserve).not.toHaveBeenCalled();
  });

  it("accepts case differences between the indexer and adapter vBTC token addresses", async () => {
    mockGetVaultBtcAddress.mockResolvedValue(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
    );
    mockGetReserve.mockResolvedValue(
      reserveStruct("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address),
    );
    mockRequest.mockResolvedValueOnce(
      makeResponse({
        vaultBtcAddress:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      }),
    );

    await expect(fetchAaveAppConfig()).resolves.not.toThrow();
  });

  it("fails closed when the on-chain reserve underlying differs from the adapter's VAULT_BTC", async () => {
    mockGetReserve.mockResolvedValue(reserveStruct(USDC_TOKEN));
    mockRequest.mockResolvedValueOnce(makeResponse());

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      "Aave vBTC reserve underlying mismatch",
    );
  });

  it("returns null when the indexer has no Aave config", async () => {
    mockRequest.mockResolvedValueOnce({
      aaveConfig: null,
      aaveReserves: { items: [] },
    });

    await expect(fetchAaveAppConfig()).resolves.toBeNull();
    expect(mockGetCoreSpokeAddress).not.toHaveBeenCalled();
    expect(mockGetVaultBtcReserveId).not.toHaveBeenCalled();
    expect(mockGetVaultBtcAddress).not.toHaveBeenCalled();
  });

  it("wraps adapter read failures with adapter context", async () => {
    mockGetVaultBtcReserveId.mockRejectedValueOnce(new Error("rpc down"));
    mockRequest.mockResolvedValueOnce(makeResponse());

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      `Failed to resolve Aave config from adapter ${ENV_ADAPTER}`,
    );
  });

  it("wraps spoke reserve read failures with spoke and reserve context", async () => {
    mockGetReserve.mockRejectedValueOnce(new Error("spoke rpc down"));
    mockRequest.mockResolvedValueOnce(makeResponse());

    await expect(fetchAaveAppConfig()).rejects.toThrow(
      `Failed to read vBTC reserve ${VBTC_RESERVE_ID} from spoke ${CORE_SPOKE}`,
    );
  });
});
