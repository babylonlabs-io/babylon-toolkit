import type { Address, PublicClient } from "viem";
import { describe, expect, it } from "vitest";

import { BPS_SCALE, WAD_DECIMALS } from "../../constants.js";
import {
  getCollateralFactor,
  getLiquidationBonus,
  getTargetHealthFactor,
} from "../spoke.js";

// Stub values — mock functions don't use these parameters yet
const STUB_CLIENT = {} as PublicClient;
const STUB_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;

describe("Core Spoke parameter reads (mock)", () => {
  it("returns target health factor of 1.10 in WAD", async () => {
    const thf = await getTargetHealthFactor(STUB_CLIENT, STUB_ADDRESS);

    expect(Number(thf) / 10 ** WAD_DECIMALS).toBeCloseTo(1.1, 10);
  });

  it("returns collateral factor of 75% in BPS", async () => {
    const cf = await getCollateralFactor(STUB_CLIENT, STUB_ADDRESS);

    expect(Number(cf) / BPS_SCALE).toBe(0.75);
  });

  it("returns liquidation bonus of 1.05 in WAD", async () => {
    const lb = await getLiquidationBonus(STUB_CLIENT, STUB_ADDRESS);

    expect(Number(lb) / 10 ** WAD_DECIMALS).toBeCloseTo(1.05, 10);
  });
});
