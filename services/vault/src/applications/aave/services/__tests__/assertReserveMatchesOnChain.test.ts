import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/spoke", () => ({
  getReserve: vi.fn(),
}));

vi.mock("../../clients/transaction", () => ({
  getCoreSpokeAddress: vi.fn(),
}));

import { getReserve } from "../../clients/spoke";
import { getCoreSpokeAddress } from "../../clients/transaction";
import {
  ReserveMismatchError,
  _resetCoreSpokeCacheForTests,
  assertReserveMatchesOnChain,
} from "../assertReserveMatchesOnChain";

const mockGetReserve = vi.mocked(getReserve);
const mockGetCoreSpokeAddress = vi.mocked(getCoreSpokeAddress);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const SPOKE = "0x000000000000000000000000000000000000fa11" as Address;
const TOKEN_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;
const TOKEN_WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address;
const RESERVE_ID = 7n;

function reserveResult(underlying: Address) {
  return {
    underlying,
    hub: "0x000000000000000000000000000000000000beef" as Address,
    assetId: 1,
    decimals: 6,
    collateralRisk: 0,
    flags: 0,
    dynamicConfigKey: 0,
  };
}

describe("assertReserveMatchesOnChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCoreSpokeCacheForTests();
    mockGetCoreSpokeAddress.mockResolvedValue(SPOKE);
  });

  it("resolves the spoke from the trusted adapter, not from a caller-supplied value", async () => {
    mockGetReserve.mockResolvedValue(
      reserveResult(TOKEN_USDC.toLowerCase() as Address),
    );

    await assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC);

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledWith(ADAPTER);
    expect(mockGetReserve).toHaveBeenCalledWith(SPOKE, RESERVE_ID);
  });

  it("resolves when on-chain underlying matches the expected token (case-insensitive)", async () => {
    mockGetReserve.mockResolvedValue(
      reserveResult(TOKEN_USDC.toLowerCase() as Address),
    );

    await expect(
      assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).resolves.toBeUndefined();
  });

  it("throws ReserveMismatchError when on-chain underlying differs from expected token", async () => {
    mockGetReserve.mockResolvedValue(reserveResult(TOKEN_WBTC));

    await expect(
      assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
  });

  it("throws even when only the trailing checksum byte differs", async () => {
    const subtleSwap = (TOKEN_USDC.slice(0, -2) + "00") as Address;
    mockGetReserve.mockResolvedValue(reserveResult(subtleSwap));

    await expect(
      assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
  });

  it("propagates errors from the on-chain read", async () => {
    mockGetReserve.mockRejectedValue(new Error("rpc connection lost"));

    await expect(
      assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toThrow("rpc connection lost");
  });

  it("propagates errors from the spoke-address resolution", async () => {
    mockGetCoreSpokeAddress.mockRejectedValue(
      new Error("adapter not deployed"),
    );

    await expect(
      assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toThrow("adapter not deployed");
    expect(mockGetReserve).not.toHaveBeenCalled();
  });

  it("memoizes the spoke address per adapter so repeat calls skip the RPC", async () => {
    mockGetReserve.mockResolvedValue(reserveResult(TOKEN_USDC));

    await assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC);
    await assertReserveMatchesOnChain(ADAPTER, 99n, TOKEN_USDC);
    await assertReserveMatchesOnChain(ADAPTER, 42n, TOKEN_USDC);

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledTimes(1);
    expect(mockGetReserve).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failed spoke-address resolution", async () => {
    mockGetCoreSpokeAddress.mockRejectedValueOnce(
      new Error("transient rpc error"),
    );

    await expect(
      assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toThrow("transient rpc error");

    // Next call retries the resolution and succeeds.
    mockGetCoreSpokeAddress.mockResolvedValue(SPOKE);
    mockGetReserve.mockResolvedValue(reserveResult(TOKEN_USDC));
    await assertReserveMatchesOnChain(ADAPTER, RESERVE_ID, TOKEN_USDC);

    expect(mockGetCoreSpokeAddress).toHaveBeenCalledTimes(2);
  });
});
