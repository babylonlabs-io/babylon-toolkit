import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { CORE_HUB, USDC } from "@/test/deploymentAddresses";

import type { AaveReserveConfig } from "../../services/fetchConfig";
import { getReserveTokenLabel } from "../reserveTokenLabel";

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
      hub: CORE_HUB,
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
      reserveWithToken(USDC, { symbol: "FAKE", name: "Fake Coin" }),
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
