import { describe, expect, it } from "vitest";

import { evaluateManifest, extractEnvNames } from "../lib/envManifest";

const MANIFEST = {
  "release-required": ["NEXT_PUBLIC_TBV_NETWORK"],
  "release-optional": ["NEXT_PUBLIC_FF_DISABLE_BORROW"],
  "build-only": ["NEXT_PUBLIC_CANONICAL"],
  "dev-test-only": ["NEXT_PUBLIC_FF_GOD_MODE_PANEL"],
  removed: ["NEXT_PUBLIC_BTC_NETWORK"],
};
const OK = {
  manifest: MANIFEST,
  sourceNames: [
    "NEXT_PUBLIC_TBV_NETWORK",
    "NEXT_PUBLIC_FF_DISABLE_BORROW",
    "NEXT_PUBLIC_CANONICAL",
    "NEXT_PUBLIC_FF_GOD_MODE_PANEL",
  ],
  workflowNames: [
    "NEXT_PUBLIC_TBV_NETWORK",
    "NEXT_PUBLIC_FF_DISABLE_BORROW",
    "NEXT_PUBLIC_CANONICAL",
  ],
  nxInputNames: [
    "NEXT_PUBLIC_TBV_NETWORK",
    "NEXT_PUBLIC_FF_DISABLE_BORROW",
    "NEXT_PUBLIC_CANONICAL",
  ],
};

describe("evaluateManifest", () => {
  it("passes a consistent set", () => {
    expect(evaluateManifest(OK)).toEqual([]);
  });

  it("flags a source read that the manifest does not list", () => {
    expect(
      evaluateManifest({
        ...OK,
        sourceNames: [...OK.sourceNames, "NEXT_PUBLIC_NEW"],
      }),
    ).toEqual([
      "NEXT_PUBLIC_NEW is read by the app but not listed in env-manifest.json",
    ]);
  });

  it("flags a removed name that is still read", () => {
    expect(
      evaluateManifest({
        ...OK,
        sourceNames: [...OK.sourceNames, "NEXT_PUBLIC_BTC_NETWORK"],
      }),
    ).toEqual([
      "NEXT_PUBLIC_BTC_NETWORK is listed as removed but still read by the app",
    ]);
  });

  it("flags a required name the workflow does not pass", () => {
    expect(
      evaluateManifest({
        ...OK,
        workflowNames: [
          "NEXT_PUBLIC_FF_DISABLE_BORROW",
          "NEXT_PUBLIC_CANONICAL",
        ],
      }),
    ).toEqual([
      "NEXT_PUBLIC_TBV_NETWORK is release-required but service-release-vault.yml does not pass it",
    ]);
  });

  it("flags a removed or dev-only name the workflow passes", () => {
    expect(
      evaluateManifest({
        ...OK,
        workflowNames: [...OK.workflowNames, "NEXT_PUBLIC_FF_GOD_MODE_PANEL"],
      }),
    ).toEqual([
      "NEXT_PUBLIC_FF_GOD_MODE_PANEL is dev-test-only but service-release-vault.yml passes it",
    ]);
  });

  it("flags a workflow name the manifest does not know", () => {
    expect(
      evaluateManifest({
        ...OK,
        workflowNames: [...OK.workflowNames, "NEXT_PUBLIC_MYSTERY"],
      }),
    ).toEqual([
      "NEXT_PUBLIC_MYSTERY is passed by service-release-vault.yml but not listed in env-manifest.json",
    ]);
  });

  it("requires the Nx build inputs to equal the release and build-only names", () => {
    expect(
      evaluateManifest({ ...OK, nxInputNames: ["NEXT_PUBLIC_TBV_NETWORK"] }),
    ).toEqual([
      "project.json build inputs must list exactly the release-required, release-optional and build-only names; missing: NEXT_PUBLIC_FF_DISABLE_BORROW, NEXT_PUBLIC_CANONICAL",
    ]);
  });

  it("flags a name in two classes", () => {
    const manifest = {
      ...MANIFEST,
      removed: ["NEXT_PUBLIC_BTC_NETWORK", "NEXT_PUBLIC_CANONICAL"],
    };
    expect(evaluateManifest({ ...OK, manifest })).toEqual([
      "NEXT_PUBLIC_CANONICAL appears in more than one class of env-manifest.json",
    ]);
  });
});

describe("extractEnvNames", () => {
  it("captures names with digits and skips prefix-only mentions", () => {
    expect(
      extractEnvNames(
        "process.env.NEXT_PUBLIC_TBV_E2E_SPECULOS_URL; // prefixed with NEXT_PUBLIC_FF_ and NEXT_PUBLIC_",
      ),
    ).toEqual(["NEXT_PUBLIC_TBV_E2E_SPECULOS_URL"]);
  });
});
