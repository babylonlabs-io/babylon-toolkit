import { afterEach, describe, expect, it, vi } from "vitest";

import featureFlags from "../featureFlags";

const VP_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VP_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VP_B_CHECKSUMMED = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("featureFlags.allowedVaultProviders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null when the variable is unset, so no provider is filtered", () => {
    // Explicitly unset: a value exported in the developer's shell must not
    // leak into this test's precondition.
    vi.stubEnv("NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS", undefined);
    expect(featureFlags.allowedVaultProviders).toBeNull();
  });

  it("is null when the variable holds only whitespace and separators", () => {
    vi.stubEnv("NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS", " , ,\n");
    expect(featureFlags.allowedVaultProviders).toBeNull();
  });

  it("splits a comma-separated list", () => {
    vi.stubEnv("NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS", `${VP_A},${VP_B}`);
    expect(featureFlags.allowedVaultProviders).toEqual(new Set([VP_A, VP_B]));
  });

  it("splits a space-separated list", () => {
    vi.stubEnv("NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS", `${VP_A} ${VP_B}`);
    expect(featureFlags.allowedVaultProviders).toEqual(new Set([VP_A, VP_B]));
  });

  it("accepts mixed separators with surrounding whitespace", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS",
      `  ${VP_A} ,\t${VP_B}\n`,
    );
    expect(featureFlags.allowedVaultProviders).toEqual(new Set([VP_A, VP_B]));
  });

  it("lowercases checksummed addresses so matching is case-insensitive", () => {
    vi.stubEnv("NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS", VP_B_CHECKSUMMED);
    expect(featureFlags.allowedVaultProviders).toEqual(new Set([VP_B]));
  });

  it("keeps a malformed entry rather than widening the list, so a typo fails closed", () => {
    vi.stubEnv("NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS", "0xnot-an-address");
    expect(featureFlags.allowedVaultProviders).toEqual(
      new Set(["0xnot-an-address"]),
    );
  });
});
