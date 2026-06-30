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
  isBorrowBlocked,
  isDepositBlocked,
  isReorderBlocked,
  resolveProtocolStatus,
} from "../protocolStatus";

beforeEach(() => {
  featureFlagsMock.isProtocolFrozen = false;
  featureFlagsMock.isProtocolPaused = false;
  featureFlagsMock.isDepositDisabled = false;
  featureFlagsMock.isBorrowDisabled = false;
});

describe("resolveProtocolStatus", () => {
  it("returns null when no status flag is set", () => {
    expect(resolveProtocolStatus()).toBeNull();
  });

  it("returns 'frozen' when only frozen", () => {
    featureFlagsMock.isProtocolFrozen = true;
    expect(resolveProtocolStatus()).toBe("frozen");
  });

  it("returns 'paused' when paused (wins over frozen)", () => {
    featureFlagsMock.isProtocolFrozen = true;
    featureFlagsMock.isProtocolPaused = true;
    expect(resolveProtocolStatus()).toBe("paused");
  });
});

describe("isDepositBlocked / isBorrowBlocked", () => {
  it("both false when nothing is set", () => {
    expect(isDepositBlocked()).toBe(false);
    expect(isBorrowBlocked()).toBe(false);
  });

  it("both blocked when frozen", () => {
    featureFlagsMock.isProtocolFrozen = true;
    expect(isDepositBlocked()).toBe(true);
    expect(isBorrowBlocked()).toBe(true);
  });

  it("both blocked when paused", () => {
    featureFlagsMock.isProtocolPaused = true;
    expect(isDepositBlocked()).toBe(true);
    expect(isBorrowBlocked()).toBe(true);
  });

  it("respects the standalone DISABLE_DEPOSIT / DISABLE_BORROW kill-switches independently", () => {
    featureFlagsMock.isDepositDisabled = true;
    expect(isDepositBlocked()).toBe(true);
    expect(isBorrowBlocked()).toBe(false);

    featureFlagsMock.isDepositDisabled = false;
    featureFlagsMock.isBorrowDisabled = true;
    expect(isDepositBlocked()).toBe(false);
    expect(isBorrowBlocked()).toBe(true);
  });
});

describe("isReorderBlocked", () => {
  it("false when nothing is set", () => {
    expect(isReorderBlocked()).toBe(false);
  });

  it("blocked when frozen (reorder is an Aave-scope new-entry action)", () => {
    featureFlagsMock.isProtocolFrozen = true;
    expect(isReorderBlocked()).toBe(true);
  });

  it("blocked when paused", () => {
    featureFlagsMock.isProtocolPaused = true;
    expect(isReorderBlocked()).toBe(true);
  });

  it("ignores the deposit/borrow kill-switches — it is governance-gated only", () => {
    featureFlagsMock.isDepositDisabled = true;
    featureFlagsMock.isBorrowDisabled = true;
    expect(isReorderBlocked()).toBe(false);
  });
});
