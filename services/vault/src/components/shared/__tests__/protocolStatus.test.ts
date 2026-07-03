import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  isProtocolFrozen: false,
  isProtocolPaused: false,
  isDepositDisabled: false,
  isBorrowDisabled: false,
}));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

import {
  composeGateState,
  isActivationBlocked,
  isBorrowBlocked,
  isDepositBlocked,
  isReorderBlocked,
  isRepayBlocked,
  isWithdrawBlocked,
  maxSeverity,
  resolveBannerStatus,
  type ProtocolGateState,
  type ScopeStatus,
} from "../protocolStatus";

function gate(
  protocol: ScopeStatus,
  aave: ScopeStatus = null,
): ProtocolGateState {
  return { protocol, aave };
}

beforeEach(() => {
  featureFlagsMock.isProtocolFrozen = false;
  featureFlagsMock.isProtocolPaused = false;
  featureFlagsMock.isDepositDisabled = false;
  featureFlagsMock.isBorrowDisabled = false;
});

describe("maxSeverity", () => {
  it("ranks paused > frozen > null", () => {
    expect(maxSeverity("frozen", "paused")).toBe("paused");
    expect(maxSeverity("frozen", null)).toBe("frozen");
    expect(maxSeverity(null, null)).toBeNull();
  });
});

describe("composeGateState — operator override", () => {
  it("uses the on-chain status when no operator flag is set", () => {
    expect(composeGateState({ protocol: "paused", aave: null })).toEqual({
      protocol: "paused",
      aave: null,
    });
  });

  it("falls back to the operator flag when on-chain is null (e.g. read failed)", () => {
    featureFlagsMock.isProtocolPaused = true;
    expect(composeGateState(null)).toEqual({
      protocol: "paused",
      aave: "paused",
    });
  });

  it("takes the more severe of on-chain and operator per scope", () => {
    featureFlagsMock.isProtocolFrozen = true; // global frozen override
    expect(composeGateState({ protocol: null, aave: "paused" })).toEqual({
      protocol: "frozen",
      aave: "paused",
    });
  });

  it("does not block exits on a failed read unless an operator flag is set", () => {
    // on-chain null (read failed) + no operator flag → nothing blocked.
    const g = composeGateState(null);
    expect(isWithdrawBlocked(g)).toBe(false);
    expect(isRepayBlocked(g)).toBe(false);
    expect(isActivationBlocked(g)).toBe(false);
  });
});

describe("entry gating — blocks on any non-null status for its scope", () => {
  it("deposit is protocol-scope (frozen OR paused)", () => {
    expect(isDepositBlocked(gate(null))).toBe(false);
    expect(isDepositBlocked(gate("frozen"))).toBe(true);
    expect(isDepositBlocked(gate("paused"))).toBe(true);
    // An aave-scope status does NOT block deposit.
    expect(isDepositBlocked(gate(null, "paused"))).toBe(false);
  });

  it("borrow is aave-scope (frozen OR paused)", () => {
    expect(isBorrowBlocked(gate(null, null))).toBe(false);
    expect(isBorrowBlocked(gate(null, "frozen"))).toBe(true);
    expect(isBorrowBlocked(gate(null, "paused"))).toBe(true);
    // A protocol-scope status does NOT block borrow.
    expect(isBorrowBlocked(gate("paused", null))).toBe(false);
  });

  it("reorder is aave-scope (frozen OR paused)", () => {
    expect(isReorderBlocked(gate(null, null))).toBe(false);
    expect(isReorderBlocked(gate(null, "frozen"))).toBe(true);
    expect(isReorderBlocked(gate(null, "paused"))).toBe(true);
    expect(isReorderBlocked(gate("paused", null))).toBe(false);
  });

  it("honors the standalone DISABLE_DEPOSIT / DISABLE_BORROW kill-switches", () => {
    featureFlagsMock.isDepositDisabled = true;
    expect(isDepositBlocked(gate(null, null))).toBe(true);
    expect(isBorrowBlocked(gate(null, null))).toBe(false);

    featureFlagsMock.isDepositDisabled = false;
    featureFlagsMock.isBorrowDisabled = true;
    expect(isBorrowBlocked(gate(null, null))).toBe(true);
    expect(isDepositBlocked(gate(null, null))).toBe(false);
  });
});

describe("exit gating — blocks only on PAUSE (Freeze preserves exits)", () => {
  it("Freeze never blocks any exit", () => {
    const frozen = gate("frozen", "frozen");
    expect(isWithdrawBlocked(frozen)).toBe(false);
    expect(isActivationBlocked(frozen)).toBe(false);
    expect(isRepayBlocked(frozen)).toBe(false);
  });

  it("withdraw is blocked if EITHER scope is paused", () => {
    expect(isWithdrawBlocked(gate(null, null))).toBe(false);
    expect(isWithdrawBlocked(gate("paused", null))).toBe(true);
    expect(isWithdrawBlocked(gate(null, "paused"))).toBe(true);
  });

  it("activation is blocked if EITHER scope is paused", () => {
    expect(isActivationBlocked(gate(null, null))).toBe(false);
    expect(isActivationBlocked(gate("paused", null))).toBe(true);
    expect(isActivationBlocked(gate(null, "paused"))).toBe(true);
  });

  it("repay is blocked ONLY by an aave pause (not a protocol pause)", () => {
    expect(isRepayBlocked(gate(null, null))).toBe(false);
    expect(isRepayBlocked(gate(null, "paused"))).toBe(true);
    // Protocol-only pause must keep repay available — the user can still de-risk.
    expect(isRepayBlocked(gate("paused", null))).toBe(false);
  });
});

describe("resolveBannerStatus", () => {
  it("summarizes the most severe scope status", () => {
    expect(resolveBannerStatus(gate(null, null))).toBeNull();
    expect(resolveBannerStatus(gate("frozen", null))).toBe("frozen");
    expect(resolveBannerStatus(gate("frozen", "paused"))).toBe("paused");
  });
});
