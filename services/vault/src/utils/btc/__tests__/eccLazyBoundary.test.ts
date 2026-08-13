/**
 * Mirror of `context/deposit/__tests__/pollingImportBoundary.test.ts`.
 *
 * That guard protects the ETH direction (an ETH-only session must not download
 * the BTC stack). This one protects the BTC direction: `initEccLib` is no
 * longer called unconditionally in `main.tsx`, it is a convention held by the
 * chunk roots that call `ensureBtcEccInitialized()`. Nothing enforces it — the
 * next component that reaches a PSBT builder from a lazy chunk that skipped the
 * await throws at runtime with no compile error.
 *
 * The rule: if a `lazy(…)` / `lazyWithRetry(…)` chunk statically reaches
 * Bitcoin transaction primitives, the same factory must await
 * `ensureBtcEccInitialized`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveVaultImport,
  runtimeClosure,
  SOURCE_ROOT,
} from "@/test/importGraph";

/**
 * Imports whose execution depends on `initEccLib` having run: bitcoinjs-lib
 * itself, its ECC implementation, the WASM transaction builder, and the SDK
 * subpath holding the BTC transaction primitives (`signing`, `calculateBtcTxHash`,
 * `getPsbtInputFields`, UTXO selection).
 *
 * `…/tbv/core/primitives` is included: it is the home of the PSBT builders,
 * every one of which asserts the curve is registered.
 *
 * The broad `@babylonlabs-io/ts-sdk/tbv/core` barrel is deliberately NOT here:
 * it is also the home of the error-classification guards that `utils/errors/
 * depositErrors.ts` imports, so every ETH-only route chunk reaches it without
 * ever touching ECC. Sibling ETH-only subpaths (`…/core/utils/eth`) are
 * likewise excluded — matching is exact, not by prefix.
 */
const ECC_DEPENDENT_IMPORTS = new Set([
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@babylonlabs-io/babylon-tbv-rust-wasm",
  "@babylonlabs-io/ts-sdk/tbv/core/utils",
  "@babylonlabs-io/ts-sdk/tbv/core/primitives",
]);

const LAZY_CALL = /\blazy(?:WithRetry)?\s*\(/g;
const DYNAMIC_IMPORT = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const ECC_AWAIT = /await\s+ensureBtcEccInitialized/;

/** Today there are 16 lazy call sites and 5 that must await ECC. The floors sit
 *  just below so a rename of `lazy`/`ensureBtcEccInitialized` — which would
 *  silently match nothing — fails instead of passing vacuously. */
const MIN_LAZY_SITES = 12;
const MIN_ECC_AWAITING_SITES = 4;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "__tests__") found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * The balanced `(…)` argument starting at `openIndex`, skipping parentheses
 * that appear inside string literals or comments.
 */
function sliceCallArgument(source: string, openIndex: number): string | null {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < source.length && source[index] !== char) {
        index += source[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index);
      if (end === -1) return null;
      index = end + 2;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
    index += 1;
  }
  return null;
}

interface LazySite {
  /** Module containing the `lazy(…)` call. */
  file: string;
  /** Modules the factory dynamically imports — the chunk roots it creates. */
  chunkRoots: string[];
  /** First ECC-dependent import reached from those roots, if any. */
  eccDependency: string | null;
  awaitsEcc: boolean;
}

function findEccDependency(chunkRoot: string): string | null {
  for (const [file, specifiers] of runtimeClosure(chunkRoot)) {
    for (const specifier of specifiers) {
      if (ECC_DEPENDENT_IMPORTS.has(specifier)) {
        return `${relative(SOURCE_ROOT, file)} -> ${specifier}`;
      }
    }
  }
  return null;
}

function collectLazySites(): LazySite[] {
  const sites: LazySite[] = [];
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(LAZY_CALL)) {
      const factory = sliceCallArgument(
        source,
        match.index + match[0].length - 1,
      );
      if (factory === null) continue;

      const chunkRoots = Array.from(factory.matchAll(DYNAMIC_IMPORT))
        .map(([, specifier]) => resolveVaultImport(file, specifier))
        .filter((path): path is string => path !== null);

      sites.push({
        file,
        chunkRoots,
        eccDependency:
          chunkRoots.map(findEccDependency).find((hit) => hit !== null) ?? null,
        awaitsEcc: ECC_AWAIT.test(factory),
      });
    }
  }
  return sites;
}

const lazySites = collectLazySites();

/**
 * A nested lazy split inside a chunk whose root already awaited ECC needs no
 * await of its own. Expressed as reachability rather than an allow-list, so
 * every future nested split is covered without editing this file: a module is
 * exempt only when every chunk root that statically reaches it initialized ECC.
 */
function isBehindEccAwaitingRootsOnly(module: string): boolean {
  const eccAwaitingRoots = new Set(
    lazySites
      .filter((site) => site.awaitsEcc)
      .flatMap((site) => site.chunkRoots),
  );
  const allRoots = new Set([
    resolve(SOURCE_ROOT, "main.tsx"),
    ...lazySites.flatMap((site) => site.chunkRoots),
  ]);

  let reached = false;
  for (const root of allRoots) {
    if (!runtimeClosure(root).has(module)) continue;
    if (!eccAwaitingRoots.has(root)) return false;
    reached = true;
  }
  return reached;
}

describe("ECC initialization boundary", () => {
  it("every lazy chunk reaching Bitcoin transaction primitives awaits ECC initialization", () => {
    const offenders = lazySites
      .filter(
        (site) =>
          site.eccDependency !== null &&
          !site.awaitsEcc &&
          !isBehindEccAwaitingRootsOnly(site.file),
      )
      .map(
        (site) =>
          `${relative(SOURCE_ROOT, site.file)} lazily loads ${site.chunkRoots
            .map((root) => relative(SOURCE_ROOT, root))
            .join(
              ", ",
            )} without awaiting ensureBtcEccInitialized (reaches ${site.eccDependency})`,
      );

    expect(offenders).toEqual([]);
  });

  it("scans every lazy call site in the app", () => {
    expect(lazySites.length).toBeGreaterThanOrEqual(MIN_LAZY_SITES);
  });

  it("finds ECC-dependent chunks, so the awaits it checks are load-bearing", () => {
    const awaiting = lazySites.filter(
      (site) => site.eccDependency !== null && site.awaitsEcc,
    );

    expect(awaiting.length).toBeGreaterThanOrEqual(MIN_ECC_AWAITING_SITES);
  });
});
