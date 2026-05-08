import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/spoke", () => ({
  getDynamicReserveConfig: vi.fn(),
  getReserve: vi.fn(),
}));

vi.mock("../../clients/transaction", () => ({
  getAdapterImmutables: vi.fn(),
}));

import { getDynamicReserveConfig, getReserve } from "../../clients/spoke";
import { getAdapterImmutables } from "../../clients/transaction";
import { ReserveMismatchError } from "../assertReserveMatchesOnChain";
import {
  _resetAdapterImmutablesCacheForTests,
  fetchFreshCollateralFactorOnChain,
} from "../fetchFreshCollateralFactorOnChain";

const mockGetAdapterImmutables = vi.mocked(getAdapterImmutables);
const mockGetReserve = vi.mocked(getReserve);
const mockGetDynamicReserveConfig = vi.mocked(getDynamicReserveConfig);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const SPOKE = "0x000000000000000000000000000000000000fa11" as Address;
const VAULT_BTC = "0x4444444444444444444444444444444444444444" as Address;
const OTHER_TOKEN = "0x9999999999999999999999999999999999999999" as Address;
const VBTC_RESERVE_ID = 1n;
const ON_CHAIN_DYNAMIC_KEY = 7;
const POSITION_DYNAMIC_KEY = 5;

function reserveResult(
  underlying: Address,
  dynamicConfigKey = ON_CHAIN_DYNAMIC_KEY,
) {
  return {
    underlying,
    hub: "0x000000000000000000000000000000000000beef" as Address,
    assetId: 1,
    decimals: 8,
    collateralRisk: 0,
    flags: 0,
    dynamicConfigKey,
  };
}

function dynamicConfig(collateralFactor: number) {
  return {
    collateralFactor: BigInt(collateralFactor),
    maxLiquidationBonus: 0n,
    liquidationFee: 0n,
  };
}

describe("fetchFreshCollateralFactorOnChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAdapterImmutablesCacheForTests();
    mockGetAdapterImmutables.mockResolvedValue({
      spoke: SPOKE,
      vbtcReserveId: VBTC_RESERVE_ID,
      vaultBtc: VAULT_BTC,
    });
    mockGetReserve.mockResolvedValue(reserveResult(VAULT_BTC));
    mockGetDynamicReserveConfig.mockResolvedValue(dynamicConfig(8000));
  });

  it("resolves spoke / reserve id / VAULT_BTC from the trusted adapter, not the caller", async () => {
    const result = await fetchFreshCollateralFactorOnChain(
      ADAPTER,
      VBTC_RESERVE_ID,
    );

    expect(mockGetAdapterImmutables).toHaveBeenCalledWith(ADAPTER);
    expect(mockGetReserve).toHaveBeenCalledWith(SPOKE, VBTC_RESERVE_ID);
    expect(result).toEqual({ collateralFactor: 8000 });
  });

  it("uses the reserve's on-chain dynamicConfigKey on first-borrow flows (no position key)", async () => {
    mockGetReserve.mockResolvedValue(
      reserveResult(VAULT_BTC, ON_CHAIN_DYNAMIC_KEY),
    );

    await fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID);

    expect(mockGetDynamicReserveConfig).toHaveBeenCalledWith(
      SPOKE,
      VBTC_RESERVE_ID,
      ON_CHAIN_DYNAMIC_KEY,
    );
  });

  it("prefers the user's position dynamicConfigKey over the reserve's current key", async () => {
    mockGetReserve.mockResolvedValue(
      reserveResult(VAULT_BTC, ON_CHAIN_DYNAMIC_KEY),
    );

    await fetchFreshCollateralFactorOnChain(
      ADAPTER,
      VBTC_RESERVE_ID,
      POSITION_DYNAMIC_KEY,
    );

    expect(mockGetDynamicReserveConfig).toHaveBeenCalledWith(
      SPOKE,
      VBTC_RESERVE_ID,
      POSITION_DYNAMIC_KEY,
    );
    expect(mockGetDynamicReserveConfig).not.toHaveBeenCalledWith(
      SPOKE,
      VBTC_RESERVE_ID,
      ON_CHAIN_DYNAMIC_KEY,
    );
  });

  it("throws ReserveMismatchError when the displayed reserve id disagrees with the adapter's immutable", async () => {
    await expect(
      fetchFreshCollateralFactorOnChain(ADAPTER, 42n),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
    expect(mockGetReserve).not.toHaveBeenCalled();
    expect(mockGetDynamicReserveConfig).not.toHaveBeenCalled();
  });

  it("throws ReserveMismatchError when the on-chain underlying differs from VAULT_BTC", async () => {
    mockGetReserve.mockResolvedValue(reserveResult(OTHER_TOKEN));

    await expect(
      fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
    expect(mockGetDynamicReserveConfig).not.toHaveBeenCalled();
  });

  it("treats checksum/case differences in VAULT_BTC vs underlying as a match", async () => {
    mockGetAdapterImmutables.mockResolvedValue({
      spoke: SPOKE,
      vbtcReserveId: VBTC_RESERVE_ID,
      vaultBtc: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
    });
    mockGetReserve.mockResolvedValue(
      reserveResult("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address),
    );

    await expect(
      fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID),
    ).resolves.toEqual({ collateralFactor: 8000 });
  });

  it("memoizes adapter immutables so repeat calls skip the multicall", async () => {
    await fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID);
    await fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID);
    await fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID);

    expect(mockGetAdapterImmutables).toHaveBeenCalledTimes(1);
    expect(mockGetReserve).toHaveBeenCalledTimes(3);
    expect(mockGetDynamicReserveConfig).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failed adapter-immutables read", async () => {
    mockGetAdapterImmutables.mockRejectedValueOnce(new Error("rpc down"));

    await expect(
      fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID),
    ).rejects.toThrow("rpc down");

    mockGetAdapterImmutables.mockResolvedValue({
      spoke: SPOKE,
      vbtcReserveId: VBTC_RESERVE_ID,
      vaultBtc: VAULT_BTC,
    });

    await fetchFreshCollateralFactorOnChain(ADAPTER, VBTC_RESERVE_ID);
    expect(mockGetAdapterImmutables).toHaveBeenCalledTimes(2);
  });
});
