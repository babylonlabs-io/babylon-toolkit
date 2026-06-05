import { expect, test } from "@playwright/test";

import { checkOneKeyVersion } from "../../src/core/wallets/btc/onekey/version";

test.describe("checkOneKeyVersion — OneKey app version gate (MIN = 6.3.0)", () => {
  test("returns 'ok' for the exact minimum '6.3.0'", () => {
    expect(checkOneKeyVersion("6.3.0")).toBe("ok");
  });

  test("returns 'ok' for a higher patch '6.3.1'", () => {
    expect(checkOneKeyVersion("6.3.1")).toBe("ok");
  });

  test("returns 'ok' for a higher minor '6.4.0'", () => {
    expect(checkOneKeyVersion("6.4.0")).toBe("ok");
  });

  test("returns 'ok' for a higher major '7.0.0'", () => {
    expect(checkOneKeyVersion("7.0.0")).toBe("ok");
  });

  test("returns 'ok' for '6.10.0' — numeric comparison, not string collation", () => {
    expect(checkOneKeyVersion("6.10.0")).toBe("ok");
  });

  test("returns 'below' for the previous patch '6.2.99'", () => {
    expect(checkOneKeyVersion("6.2.99")).toBe("below");
  });

  test("returns 'below' for an older minor '6.2.0'", () => {
    expect(checkOneKeyVersion("6.2.0")).toBe("below");
  });

  test("returns 'below' for an older major '5.99.99'", () => {
    expect(checkOneKeyVersion("5.99.99")).toBe("below");
  });

  // Non-canonical strings must NOT slip through as 'ok' or 'below' — those
  // branches imply we successfully parsed a real version number. A
  // `$walletInfo` cache that has not populated (undefined) or a fork build
  // gets a distinct "unable to verify" prompt downstream.
  test("returns 'unparseable' for a v-prefixed version 'v6.3.0'", () => {
    expect(checkOneKeyVersion("v6.3.0")).toBe("unparseable");
  });

  test("returns 'unparseable' for a prerelease suffix '6.3.0-beta'", () => {
    expect(checkOneKeyVersion("6.3.0-beta")).toBe("unparseable");
  });

  test("returns 'unparseable' for a build-metadata suffix '6.3.0+abc'", () => {
    expect(checkOneKeyVersion("6.3.0+abc")).toBe("unparseable");
  });

  test("returns 'unparseable' for a four-part version '6.3.0.123'", () => {
    expect(checkOneKeyVersion("6.3.0.123")).toBe("unparseable");
  });

  test("returns 'unparseable' for a non-numeric tag 'dev'", () => {
    expect(checkOneKeyVersion("dev")).toBe("unparseable");
  });

  test("returns 'unparseable' for a two-part string '6.3'", () => {
    expect(checkOneKeyVersion("6.3")).toBe("unparseable");
  });

  test("returns 'unparseable' for the empty string", () => {
    expect(checkOneKeyVersion("")).toBe("unparseable");
  });

  test("returns 'unparseable' for undefined ($walletInfo not populated yet)", () => {
    expect(checkOneKeyVersion(undefined)).toBe("unparseable");
  });

  test("returns 'unparseable' for a non-string value (number)", () => {
    expect(checkOneKeyVersion(6.3)).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero major '06.3.0'", () => {
    expect(checkOneKeyVersion("06.3.0")).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero minor '6.03.0'", () => {
    expect(checkOneKeyVersion("6.03.0")).toBe("unparseable");
  });
});
