import { describe, expect, it } from "vitest";

import {
  allInBorrowAprPercent,
  premiumFractionFromShares,
} from "../allInBorrowApr";

describe("allInBorrowAprPercent", () => {
  it("adds the premium and interest fee to the base rate without compounding them", () => {
    // 5 * (1 + 0.1 + 0.03) = 5.65. Compounding would give 5 * 1.1 * 1.03 = 5.665.
    expect(
      allInBorrowAprPercent({
        baseAprPercent: 5,
        premiumFraction: 0.1,
        interestFeeBps: 300,
      }),
    ).toBeCloseTo(5.65, 10);
  });

  it("keeps the base rate when the premium and fee are both zero", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: 5,
        premiumFraction: 0,
        interestFeeBps: 0,
      }),
    ).toBe(5);
  });

  it("treats a zero premium as known, still charging the fee", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: 5,
        premiumFraction: 0,
        interestFeeBps: 300,
      }),
    ).toBeCloseTo(5.15, 10);
  });

  it("treats a zero base rate as known rather than missing", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: 0,
        premiumFraction: 0.1,
        interestFeeBps: 300,
      }),
    ).toBe(0);
  });

  it("returns null when the base rate failed to read", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: null,
        premiumFraction: 0.1,
        interestFeeBps: 300,
      }),
    ).toBeNull();
  });

  it("returns null while the base rate has not loaded", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: undefined,
        premiumFraction: 0.1,
        interestFeeBps: 300,
      }),
    ).toBeNull();
  });

  it("returns null when the premium is missing", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: 5,
        premiumFraction: null,
        interestFeeBps: 300,
      }),
    ).toBeNull();
  });

  it("returns null when the interest fee is missing", () => {
    expect(
      allInBorrowAprPercent({
        baseAprPercent: 5,
        premiumFraction: 0.1,
        interestFeeBps: null,
      }),
    ).toBeNull();
  });
});

describe("premiumFractionFromShares", () => {
  it("is the position's premium shares over its drawn shares", () => {
    expect(
      premiumFractionFromShares({
        drawnShares: 1_000_000_000n,
        premiumShares: 100_000_000n,
      }),
    ).toBe(0.1);
  });

  it("is zero when the position has no premium shares", () => {
    expect(
      premiumFractionFromShares({
        drawnShares: 1_000_000_000n,
        premiumShares: 0n,
      }),
    ).toBe(0);
  });

  it("is null without drawn shares rather than dividing by zero", () => {
    expect(
      premiumFractionFromShares({ drawnShares: 0n, premiumShares: 5n }),
    ).toBeNull();
  });
});
