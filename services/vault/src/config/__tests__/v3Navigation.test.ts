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
  V3_GUARDED_ROUTE_PATHS,
} from "../v3Navigation";

const featureFlagsMock = vi.hoisted(() => ({
  isLiquidationAnalysisChartEnabled: true,
  isExploreEnabled: true,
}));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

beforeEach(() => {
  featureFlagsMock.isLiquidationAnalysisChartEnabled = true;
  featureFlagsMock.isExploreEnabled = true;
});

describe("isV3SectionEnabled", () => {
  it("returns true for a section with no flag of its own", () => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = false;
    featureFlagsMock.isExploreEnabled = false;

    expect(isV3SectionEnabled("vaults")).toBe(true);
    expect(isV3SectionEnabled("overview")).toBe(true);
  });

  it("follows the explore flag for the explore section", () => {
    expect(isV3SectionEnabled("explore")).toBe(true);

    featureFlagsMock.isExploreEnabled = false;

    expect(isV3SectionEnabled("explore")).toBe(false);
  });

  it("follows the liquidation-analysis flag for the liquidations section", () => {
    expect(isV3SectionEnabled("liquidations")).toBe(true);

    featureFlagsMock.isLiquidationAnalysisChartEnabled = false;

    expect(isV3SectionEnabled("liquidations")).toBe(false);
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

  it("drops a group its flags emptied instead of leaving an empty one", () => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = false;
    featureFlagsMock.isExploreEnabled = false;

    const groups = getVisibleV3NavGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.id)).toEqual([
      "overview",
      "vaults",
      "loans",
      "activity",
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

  it("returns every flag-disabled section", () => {
    featureFlagsMock.isLiquidationAnalysisChartEnabled = false;
    featureFlagsMock.isExploreEnabled = false;

    expect(getFlagDisabledV3SectionPaths()).toEqual([
      "liquidations",
      "explore",
    ]);
  });
});

describe("V3_GUARDED_ROUTE_PATHS", () => {
  it("lists every v3 section except the root and activity, as bare segments", () => {
    expect(V3_GUARDED_ROUTE_PATHS).toEqual([
      "vaults",
      "loans",
      "liquidations",
      "explore",
    ]);
  });
});
