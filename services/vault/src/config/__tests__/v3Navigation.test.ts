/**
 * The v3 nav module decides which sections their own feature flag currently
 * enables, and three call sites depend on that one decision: the sidebar (which
 * item to render), the router's route elements, and the router's subtree
 * guards. These tests cover the decision itself.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFlagDisabledV3SectionPaths,
  getVisibleV3NavGroups,
  isV3SectionEnabled,
} from "../v3Navigation";

const featureFlagsMock = vi.hoisted(() => ({
  isExploreEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

beforeEach(() => {
  featureFlagsMock.isExploreEnabled = true;
});

describe("isV3SectionEnabled", () => {
  it("returns true for a section with no flag of its own", () => {
    featureFlagsMock.isExploreEnabled = false;

    expect(isV3SectionEnabled("vaults")).toBe(true);
    expect(isV3SectionEnabled("overview")).toBe(true);
    expect(isV3SectionEnabled("liquidations")).toBe(true);
  });

  it("follows the explore flag for the explore section", () => {
    expect(isV3SectionEnabled("explore")).toBe(true);

    featureFlagsMock.isExploreEnabled = false;

    expect(isV3SectionEnabled("explore")).toBe(false);
  });
});

describe("getVisibleV3NavGroups", () => {
  it("keeps all six sections in two groups when every flag is on", () => {
    const groups = getVisibleV3NavGroups();

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ["overview", "vaults", "loans", "activity"],
      ["liquidations", "explore"],
    ]);
  });

  it("removes only the flag-disabled section from its group", () => {
    featureFlagsMock.isExploreEnabled = false;

    const groups = getVisibleV3NavGroups();

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ["overview", "vaults", "loans", "activity"],
      ["liquidations"],
    ]);
  });
});

describe("getFlagDisabledV3SectionPaths", () => {
  it("returns nothing when every section's flag is on", () => {
    expect(getFlagDisabledV3SectionPaths()).toEqual([]);
  });

  it("returns bare segments, with no leading slash, for the router's splat guards", () => {
    featureFlagsMock.isExploreEnabled = false;

    expect(getFlagDisabledV3SectionPaths()).toEqual(["explore"]);
  });
});
