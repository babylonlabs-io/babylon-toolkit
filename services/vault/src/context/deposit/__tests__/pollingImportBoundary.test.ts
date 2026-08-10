import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BANNED_RUNTIME_IMPORTS = new Set([
  "@babylonlabs-io/ts-sdk/tbv/core",
  "@babylonlabs-io/ts-sdk/tbv/core/clients",
  "@babylonlabs-io/ts-sdk/tbv/core/utils",
  "@babylonlabs-io/babylon-tbv-rust-wasm",
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
]);

const STATIC_SPECIFIER =
  /(?:import\s+(?!type\b)[\s\S]*?\sfrom\s*|export\s+(?!type\b)[\s\S]*?\sfrom\s*)["']([^"']+)["']/g;
const SIDE_EFFECT_SPECIFIER = /import\s*["']([^"']+)["']/g;

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(currentDirectory, "../../..");

function resolveVaultImport(from: string, specifier: string): string | null {
  const candidate = specifier.startsWith("@/")
    ? resolve(sourceRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (!candidate) return null;

  const candidates = [
    candidate,
    candidate.replace(/\.js$/, ".ts"),
    `${candidate}.ts`,
    `${candidate}.tsx`,
    resolve(candidate, "index.ts"),
    resolve(candidate, "index.tsx"),
  ];
  for (const path of candidates) {
    try {
      readFileSync(path);
      return path;
    } catch {
      // Non-code assets and unresolved optional files end traversal here.
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
        const dependency = resolveVaultImport(file, specifier);
        if (dependency) pending.push(dependency);
      }
    }
    visited.set(file, specifiers);
  }
  return visited;
}

describe("ETH-session import boundaries", () => {
  const entries = [
    resolve(sourceRoot, "main.tsx"),
    resolve(sourceRoot, "context/deposit/PeginPollingContext.tsx"),
    resolve(sourceRoot, "hooks/usePegoutPolling.ts"),
    resolve(sourceRoot, "services/activity/claimTxResolver.ts"),
    resolve(sourceRoot, "applications/aave/hooks/useAaveVaults.ts"),
    resolve(sourceRoot, "applications/aave/utils/payoutAddresses.ts"),
  ];

  for (const entry of entries) {
    it(`${relative(sourceRoot, entry)} avoids broad BTC/auth runtime barrels`, () => {
      const violations = Array.from(
        runtimeClosure(entry),
        ([file, specifiers]) =>
          Array.from(specifiers)
            .filter((specifier) => BANNED_RUNTIME_IMPORTS.has(specifier))
            .map(
              (specifier) => `${relative(sourceRoot, file)} -> ${specifier}`,
            ),
      ).flat();

      expect(violations).toEqual([]);
    });
  }
});
