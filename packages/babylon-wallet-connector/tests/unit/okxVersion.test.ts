import { expect, test } from "@playwright/test";

import { checkOKXVersion } from "../../src/core/wallets/btc/okx/version";

test.describe("checkOKXVersion — OKX extension version gate (MIN = 4.5.0)", () => {
  test("returns 'ok' for the exact minimum '4.5.0'", () => {
    expect(checkOKXVersion("4.5.0")).toBe("ok");
  });

  test("returns 'ok' for a higher patch '4.5.1'", () => {
    expect(checkOKXVersion("4.5.1")).toBe("ok");
  });

  test("returns 'ok' for a higher minor '4.6.0'", () => {
    expect(checkOKXVersion("4.6.0")).toBe("ok");
  });

  test("returns 'ok' for a higher major '5.0.0'", () => {
    expect(checkOKXVersion("5.0.0")).toBe("ok");
  });

  test("returns 'ok' for '4.10.0' — numeric comparison, not string collation", () => {
    expect(checkOKXVersion("4.10.0")).toBe("ok");
  });

  test("returns 'below' for the previous patch '4.4.99'", () => {
    expect(checkOKXVersion("4.4.99")).toBe("below");
  });

  test("returns 'below' for an older minor '4.4.0'", () => {
    expect(checkOKXVersion("4.4.0")).toBe("below");
  });

  test("returns 'below' for an older major '3.54.12'", () => {
    expect(checkOKXVersion("3.54.12")).toBe("below");
  });

  // Non-canonical strings must NOT parse as 'ok'/'below'; they get a distinct
  // "unable to verify" prompt downstream.
  test("returns 'unparseable' for a v-prefixed version 'v4.5.0'", () => {
    expect(checkOKXVersion("v4.5.0")).toBe("unparseable");
  });

  test("returns 'unparseable' for a prerelease suffix '4.5.0-beta'", () => {
    expect(checkOKXVersion("4.5.0-beta")).toBe("unparseable");
  });

  test("returns 'unparseable' for a build-metadata suffix '4.5.0+abc'", () => {
    expect(checkOKXVersion("4.5.0+abc")).toBe("unparseable");
  });

  test("returns 'unparseable' for a four-part version '4.5.0.123'", () => {
    expect(checkOKXVersion("4.5.0.123")).toBe("unparseable");
  });

  test("returns 'unparseable' for a non-numeric tag 'dev'", () => {
    expect(checkOKXVersion("dev")).toBe("unparseable");
  });

  test("returns 'unparseable' for a two-part string '4.5'", () => {
    expect(checkOKXVersion("4.5")).toBe("unparseable");
  });

  test("returns 'unparseable' for the empty string", () => {
    expect(checkOKXVersion("")).toBe("unparseable");
  });

  test("returns 'unparseable' for undefined (provider returns nothing)", () => {
    expect(checkOKXVersion(undefined)).toBe("unparseable");
  });

  test("returns 'unparseable' for a non-string value (number)", () => {
    expect(checkOKXVersion(4.5)).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero major '04.5.0'", () => {
    expect(checkOKXVersion("04.5.0")).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero minor '4.05.0'", () => {
    expect(checkOKXVersion("4.05.0")).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero patch '4.5.01'", () => {
    expect(checkOKXVersion("4.5.01")).toBe("unparseable");
  });
});
