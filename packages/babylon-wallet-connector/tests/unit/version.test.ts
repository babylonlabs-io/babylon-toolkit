import { expect, test } from "@playwright/test";

import { isVersionLessThan } from "../../src/core/utils/version";

test.describe("isVersionLessThan", () => {
  test("returns true when first version is less than second", () => {
    expect(isVersionLessThan("3.54.11", "3.54.12")).toBe(true);
    expect(isVersionLessThan("3.53.12", "3.54.12")).toBe(true);
    expect(isVersionLessThan("2.54.12", "3.54.12")).toBe(true);
    expect(isVersionLessThan("3.6.0", "3.54.12")).toBe(true);
  });

  test("returns false when first version is greater than second", () => {
    expect(isVersionLessThan("3.54.13", "3.54.12")).toBe(false);
    expect(isVersionLessThan("3.55.12", "3.54.12")).toBe(false);
    expect(isVersionLessThan("4.54.12", "3.54.12")).toBe(false);
    expect(isVersionLessThan("3.100.0", "3.54.12")).toBe(false);
  });

  test("returns false when versions are equal", () => {
    expect(isVersionLessThan("3.54.12", "3.54.12")).toBe(false);
    expect(isVersionLessThan("1.0.0", "1.0.0")).toBe(false);
  });

  test("handles versions with different lengths", () => {
    expect(isVersionLessThan("3.54", "3.54.12")).toBe(true);
    expect(isVersionLessThan("3.54.12", "3.54")).toBe(false);
    expect(isVersionLessThan("3", "3.0.1")).toBe(true);
    expect(isVersionLessThan("3.0.0", "3")).toBe(false);
  });

  test("handles pre-release suffixes by parsing numeric prefix", () => {
    expect(isVersionLessThan("3.54.12-beta", "3.54.12")).toBe(false);
    expect(isVersionLessThan("3.54.11-beta", "3.54.12")).toBe(true);
    expect(isVersionLessThan("3.54.12-alpha", "3.54.12-beta")).toBe(false);
  });

  test("handles invalid version parts by treating them as 0", () => {
    expect(isVersionLessThan("", "3.54.12")).toBe(true);
    expect(isVersionLessThan("abc", "3.54.12")).toBe(true);
    expect(isVersionLessThan("3.54.12", "")).toBe(false);
  });
});

