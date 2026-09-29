import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import type { AaveReserveConfig } from "../../services/fetchConfig";
import { groupReservesByUnderlying } from "../reserveGroups";

const USDC = "0xB588C1bd8A6cd3F114A52a0AD916778B419ECf48" as Address;
const WBTC = "0x504579d0424B7B7cB4b17e16626f6A2f67bCa054" as Address;
const BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as Address;
const CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as Address;

function reserve(
  reserveId: bigint,
  underlying: Address,
  hub: Address,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: {
      underlying,
      hub,
      assetId: 0,
      decimals: 6,
      dynamicConfigKey: 0,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: 0,
      collateralFactor: 0,
    },
    token: { address: underlying, symbol: "TKN", name: "Token", decimals: 6 },
  };
}

describe("groupReservesByUnderlying", () => {
  it("groups the same token's reserves on different hubs, whatever the address case", () => {
    const babylonUsdc = reserve(0n, USDC, BABYLON_HUB);
    const coreUsdc = reserve(4n, USDC.toLowerCase() as Address, CORE_HUB);

    expect(groupReservesByUnderlying([babylonUsdc, coreUsdc])).toEqual([
      { underlying: USDC, reserves: [babylonUsdc, coreUsdc] },
    ]);
  });

  it("orders groups by their lowest reserve id and reserves by id", () => {
    const coreWbtc = reserve(6n, WBTC, CORE_HUB);
    const coreUsdc = reserve(4n, USDC, CORE_HUB);
    const babylonWbtc = reserve(2n, WBTC, BABYLON_HUB);
    const babylonUsdc = reserve(0n, USDC, BABYLON_HUB);

    const groups = groupReservesByUnderlying([
      coreWbtc,
      coreUsdc,
      babylonWbtc,
      babylonUsdc,
    ]);

    expect(groups.map((group) => group.underlying)).toEqual([USDC, WBTC]);
    expect(groups[1].reserves).toEqual([babylonWbtc, coreWbtc]);
  });
});
