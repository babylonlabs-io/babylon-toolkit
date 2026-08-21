import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eagerSpecifierPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?[^"';]*?\sfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const dynamicSpecifierPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const allSpecifierPatterns = [...eagerSpecifierPatterns, dynamicSpecifierPattern];

function isBanned(specifier, banned) {
  return banned.some(
    (dependency) =>
      specifier === dependency || specifier.startsWith(`${dependency}/`),
  );
}

function localCandidates(from, specifier) {
  const target = resolve(dirname(from), specifier);
  const candidates =
    extname(target) === ""
      ? [
          `${target}.d.ts`,
          `${target}.js`,
          `${target}.cjs`,
          resolve(target, "index.d.ts"),
          resolve(target, "index.js"),
          resolve(target, "index.cjs"),
        ]
      : [target];
  if (from.endsWith(".d.ts") && target.endsWith(".js")) {
    candidates.unshift(target.replace(/\.js$/, ".d.ts"));
  }
  return candidates;
}

function resolveLocal(from, specifier) {
  const candidates = localCandidates(from, specifier);
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `Could not resolve emitted import ${specifier} from ${from}`,
    );
  }
  return resolved;
}

const declarationResolutionProbe = localCandidates(
  "/boundary/example.d.ts",
  "./dependency.js",
);
if (!declarationResolutionProbe[0].endsWith("/dependency.d.ts")) {
  throw new Error("Declaration closure must prefer .d.ts over emitted .js");
}

function emittedClosure(entries, banned, patterns) {
  const pending = entries.map((file) => ({ file, chain: [file] }));
  const visited = new Set();
  const violations = [];
  while (pending.length > 0) {
    const { file, chain } = pending.pop();
    if (visited.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Missing emitted entry: ${file}`);
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (isBanned(specifier, banned)) {
          violations.push([...chain, specifier].join(" -> "));
        } else if (specifier.startsWith(".")) {
          const dependency = resolveLocal(file, specifier);
          pending.push({ file: dependency, chain: [...chain, dependency] });
        }
      }
    }
  }
  return { violations, visited };
}

const dependencyCleanBanned = [
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@babylonlabs-io/babylon-tbv-rust-wasm",
];
const contaminatedFixtureEntry = resolve(
  packageRoot,
  "scripts/fixtures/eth-import-boundary/entry.js",
);
const contaminatedFixtureIntermediate = resolve(
  packageRoot,
  "scripts/fixtures/eth-import-boundary/intermediate.js",
);
const contaminatedFixture = emittedClosure(
  [contaminatedFixtureEntry],
  dependencyCleanBanned,
  allSpecifierPatterns,
);
const expectedContaminatedChain = [
  contaminatedFixtureEntry,
  contaminatedFixtureIntermediate,
  "bitcoinjs-lib",
].join(" -> ");
if (
  contaminatedFixture.violations.length !== 1 ||
  contaminatedFixture.violations[0] !== expectedContaminatedChain
) {
  throw new Error(
    `Dependency-clean boundary fixture did not report its full import chain:\n${contaminatedFixture.violations.join("\n")}`,
  );
}

// Pass 1: the ETH-only entry points must not reach the Bitcoin or WASM
// dependencies at all, eagerly or lazily.
const dependencyCleanEntries = [
  "dist/tbv/core/clients/eth/index.js",
  "dist/tbv/core/clients/eth/index.cjs",
  "dist/tbv/core/clients/eth/index.d.ts",
  "dist/tbv/core/clients/mempool/index.js",
  "dist/tbv/core/clients/mempool/index.cjs",
  "dist/tbv/core/clients/mempool/index.d.ts",
  "dist/tbv/core/clients/vault-provider/status/index.js",
  "dist/tbv/core/clients/vault-provider/status/index.cjs",
  "dist/tbv/core/clients/vault-provider/status/index.d.ts",
  "dist/tbv/core/utils/eth/index.js",
  "dist/tbv/core/utils/eth/index.cjs",
  "dist/tbv/core/utils/eth/index.d.ts",
].map((entry) => resolve(packageRoot, entry));
const dependencyClean = emittedClosure(
  dependencyCleanEntries,
  dependencyCleanBanned,
  allSpecifierPatterns,
);
if (dependencyClean.violations.length > 0) {
  throw new Error(
    `Dependency-clean build boundary violations:\n${dependencyClean.violations.join("\n")}`,
  );
}

// Pass 2: the claim made by the module JSDoc of src/tbv/core/wasm/index.ts —
// importing the SDK, including its legacy root barrels, does not resolve the
// WASM package or generated binary. Only eager specifiers count: the lazy
// facade's `import(...)` of the peer is the boundary being proven, not a
// violation of it. Runtime entries only — the facade's .d.ts carries a type
// import of the peer, and the patterns above match type imports deliberately.
const lazyWasmEntries = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/tbv/core/index.js",
  "dist/tbv/core/index.cjs",
].map((entry) => resolve(packageRoot, entry));
const lazyWasm = emittedClosure(
  lazyWasmEntries,
  ["@babylonlabs-io/babylon-tbv-rust-wasm"],
  eagerSpecifierPatterns,
);
if (lazyWasm.violations.length > 0) {
  throw new Error(
    `SDK root barrels eagerly resolve the optional WASM peer:\n${lazyWasm.violations.join("\n")}`,
  );
}

console.log(
  `Dependency-clean build boundary verified across ${dependencyClean.visited.size} emitted module(s).`,
);
console.log(
  `Lazy WASM peer boundary verified across ${lazyWasm.visited.size} emitted module(s) reachable from the SDK root barrels.`,
);
