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
    ? [candidate.replace(/\.js$/, ".ts"), `${candidate}.ts`, candidate]
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

interface RuntimeClosureEntry {
  chain: string[];
  specifiers: Set<string>;
}

function runtimeClosure(entry: string): Map<string, RuntimeClosureEntry> {
  const pending = [{ file: entry, chain: [entry] }];
  const visited = new Map<string, RuntimeClosureEntry>();
  while (pending.length > 0) {
    const { file, chain } = pending.pop()!;
    if (visited.has(file)) continue;
    const source = readFileSync(file, "utf8");
    const specifiers = new Set<string>();
    for (const pattern of [
      STATIC_SPECIFIER,
      SIDE_EFFECT_SPECIFIER,
      DYNAMIC_SPECIFIER,
    ]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        specifiers.add(specifier);
        if (specifier.startsWith(".")) {
          const dependency = resolveLocalImport(file, specifier);
          if (!dependency) {
            throw new Error(`Could not resolve ${specifier} from ${file}`);
          }
          pending.push({ file: dependency, chain: [...chain, dependency] });
        }
      }
    }
    visited.set(file, { chain, specifiers });
  }
  return visited;
}

function runtimeBoundaryViolations(entry: string): string[] {
  return Array.from(
    runtimeClosure(entry).values(),
    ({ chain, specifiers }) =>
      Array.from(specifiers)
        .filter(isBannedRuntimeImport)
        .map((specifier) => [...chain, specifier].join(" -> ")),
  ).flat();
}

describe("dependency-clean package subpath boundaries", () => {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const entries = [
    resolve(currentDirectory, "../index.ts"),
    resolve(currentDirectory, "../../../utils/eth/index.ts"),
    resolve(currentDirectory, "../../mempool/index.ts"),
    resolve(currentDirectory, "../../vault-provider/status/index.ts"),
    resolve(currentDirectory, "../../../contracts/index.ts"),
  ];

  for (const entry of entries) {
    it(`${entry.split("/").slice(-4).join("/")} has no Bitcoin or WASM runtime import`, () => {
      expect(runtimeBoundaryViolations(entry)).toEqual([]);
    });
  }

  it("reports the full import chain for a contaminated entry", () => {
    const fixtureRoot = resolve(
      currentDirectory,
      "../../../../../../scripts/fixtures/eth-import-boundary",
    );
    const entry = resolve(fixtureRoot, "entry.js");
    const intermediate = resolve(fixtureRoot, "intermediate.js");

    expect(runtimeBoundaryViolations(entry)).toEqual([
      [entry, intermediate, "bitcoinjs-lib"].join(" -> "),
    ]);
  });

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

  it("marks only the lazily loaded WASM engine as an optional peer", () => {
    const packageJson = JSON.parse(
      readFileSync(
        resolve(currentDirectory, "../../../../../../package.json"),
        "utf8",
      ),
    ) as { peerDependenciesMeta: Record<string, { optional?: boolean }> };

    expect(packageJson.peerDependenciesMeta).toEqual({
      "@babylonlabs-io/babylon-tbv-rust-wasm": { optional: true },
    });
  });
});
