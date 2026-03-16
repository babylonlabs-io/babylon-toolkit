import { describe, expect, it } from "vitest";

import { getVerifiedProvider } from "@babylonlabs-io/tbv-registry/vault-provider";

describe("verifiedProviderRegistry", () => {
  it("returns undefined for an address not in the registry", () => {
    expect(
      getVerifiedProvider("0x0000000000000000000000000000000000000000"),
    ).toBeUndefined();
  });

  it("returns the entry for a registered address", () => {
    const entry = getVerifiedProvider(
      "0x7c310c9e42b2e1e4b5dee2e702f83d5667f2d3d3",
    );
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Babylon Labs Vault Provider");
    expect(entry!.active).toBe(true);
  });

  it("performs case-insensitive lookup", () => {
    const lower = getVerifiedProvider(
      "0x7c310c9e42b2e1e4b5dee2e702f83d5667f2d3d3",
    );
    const upper = getVerifiedProvider(
      "0x7C310C9E42B2E1E4B5DEE2E702F83D5667F2D3D3",
    );
    expect(lower).toEqual(upper);
    expect(lower).toBeDefined();
  });
});
