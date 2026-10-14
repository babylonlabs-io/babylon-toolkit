import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LOCAL_NETWORK,
  findRegistryDerivedLeftovers,
  selectNetworkProfile,
} from "../lib/selectNetworkProfile";

describe("selectNetworkProfile", () => {
  it("inlines the named profile for a build", () => {
    const json = selectNetworkProfile({
      name: "e2e-replay",
      isCI: true,
      command: "build",
    });
    expect(JSON.parse(json)).toMatchObject({
      name: "e2e-replay",
      kind: "test",
    });
  });

  it("trims the name but does not fold case", () => {
    expect(
      JSON.parse(
        selectNetworkProfile({
          name: " e2e-replay ",
          isCI: false,
          command: "serve",
        }),
      ).name,
    ).toBe("e2e-replay");
    expect(() =>
      selectNetworkProfile({
        name: "E2E-REPLAY",
        isCI: false,
        command: "build",
      }),
    ).toThrow('Network profile "E2E-REPLAY":');
  });

  it("falls back to devnet with a notice when unset outside CI", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const json = selectNetworkProfile({
      name: undefined,
      isCI: false,
      command: "serve",
    });
    expect(JSON.parse(json).name).toBe(DEFAULT_LOCAL_NETWORK);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'NEXT_PUBLIC_TBV_NETWORK is unset; using "devnet"',
      ),
    );
    warn.mockRestore();
  });

  it("refuses to guess when unset in CI", () => {
    expect(() =>
      selectNetworkProfile({ name: undefined, isCI: true, command: "build" }),
    ).toThrow(
      "NEXT_PUBLIC_TBV_NETWORK is required in CI. Set it to one of: devnet, e2e-replay, staging, testnet-2",
    );
  });

  it("fails a build on an unknown profile", () => {
    expect(() =>
      selectNetworkProfile({ name: "nope", isCI: true, command: "build" }),
    ).toThrow('Network profile "nope": Unknown network profile "nope"');
  });

  it("serves an error marker instead of failing a dev server, so the app can show its modal", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = selectNetworkProfile({
      name: "nope",
      isCI: true,
      command: "serve",
    });
    expect(JSON.parse(json)).toEqual({
      $error: expect.stringContaining('Unknown network profile "nope"'),
    });
    error.mockRestore();
  });
});

describe("findRegistryDerivedLeftovers", () => {
  it("names moved variables present in the process env or a .env file", () => {
    expect(
      findRegistryDerivedLeftovers(
        { NEXT_PUBLIC_ETH_CHAINID: "1", HOME: "/x" },
        { NEXT_PUBLIC_TBV_AAVE_ADAPTER: "0x1" },
      ),
    ).toEqual(["NEXT_PUBLIC_ETH_CHAINID", "NEXT_PUBLIC_TBV_AAVE_ADAPTER"]);
  });

  it("returns an empty list when only live variables are set", () => {
    expect(
      findRegistryDerivedLeftovers({ NEXT_PUBLIC_TBV_NETWORK: "devnet" }, {}),
    ).toEqual([]);
  });
});
