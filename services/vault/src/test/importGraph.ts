/**
 * Static import-graph helpers shared by the bundle-boundary guards
 * (`context/deposit/__tests__/pollingImportBoundary.test.ts`,
 * `utils/btc/__tests__/eccLazyBoundary.test.ts`).
 *
 * The traversal deliberately follows only STATIC specifiers: a dynamic
 * `import()` starts a new chunk, so what it reaches is not part of the entry's
 * own eagerly-loaded closure — which is exactly the thing both guards measure.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STATIC_SPECIFIER =
  /(?:import\s+(?!type\b)[\s\S]*?\sfrom\s*|export\s+(?!type\b)[\s\S]*?\sfrom\s*)["']([^"']+)["']/g;
const SIDE_EFFECT_SPECIFIER = /import\s*["']([^"']+)["']/g;

/** Absolute path of `services/vault/src`. */
export const SOURCE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Resolve an in-app specifier (`@/…` or relative) to a file on disk, or `null`
 * for a bare package specifier / unresolvable path.
 */
export function resolveVaultImport(
  from: string,
  specifier: string,
): string | null {
  const candidate = specifier.startsWith("@/")
    ? resolve(SOURCE_ROOT, specifier.slice(2))
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

/**
 * Every module statically reachable from `entry`, mapped to the raw specifiers
 * that module imports.
 */
export function runtimeClosure(entry: string): Map<string, Set<string>> {
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
