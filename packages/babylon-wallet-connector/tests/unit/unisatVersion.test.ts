import { expect, test } from "@playwright/test";

import { checkUnisatVersion } from "../../src/core/wallets/btc/unisat/version";

test.describe("checkUnisatVersion — UniSat extension version gate (MIN = 1.7.14)", () => {
  test("returns 'ok' for the exact minimum '1.7.14'", () => {
    expect(checkUnisatVersion("1.7.14")).toBe("ok");
  });

  test("returns 'ok' for a higher patch '1.7.15'", () => {
    expect(checkUnisatVersion("1.7.15")).toBe("ok");
  });

  test("returns 'ok' for a higher minor '1.8.0'", () => {
    expect(checkUnisatVersion("1.8.0")).toBe("ok");
  });

  test("returns 'ok' for a higher major '2.0.0'", () => {
    expect(checkUnisatVersion("2.0.0")).toBe("ok");
  });

  test("returns 'ok' for '1.10.0' — numeric comparison, not string collation", () => {
    expect(checkUnisatVersion("1.10.0")).toBe("ok");
  });

  test("returns 'below' for the previous patch '1.7.13'", () => {
    expect(checkUnisatVersion("1.7.13")).toBe("below");
  });

  test("returns 'below' for an older minor '1.6.99'", () => {
    expect(checkUnisatVersion("1.6.99")).toBe("below");
  });

  test("returns 'below' for an older major '0.99.99'", () => {
    expect(checkUnisatVersion("0.99.99")).toBe("below");
  });

  // Non-canonical strings must NOT slip through as 'ok' or 'below' — those
  // branches imply we successfully parsed a real version number. Fork or
  // canary builds get a distinct "unable to verify" prompt downstream.
  test("returns 'unparseable' for a v-prefixed version 'v1.7.14'", () => {
    expect(checkUnisatVersion("v1.7.14")).toBe("unparseable");
  });

  test("returns 'unparseable' for a prerelease suffix '1.7.14-beta'", () => {
    expect(checkUnisatVersion("1.7.14-beta")).toBe("unparseable");
  });

  test("returns 'unparseable' for a build-metadata suffix '1.7.14+abc'", () => {
    expect(checkUnisatVersion("1.7.14+abc")).toBe("unparseable");
  });

  test("returns 'unparseable' for a non-numeric tag 'dev'", () => {
    expect(checkUnisatVersion("dev")).toBe("unparseable");
  });

  test("returns 'unparseable' for a two-part string '1.7'", () => {
    expect(checkUnisatVersion("1.7")).toBe("unparseable");
  });

  test("returns 'unparseable' for the empty string", () => {
    expect(checkUnisatVersion("")).toBe("unparseable");
  });

  test("returns 'unparseable' for undefined (e.g. provider returns nothing)", () => {
    expect(checkUnisatVersion(undefined)).toBe("unparseable");
  });

  test("returns 'unparseable' for a non-string value (number)", () => {
    expect(checkUnisatVersion(1.714)).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero major '01.7.14'", () => {
    expect(checkUnisatVersion("01.7.14")).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero minor '1.07.14'", () => {
    expect(checkUnisatVersion("1.07.14")).toBe("unparseable");
  });

  test("returns 'unparseable' for a leading-zero patch '1.7.014'", () => {
    expect(checkUnisatVersion("1.7.014")).toBe("unparseable");
  });

  test("returns 'below' for '0.0.0' — bare '0' components must parse, not get caught by the leading-zero reject", () => {
    expect(checkUnisatVersion("0.0.0")).toBe("below");
  });
});
