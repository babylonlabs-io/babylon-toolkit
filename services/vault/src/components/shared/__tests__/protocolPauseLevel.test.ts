import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({
  isProtocolSoftPaused: false,
  isProtocolFullyPaused: false,
  isDepositDisabled: false,
  isBorrowDisabled: false,
}));
vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

import {
  isBorrowBlocked,
  isDepositBlocked,
  resolveProtocolPauseLevel,
} from "../protocolPauseLevel";

beforeEach(() => {
  featureFlagsMock.isProtocolSoftPaused = false;
  featureFlagsMock.isProtocolFullyPaused = false;
  featureFlagsMock.isDepositDisabled = false;
  featureFlagsMock.isBorrowDisabled = false;
});

describe("resolveProtocolPauseLevel", () => {
  it("returns null when no pause flag is set", () => {
    expect(resolveProtocolPauseLevel()).toBeNull();
  });

  it("returns 'soft' when only soft-paused", () => {
    featureFlagsMock.isProtocolSoftPaused = true;
    expect(resolveProtocolPauseLevel()).toBe("soft");
  });

  it("returns 'hard' when fully paused (wins over soft)", () => {
    featureFlagsMock.isProtocolSoftPaused = true;
    featureFlagsMock.isProtocolFullyPaused = true;
    expect(resolveProtocolPauseLevel()).toBe("hard");
  });
});

describe("isDepositBlocked / isBorrowBlocked", () => {
  it("both false when nothing is set", () => {
    expect(isDepositBlocked()).toBe(false);
    expect(isBorrowBlocked()).toBe(false);
  });

  it("both blocked under soft pause", () => {
    featureFlagsMock.isProtocolSoftPaused = true;
    expect(isDepositBlocked()).toBe(true);
    expect(isBorrowBlocked()).toBe(true);
  });

  it("both blocked under hard pause", () => {
    featureFlagsMock.isProtocolFullyPaused = true;
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
