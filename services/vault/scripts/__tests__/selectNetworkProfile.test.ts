import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LOCAL_NETWORK,
  findDotenvSelector,
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
      "NEXT_PUBLIC_TBV_NETWORK is required in CI. Set it to one of: devnet, e2e-replay, staging, testnet",
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

describe("findDotenvSelector", () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "vault-dotenv-"));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it("names every dotenv file Vite or Nx would read that assigns the selector", () => {
    const project = tempDir();
    const workspace = tempDir();
    writeFileSync(join(project, ".env"), "NEXT_PUBLIC_TBV_NETWORK=testnet\n");
    writeFileSync(
      join(project, ".env.build.local"),
      "export NEXT_PUBLIC_TBV_NETWORK = staging\n",
    );
    writeFileSync(
      join(workspace, ".local.env"),
      "NEXT_PUBLIC_TBV_NETWORK=devnet\n",
    );
    writeFileSync(
      join(workspace, ".env.local"),
      "NEXT_PUBLIC_REOWN_PROJECT_ID=x\n",
    );

    expect(findDotenvSelector([project, workspace])).toEqual(
      [
        join(project, ".env"),
        join(project, ".env.build.local"),
        join(workspace, ".local.env"),
      ].sort(),
    );
  });

  it("ignores a commented-out selector, non-dotenv files and directories", () => {
    const project = tempDir();
    writeFileSync(
      join(project, ".env.example"),
      "# NEXT_PUBLIC_TBV_NETWORK=devnet\nNEXT_PUBLIC_MEMPOOL_API=https://mempool.space\n",
    );
    writeFileSync(
      join(project, "notes.txt"),
      "NEXT_PUBLIC_TBV_NETWORK=devnet\n",
    );
    mkdirSync(join(project, ".env.d"));

    expect(findDotenvSelector([project])).toEqual([]);
  });

  it("treats a missing directory as having no dotenv files", () => {
    expect(
      findDotenvSelector([join(tmpdir(), "vault-dotenv-missing")]),
    ).toEqual([]);
  });
});
