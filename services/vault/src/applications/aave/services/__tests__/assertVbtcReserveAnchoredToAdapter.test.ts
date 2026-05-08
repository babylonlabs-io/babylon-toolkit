import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/spoke", () => ({
  getReserve: vi.fn(),
}));

vi.mock("../../clients/transaction", () => ({
  getAdapterImmutables: vi.fn(),
}));

import { getReserve } from "../../clients/spoke";
import { getAdapterImmutables } from "../../clients/transaction";
import { ReserveMismatchError } from "../assertReserveMatchesOnChain";
import {
  _resetAdapterImmutablesCacheForTests,
  assertVbtcReserveAnchoredToAdapter,
} from "../assertVbtcReserveAnchoredToAdapter";

const mockGetAdapterImmutables = vi.mocked(getAdapterImmutables);
const mockGetReserve = vi.mocked(getReserve);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const SPOKE = "0x000000000000000000000000000000000000fa11" as Address;
const VAULT_BTC = "0x4444444444444444444444444444444444444444" as Address;
const OTHER_TOKEN = "0x9999999999999999999999999999999999999999" as Address;
const VBTC_RESERVE_ID = 1n;

function reserveResult(underlying: Address) {
  return {
    underlying,
    hub: "0x000000000000000000000000000000000000beef" as Address,
    assetId: 1,
    decimals: 8,
    collateralRisk: 0,
    flags: 0,
    dynamicConfigKey: 7,
  };
}

describe("assertVbtcReserveAnchoredToAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAdapterImmutablesCacheForTests();
    mockGetAdapterImmutables.mockResolvedValue({
      spoke: SPOKE,
      vbtcReserveId: VBTC_RESERVE_ID,
      vaultBtc: VAULT_BTC,
    });
    mockGetReserve.mockResolvedValue(reserveResult(VAULT_BTC));
  });

  it("resolves spoke / reserve id / VAULT_BTC from the trusted adapter", async () => {
    await assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID);

    expect(mockGetAdapterImmutables).toHaveBeenCalledWith(ADAPTER);
    expect(mockGetReserve).toHaveBeenCalledWith(SPOKE, VBTC_RESERVE_ID);
  });

  it("throws ReserveMismatchError when the displayed reserve id disagrees with the adapter's immutable", async () => {
    await expect(
      assertVbtcReserveAnchoredToAdapter(ADAPTER, 42n),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
    expect(mockGetReserve).not.toHaveBeenCalled();
  });

  it("throws ReserveMismatchError when the on-chain underlying differs from VAULT_BTC", async () => {
    mockGetReserve.mockResolvedValue(reserveResult(OTHER_TOKEN));

    await expect(
      assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
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
      assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID),
    ).resolves.toBeUndefined();
  });

  it("memoizes adapter immutables so repeat calls skip the multicall", async () => {
    await assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID);
    await assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID);
    await assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID);

    expect(mockGetAdapterImmutables).toHaveBeenCalledTimes(1);
    expect(mockGetReserve).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failed adapter-immutables read", async () => {
    mockGetAdapterImmutables.mockRejectedValueOnce(new Error("rpc down"));

    await expect(
      assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID),
    ).rejects.toThrow("rpc down");

    mockGetAdapterImmutables.mockResolvedValue({
      spoke: SPOKE,
      vbtcReserveId: VBTC_RESERVE_ID,
      vaultBtc: VAULT_BTC,
    });

    await assertVbtcReserveAnchoredToAdapter(ADAPTER, VBTC_RESERVE_ID);
    expect(mockGetAdapterImmutables).toHaveBeenCalledTimes(2);
  });
});
