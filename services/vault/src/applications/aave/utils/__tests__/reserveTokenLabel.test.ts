import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import type { AaveReserveConfig } from "../../services/fetchConfig";
import { getReserveTokenLabel } from "../reserveTokenLabel";

/** Vault Devnet USDC, present in the address-keyed token registry. */
const REGISTERED_USDC = "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48" as Address;
const UNREGISTERED_TOKEN =
  "0x1111111111111111111111111111111111111111" as Address;

function reserveWithToken(
  underlying: Address,
  token: { symbol: string; name: string },
): AaveReserveConfig {
  return {
    reserveId: 4n,
    reserve: {
      underlying,
      hub: "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca",
      assetId: 0,
      decimals: 6,
      dynamicConfigKey: 0,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: 0,
      collateralFactor: 0,
    },
    token: { address: underlying, decimals: 6, ...token },
  };
}

describe("getReserveTokenLabel", () => {
  it("labels a registered underlying from the token registry, not the indexer", () => {
    const label = getReserveTokenLabel(
      reserveWithToken(REGISTERED_USDC, { symbol: "FAKE", name: "Fake Coin" }),
    );

    expect(label).toEqual({
      symbol: "USDC",
      name: "USD Coin",
      icon: "/images/usdc.svg",
    });
  });

  it("falls back to the indexer label for an unregistered underlying", () => {
    const label = getReserveTokenLabel(
      reserveWithToken(UNREGISTERED_TOKEN, { symbol: "TKN", name: "Token" }),
    );

    expect(label.symbol).toBe("TKN");
    expect(label.name).toBe("Token");
  });

  it("shows an address-shaped indexer symbol as unknown", () => {
    const label = getReserveTokenLabel(
      reserveWithToken(UNREGISTERED_TOKEN, {
        symbol: UNREGISTERED_TOKEN,
        name: "",
      }),
    );

    expect(label.symbol).toBe("Unknown");
    expect(label.name).toBe("Unknown");
  });
});
