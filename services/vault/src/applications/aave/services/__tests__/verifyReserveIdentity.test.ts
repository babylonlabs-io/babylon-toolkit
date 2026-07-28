import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the leaf clients only, so the real assertReserveMatchesOnChain runs and
// the real ReserveMismatchError instance reaches isIntegrityFailure.
vi.mock("../../clients/spoke", () => ({
  getReserve: vi.fn(),
}));

vi.mock("../../clients/transaction", () => ({
  getCoreSpokeAddress: vi.fn(),
}));

vi.mock("@/clients/eth-contract/erc20", async () => {
  const actual = await vi.importActual<
    typeof import("@/clients/eth-contract/erc20")
  >("@/clients/eth-contract/erc20");
  return {
    ...actual,
    getERC20Decimals: vi.fn(),
    getERC20Symbol: vi.fn(),
    getERC20Name: vi.fn(),
  };
});

vi.mock("@/services/token/tokenService", () => ({
  getRegisteredTokenByAddress: vi.fn(),
}));

import {
  InvalidTokenDecimalsError,
  getERC20Decimals,
  getERC20Name,
  getERC20Symbol,
} from "@/clients/eth-contract/erc20";
import { getRegisteredTokenByAddress } from "@/services/token/tokenService";

import { getReserve } from "../../clients/spoke";
import { getCoreSpokeAddress } from "../../clients/transaction";
import {
  ReserveMismatchError,
  _resetCoreSpokeCacheForTests,
} from "../assertReserveMatchesOnChain";
import {
  UnknownReserveTokenError,
  isIntegrityFailure,
  verifyReserveIdentity,
} from "../verifyReserveIdentity";

const mockGetReserve = vi.mocked(getReserve);
const mockGetCoreSpokeAddress = vi.mocked(getCoreSpokeAddress);
const mockGetERC20Decimals = vi.mocked(getERC20Decimals);
const mockGetERC20Symbol = vi.mocked(getERC20Symbol);
const mockGetERC20Name = vi.mocked(getERC20Name);
const mockGetRegisteredTokenByAddress = vi.mocked(getRegisteredTokenByAddress);

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

describe("verifyReserveIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCoreSpokeCacheForTests();
    mockGetCoreSpokeAddress.mockResolvedValue(SPOKE);
    mockGetReserve.mockResolvedValue(reserveResult(TOKEN_USDC));
    mockGetERC20Decimals.mockResolvedValue(6);
    mockGetRegisteredTokenByAddress.mockReturnValue(null);
    mockGetERC20Symbol.mockResolvedValue(null);
    mockGetERC20Name.mockResolvedValue(null);
  });

  it("labels a registered token from the registry and marks the source", async () => {
    mockGetRegisteredTokenByAddress.mockReturnValue({
      address: TOKEN_USDC,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 18,
      icon: "usdc.svg",
    });

    const identity = await verifyReserveIdentity(
      ADAPTER,
      RESERVE_ID,
      TOKEN_USDC,
    );

    expect(identity).toEqual({
      address: TOKEN_USDC,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      icon: "usdc.svg",
      source: "registry",
    });
  });

  it("takes decimals from the chain even when the registry has its own copy", async () => {
    mockGetRegisteredTokenByAddress.mockReturnValue({
      address: TOKEN_USDC,
      symbol: "USDC",
      name: "USD Coin",
      // Stale hand-maintained value; the signing path parses against 6.
      decimals: 18,
      icon: undefined,
    });
    mockGetERC20Decimals.mockResolvedValue(6);

    const identity = await verifyReserveIdentity(
      ADAPTER,
      RESERVE_ID,
      TOKEN_USDC,
    );

    expect(identity.decimals).toBe(6);
  });

  it("does not read the token contract's symbol when the registry knows the address", async () => {
    mockGetRegisteredTokenByAddress.mockReturnValue({
      address: TOKEN_USDC,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      icon: undefined,
    });

    await verifyReserveIdentity(ADAPTER, RESERVE_ID, TOKEN_USDC);

    expect(mockGetERC20Symbol).not.toHaveBeenCalled();
    expect(mockGetERC20Name).not.toHaveBeenCalled();
  });

  it("falls back to the token contract's own symbol and name for an unregistered address", async () => {
    mockGetERC20Symbol.mockResolvedValue("TUSDC");
    mockGetERC20Name.mockResolvedValue("Test USD Coin");

    const identity = await verifyReserveIdentity(
      ADAPTER,
      RESERVE_ID,
      TOKEN_USDC,
    );

    expect(identity).toEqual({
      address: TOKEN_USDC,
      symbol: "TUSDC",
      name: "Test USD Coin",
      decimals: 6,
      icon: undefined,
      source: "onchain",
    });
  });

  it("uses the on-chain symbol as the name when the token has no usable name", async () => {
    mockGetERC20Symbol.mockResolvedValue("TUSDC");
    mockGetERC20Name.mockResolvedValue(null);

    const identity = await verifyReserveIdentity(
      ADAPTER,
      RESERVE_ID,
      TOKEN_USDC,
    );

    expect(identity.name).toBe("TUSDC");
  });

  it("falls back to the symbol when the token has no name() method", async () => {
    mockGetERC20Symbol.mockResolvedValue("TUSDC");
    mockGetERC20Name.mockRejectedValue(new Error('function "name" reverted'));

    const identity = await verifyReserveIdentity(
      ADAPTER,
      RESERVE_ID,
      TOKEN_USDC,
    );

    expect(identity.symbol).toBe("TUSDC");
    expect(identity.name).toBe("TUSDC");
  });

  it("hard-blocks rather than retrying when the token has no symbol() method", async () => {
    mockGetERC20Symbol.mockRejectedValue(
      new Error('function "symbol" reverted'),
    );
    mockGetERC20Name.mockResolvedValue("Test USD Coin");

    await expect(
      verifyReserveIdentity(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toBeInstanceOf(UnknownReserveTokenError);
  });

  it("throws UnknownReserveTokenError when neither the registry nor the contract can name the token", async () => {
    mockGetERC20Symbol.mockResolvedValue(null);

    await expect(
      verifyReserveIdentity(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toBeInstanceOf(UnknownReserveTokenError);
  });

  it("throws ReserveMismatchError when the reserve maps to a different token on-chain", async () => {
    mockGetReserve.mockResolvedValue(reserveResult(TOKEN_WBTC));

    await expect(
      verifyReserveIdentity(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
  });

  it("does not read decimals or labels once the reserve mismatch is proven", async () => {
    mockGetReserve.mockResolvedValue(reserveResult(TOKEN_WBTC));

    await expect(
      verifyReserveIdentity(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toBeInstanceOf(ReserveMismatchError);
    expect(mockGetERC20Decimals).not.toHaveBeenCalled();
    expect(mockGetRegisteredTokenByAddress).not.toHaveBeenCalled();
  });

  it("propagates a transient RPC failure from the decimals read", async () => {
    mockGetERC20Decimals.mockRejectedValue(new Error("rpc connection lost"));

    await expect(
      verifyReserveIdentity(ADAPTER, RESERVE_ID, TOKEN_USDC),
    ).rejects.toThrow("rpc connection lost");
  });
});

describe("isIntegrityFailure", () => {
  it("treats a proven reserve mismatch as an integrity failure", () => {
    expect(isIntegrityFailure(new ReserveMismatchError("mismatch"))).toBe(true);
  });

  it("treats an unlabelable token as an integrity failure", () => {
    expect(isIntegrityFailure(new UnknownReserveTokenError("no label"))).toBe(
      true,
    );
  });

  it("treats implausible decimals as an integrity failure", () => {
    expect(
      isIntegrityFailure(new InvalidTokenDecimalsError("42 decimals")),
    ).toBe(true);
  });

  it("treats an RPC error as transient, not an integrity failure", () => {
    expect(isIntegrityFailure(new Error("rpc connection lost"))).toBe(false);
  });
});
