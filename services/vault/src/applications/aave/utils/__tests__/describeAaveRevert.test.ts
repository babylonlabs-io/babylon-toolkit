import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { ContractError, ErrorCode } from "@/utils/errors";

import type { AaveReserveConfig } from "../../services/fetchConfig";
import { describeAaveRevert } from "../describeAaveRevert";

/** Vault Devnet Core Hub, in the hub registry. */
const CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as Address;

const usdcCore = {
  reserveId: 4n,
  reserve: { hub: CORE_HUB, decimals: 6 },
  token: { symbol: "USDC", decimals: 6 },
} as unknown as AaveReserveConfig;

function revert(reason: string, args?: readonly unknown[]): ContractError {
  return new ContractError(
    "decoded message",
    ErrorCode.CONTRACT_REVERT,
    undefined,
    reason,
    { context: args ? { errorArgs: args } : undefined },
  );
}

describe("describeAaveRevert", () => {
  it("states a draw cap in whole tokens, not scaled by decimals", () => {
    expect(
      describeAaveRevert(
        revert("DrawCapExceeded", [1_000_000n]),
        usdcCore,
        "borrow",
      ),
    ).toBe(
      "This amount would go over the borrow limit for USDC on Core Hub, which is 1,000,000 USDC. Enter a lower amount and try again.",
    );
  });

  it("scales hub liquidity from base units by the asset's decimals", () => {
    expect(
      describeAaveRevert(
        revert("InsufficientLiquidity", [1_234_500_000n]),
        usdcCore,
        "borrow",
      ),
    ).toBe(
      "Only 1,234.5 USDC on Core Hub is available to borrow right now. Enter a lower amount and try again.",
    );
  });

  it("names the reserve's hub for a halted spoke", () => {
    expect(
      describeAaveRevert(revert("SpokeHalted"), usdcCore, "repay"),
    ).toContain("Core Hub has halted USDC");
  });

  it("names the reserve's hub for an inactive spoke on a repay, which touches no other hub", () => {
    expect(
      describeAaveRevert(revert("SpokeNotActive"), usdcCore, "repay"),
    ).toContain("Core Hub isn't accepting USDC transactions");
  });

  it("keeps the fixed text for an inactive spoke on a borrow, which may be another hub", () => {
    expect(
      describeAaveRevert(revert("SpokeNotActive"), usdcCore, "borrow"),
    ).toBe(
      "A hub this transaction depends on isn't accepting transactions right now. Try again later.",
    );
  });

  it("returns the fixed text for a spoke reserve revert", () => {
    expect(
      describeAaveRevert(revert("ReserveFrozen"), usdcCore, "borrow"),
    ).toBe("This market isn't accepting new borrows right now.");
  });

  it("leaves other errors to the caller", () => {
    expect(
      describeAaveRevert(revert("PositionNotFound"), usdcCore, "borrow"),
    ).toBeUndefined();
    expect(
      describeAaveRevert(new Error("boom"), usdcCore, "borrow"),
    ).toBeUndefined();
  });
});
