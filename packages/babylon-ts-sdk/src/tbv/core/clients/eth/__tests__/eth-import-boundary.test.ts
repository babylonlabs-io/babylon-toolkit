import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BANNED_RUNTIME_IMPORTS = new Set([
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@babylonlabs-io/babylon-tbv-rust-wasm",
]);

const STATIC_SPECIFIER =
  /(?:import\s+(?!type\b)[\s\S]*?\sfrom\s*|export\s+(?!type\b)[\s\S]*?\sfrom\s*)["']([^"']+)["']/g;
const SIDE_EFFECT_SPECIFIER = /import\s*["']([^"']+)["']/g;
const DYNAMIC_SPECIFIER = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

function isBannedRuntimeImport(specifier: string): boolean {
  return Array.from(BANNED_RUNTIME_IMPORTS).some(
    (dependency) =>
      specifier === dependency || specifier.startsWith(`${dependency}/`),
  );
}

function resolveLocalImport(from: string, specifier: string): string | null {
  const candidate = resolve(dirname(from), specifier);
  const candidates = extname(candidate)
    ? [candidate.replace(/\.js$/, ".ts"), `${candidate}.ts`]
    : [`${candidate}.ts`, resolve(candidate, "index.ts")];
  for (const path of candidates) {
    try {
      readFileSync(path);
      return path;
    } catch {
      // Try the next TypeScript resolution candidate.
    }
  }
  return null;
}

function runtimeClosure(entry: string): Map<string, Set<string>> {
  const pending = [entry];
  const visited = new Map<string, Set<string>>();
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    const source = readFileSync(file, "utf8");
    const specifiers = new Set<string>();
    for (const pattern of [STATIC_SPECIFIER, SIDE_EFFECT_SPECIFIER]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        specifiers.add(specifier);
        if (specifier.startsWith(".")) {
          const dependency = resolveLocalImport(file, specifier);
          if (!dependency) {
            throw new Error(`Could not resolve ${specifier} from ${file}`);
          }
          pending.push(dependency);
        }
      }
    }
    for (const match of source.matchAll(DYNAMIC_SPECIFIER)) {
      specifiers.add(match[1]);
    }
    visited.set(file, specifiers);
  }
  return visited;
}

describe("dependency-clean package subpath boundaries", () => {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const entries = [
    resolve(currentDirectory, "../index.ts"),
    resolve(currentDirectory, "../../../utils/eth/index.ts"),
    resolve(currentDirectory, "../../mempool/index.ts"),
    resolve(currentDirectory, "../../vault-provider/status/index.ts"),
  ];

  for (const entry of entries) {
    it(`${entry.split("/").slice(-4).join("/")} has no Bitcoin or WASM runtime import`, () => {
      const closure = runtimeClosure(entry);
      const violations = Array.from(closure, ([file, specifiers]) =>
        Array.from(specifiers)
          .filter(isBannedRuntimeImport)
          .map((specifier) => `${file} -> ${specifier}`),
      ).flat();
      expect(violations).toEqual([]);
    });
  }

  it("publishes dependency-clean subpaths with matching type/CJS/ESM entries", () => {
    const packageJson = JSON.parse(
      readFileSync(
        resolve(currentDirectory, "../../../../../../package.json"),
        "utf8",
      ),
    ) as {
      exports: Record<string, Record<string, string>>;
      peerDependenciesMeta: Record<string, { optional?: boolean }>;
    };
    const subpaths = {
      "./tbv/core/clients/eth": "/clients/eth/index",
      "./tbv/core/utils/eth": "/utils/eth/index",
      "./tbv/core/clients/mempool": "/clients/mempool/index",
      "./tbv/core/clients/vault-provider/status":
        "/clients/vault-provider/status/index",
    };
    for (const [subpath, emittedPath] of Object.entries(subpaths)) {
      expect(packageJson.exports[subpath]).toEqual({
        types: expect.stringContaining(`${emittedPath}.d.ts`),
        require: expect.stringContaining(`${emittedPath}.cjs`),
        import: expect.stringContaining(`${emittedPath}.js`),
      });
    }
    for (const dependency of BANNED_RUNTIME_IMPORTS) {
      expect(packageJson.peerDependenciesMeta[dependency]?.optional).toBe(true);
    }
  });
});
