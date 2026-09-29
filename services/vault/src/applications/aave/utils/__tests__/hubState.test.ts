import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { UNLIMITED_SPOKE_CAP } from "../../clients/aaveHub";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import {
  describeHubBlock,
  describeWithdrawHubBlock,
  getBorrowHubBlock,
  getDrawHeadroom,
  getReserveHubBlock,
  getWithdrawHubBlock,
} from "../hubState";

/** Vault Devnet hubs, both in the hub registry. */
const BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as Address;
const CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as Address;

function reserve(
  reserveId: bigint,
  symbol: string,
  hub: Address,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: { hub, decimals: 6 },
    token: { symbol, decimals: 6 },
  } as unknown as AaveReserveConfig;
}

const USABLE = { drawCap: 10_000_000, active: true, halted: false };
const HALTED = { ...USABLE, halted: true };
const INACTIVE = { ...USABLE, active: false };

const usdcBabylon = reserve(0n, "USDC", BABYLON_HUB);
const usdcCore = reserve(4n, "USDC", CORE_HUB);
const vbtc = reserve(3n, "vBTC", BABYLON_HUB);

describe("getReserveHubBlock", () => {
  it("blocks a reserve whose hub has halted our spoke", () => {
    expect(getReserveHubBlock(usdcCore, { "4": HALTED })).toEqual({
      status: "halted",
      via: "reserve",
      reserve: usdcCore,
    });
  });

  it("reports inactive before halted when both are set", () => {
    expect(
      getReserveHubBlock(usdcCore, { "4": { ...INACTIVE, halted: true } })
        ?.status,
    ).toBe("inactive");
  });

  it("does not block when the config is usable or was not read", () => {
    expect(getReserveHubBlock(usdcCore, { "4": USABLE })).toBeNull();
    expect(getReserveHubBlock(usdcCore, { "4": null })).toBeNull();
    expect(getReserveHubBlock(usdcCore, {})).toBeNull();
  });
});

describe("getBorrowHubBlock", () => {
  it("blocks a borrow on one hub when another hub where the user has debt is inactive", () => {
    expect(
      getBorrowHubBlock(usdcBabylon, [usdcCore], {
        "0": USABLE,
        "4": INACTIVE,
      }),
    ).toEqual({ status: "inactive", via: "debt", reserve: usdcCore });
  });

  it("does not block a borrow when a hub where the user has debt is only halted", () => {
    // The risk-premium refresh checks active, not halted.
    expect(
      getBorrowHubBlock(usdcBabylon, [usdcCore], { "0": USABLE, "4": HALTED }),
    ).toBeNull();
  });

  it("names the borrowed reserve's own hub first", () => {
    expect(
      getBorrowHubBlock(usdcBabylon, [usdcCore], {
        "0": HALTED,
        "4": INACTIVE,
      }),
    ).toMatchObject({ status: "halted", via: "reserve", reserve: usdcBabylon });
  });
});

describe("getWithdrawHubBlock", () => {
  it("blocks when the collateral's hub has halted our spoke", () => {
    expect(getWithdrawHubBlock(vbtc, [], { "3": HALTED })).toMatchObject({
      via: "reserve",
      reserve: vbtc,
    });
  });

  it("blocks when a hub where the user has debt is inactive", () => {
    expect(
      getWithdrawHubBlock(vbtc, [usdcCore], { "3": USABLE, "4": INACTIVE }),
    ).toMatchObject({ via: "debt", reserve: usdcCore });
  });
});

describe("hub block messages", () => {
  it("names the hub and the token for a block on the reserve's own hub", () => {
    expect(
      describeHubBlock({ status: "halted", via: "reserve", reserve: usdcCore }),
    ).toBe(
      "Core Hub has halted USDC, so it can't be borrowed or repaid on this hub until the halt is lifted. Your debt stays as it is.",
    );
  });

  it("names the other hub for a block from debt elsewhere", () => {
    expect(
      describeHubBlock({ status: "inactive", via: "debt", reserve: usdcCore }),
    ).toBe(
      "Core Hub, where you have debt, isn't accepting transactions right now, so borrowing and withdrawing collateral are unavailable until it is.",
    );
  });

  it("names the collateral's hub on the withdraw review", () => {
    expect(
      describeWithdrawHubBlock({
        status: "halted",
        via: "reserve",
        reserve: vbtc,
      }),
    ).toBe(
      "Babylon Hub isn't accepting BTCVault collateral withdrawals right now. Try again later.",
    );
  });
});

describe("getDrawHeadroom", () => {
  it("returns the cap less what is counted against it, in tokens", () => {
    // Cap 1,000 USDC; 250.5 USDC owed (incl. deficit) → 749.5 left.
    expect(getDrawHeadroom({ drawCap: 1_000, usedRaw: 250_500_000n }, 6)).toBe(
      749.5,
    );
  });

  it("floors at zero when usage has passed the cap", () => {
    expect(
      getDrawHeadroom({ drawCap: 1_000, usedRaw: 2_000_000_000n }, 6),
    ).toBe(0);
  });

  it("returns null for no cap or an unread usage", () => {
    expect(
      getDrawHeadroom({ drawCap: UNLIMITED_SPOKE_CAP, usedRaw: 0n }, 6),
    ).toBeNull();
    expect(getDrawHeadroom(null, 6)).toBeNull();
  });
});
