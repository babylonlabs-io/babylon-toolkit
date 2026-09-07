import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("dependency-clean package subpath boundaries", () => {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));

  it("publishes dependency-clean subpaths with matching type/CJS/ESM entries", () => {
    const packageJson = JSON.parse(
      readFileSync(
        resolve(currentDirectory, "../../../../../../package.json"),
        "utf8",
      ),
    ) as { exports: Record<string, Record<string, string>> };
    const subpaths = {
      "./tbv/core/clients/eth": "/clients/eth/index",
      "./tbv/core/utils/eth": "/utils/eth/index",
      "./tbv/core/clients/mempool": "/clients/mempool/index",
      "./tbv/core/clients/vault-provider/status":
        "/clients/vault-provider/status/index",
      "./tbv/core/contracts": "/contracts/index",
    };
    for (const [subpath, emittedPath] of Object.entries(subpaths)) {
      expect(packageJson.exports[subpath]).toEqual({
        types: expect.stringContaining(`${emittedPath}.d.ts`),
        require: expect.stringContaining(`${emittedPath}.cjs`),
        import: expect.stringContaining(`${emittedPath}.js`),
      });
    }
  });

  it("pins the required and optional peer policy", () => {
    const packageJson = JSON.parse(
      readFileSync(
        resolve(currentDirectory, "../../../../../../package.json"),
        "utf8",
      ),
    ) as {
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional?: boolean }>;
    };

    expect(packageJson.peerDependencies).toEqual({
      "@babylonlabs-io/babylon-tbv-rust-wasm": "workspace:*",
      "@bitcoin-js/tiny-secp256k1-asmjs": "2.2.3",
      "bitcoinjs-lib": "6.1.7",
      viem: "^2.38.2",
    });
    expect(packageJson.peerDependenciesMeta).toEqual({
      "@babylonlabs-io/babylon-tbv-rust-wasm": { optional: true },
      "@bitcoin-js/tiny-secp256k1-asmjs": { optional: true },
      "bitcoinjs-lib": { optional: true },
    });
  });
});
