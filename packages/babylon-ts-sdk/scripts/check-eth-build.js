import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Every pattern is whitespace-agnostic. Minified ES output emits
// `import{a}from"x"` with no separating whitespace, so a pattern that required
// whitespace after the keyword or before `from` would walk straight past an
// eager edge and report success on an empty closure.
const eagerSpecifierPatterns = [
  /\b(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const dynamicSpecifierPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const allSpecifierPatterns = [
  ...eagerSpecifierPatterns,
  dynamicSpecifierPattern,
];

// Comments are removed before the specifier scan. Emitted .d.ts files carry
// JSDoc `@example` blocks whose sample code contains real import statements,
// and a commented-out import must not count as an eager edge either.
function stripComments(source) {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== char) {
        cursor += source[cursor] === "\\" ? 2 : 1;
      }
      out += source.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function isBanned(specifier, banned) {
  return banned.some(
    (dependency) =>
      specifier === dependency || specifier.startsWith(`${dependency}/`),
  );
}

function localCandidates(from, specifier) {
  const target = resolve(dirname(from), specifier);
  if (extname(target) === "") {
    return [
      `${target}.d.ts`,
      `${target}.js`,
      `${target}.cjs`,
      resolve(target, "index.d.ts"),
      resolve(target, "index.js"),
      resolve(target, "index.cjs"),
    ];
  }
  const candidates = [target];
  if (from.endsWith(".d.ts")) {
    // A declaration importing `./x.js` means `./x.d.ts`, and one importing
    // `./x.abi` (a dotted basename, not an extension) means `./x.abi.d.ts`.
    candidates.unshift(
      target.endsWith(".js")
        ? target.replace(/\.js$/, ".d.ts")
        : `${target}.d.ts`,
    );
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
const dottedBasenameResolutionProbe = localCandidates(
  "/boundary/example.d.ts",
  "./dependency.abi",
);
if (!dottedBasenameResolutionProbe[0].endsWith("/dependency.abi.d.ts")) {
  throw new Error(
    "Declaration closure must append .d.ts to a dotted basename such as ./x.abi",
  );
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
    const source = stripComments(readFileSync(file, "utf8"));
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

function fixture(name) {
  return resolve(packageRoot, "scripts/fixtures/eth-import-boundary", name);
}

const contaminatedFixtureEntry = fixture("entry.js");
const contaminatedFixtureIntermediate = fixture("intermediate.js");
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

// One fixture per specifier form the build actually emits. The chain fixture
// above already covers the bare side-effect form; these cover the minified
// named, namespace, re-export and type forms plus the CommonJS require the
// .cjs bundle is written in. A pattern that misses one of these reports
// success over a closure it never walked.
const eagerFormFixtures = [
  "minified-named-import.js",
  "minified-namespace-import.js",
  "minified-reexport.js",
  "minified-type-import.d.ts",
  "type-reexport.d.ts",
  "cjs-require.cjs",
];
for (const name of eagerFormFixtures) {
  const file = fixture(name);
  const { violations } = emittedClosure(
    [file],
    dependencyCleanBanned,
    eagerSpecifierPatterns,
  );
  const expected = `${file} -> bitcoinjs-lib`;
  if (violations.length !== 1 || violations[0] !== expected) {
    throw new Error(
      `Eager specifier patterns missed the form in ${name}:\n${violations.join("\n")}`,
    );
  }
}

// The dynamic form is the lazy boundary itself: pass 1 forbids reaching the
// dependency at all and must see it, pass 2 forbids only eager resolution and
// must not.
const dynamicFixture = fixture("dynamic-import.js");
const dynamicAsEager = emittedClosure(
  [dynamicFixture],
  dependencyCleanBanned,
  eagerSpecifierPatterns,
);
if (dynamicAsEager.violations.length !== 0) {
  throw new Error(
    `A dynamic import must not count as an eager edge:\n${dynamicAsEager.violations.join("\n")}`,
  );
}
const dynamicAsAny = emittedClosure(
  [dynamicFixture],
  dependencyCleanBanned,
  allSpecifierPatterns,
);
if (
  dynamicAsAny.violations.length !== 1 ||
  dynamicAsAny.violations[0] !== `${dynamicFixture} -> bitcoinjs-lib`
) {
  throw new Error(
    `Dynamic specifier pattern missed a lazy edge:\n${dynamicAsAny.violations.join("\n")}`,
  );
}

// An identifier that merely contains the keyword is not an import.
const identifierFixture = fixture("identifier-not-import.js");
const identifierScan = emittedClosure(
  [identifierFixture],
  dependencyCleanBanned,
  allSpecifierPatterns,
);
if (identifierScan.violations.length !== 0) {
  throw new Error(
    `A specifier-shaped identifier was read as an import:\n${identifierScan.violations.join("\n")}`,
  );
}

// Commented code is not an edge. Without stripComments this fixture both
// reports a violation from its JSDoc @example and throws on the relative path
// in its commented-out import, which was never emitted.
const commentFixture = fixture("commented-import.js");
const commentScan = emittedClosure(
  [commentFixture],
  dependencyCleanBanned,
  allSpecifierPatterns,
);
if (commentScan.violations.length !== 0) {
  throw new Error(
    `A commented-out import was read as an edge:\n${commentScan.violations.join("\n")}`,
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
  "dist/tbv/core/contracts/index.js",
  "dist/tbv/core/contracts/index.cjs",
  "dist/tbv/core/contracts/index.d.ts",
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
// Every declared package export that pass 1 does not already cover is listed:
// `./tbv/integrations/aave` and `./testing` share no chunk with the root
// barrels, so without their own entries an eager peer import in either would
// go unseen.
const lazyWasmEntries = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/tbv/index.js",
  "dist/tbv/index.cjs",
  "dist/tbv/core/index.js",
  "dist/tbv/core/index.cjs",
  "dist/tbv/core/primitives/index.js",
  "dist/tbv/core/primitives/index.cjs",
  "dist/tbv/core/utils/index.js",
  "dist/tbv/core/utils/index.cjs",
  "dist/tbv/core/clients/index.js",
  "dist/tbv/core/clients/index.cjs",
  "dist/tbv/core/services/index.js",
  "dist/tbv/core/services/index.cjs",
  "dist/tbv/core/managers/index.js",
  "dist/tbv/core/managers/index.cjs",
  "dist/tbv/core/vault-secrets/index.js",
  "dist/tbv/core/vault-secrets/index.cjs",
  "dist/tbv/integrations/aave/index.js",
  "dist/tbv/integrations/aave/index.cjs",
  "dist/testing/index.js",
  "dist/testing/index.cjs",
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

// Floors on the walked closures. Finding no violation is only meaningful if
// the walk actually reached the code: a pattern that stops matching, or a
// bundler change that collapses a closure to its entry file, would otherwise
// pass silently. Measured at the time of writing: pass 1 visits 65 modules,
// pass 2 visits 88. The floors sit roughly 20% below those counts, which
// absorbs ordinary chunk merging and file consolidation while still catching
// the collapse this guard exists for.
const MINIMUM_DEPENDENCY_CLEAN_MODULES = 52;
const MINIMUM_LAZY_WASM_MODULES = 70;
if (dependencyClean.visited.size < MINIMUM_DEPENDENCY_CLEAN_MODULES) {
  throw new Error(
    `Dependency-clean closure collapsed to ${dependencyClean.visited.size} module(s), below the floor of ${MINIMUM_DEPENDENCY_CLEAN_MODULES}. The specifier scan is no longer walking the emitted output.`,
  );
}
if (lazyWasm.visited.size < MINIMUM_LAZY_WASM_MODULES) {
  throw new Error(
    `Lazy WASM closure collapsed to ${lazyWasm.visited.size} module(s), below the floor of ${MINIMUM_LAZY_WASM_MODULES}. The specifier scan is no longer walking the emitted output.`,
  );
}

console.log(
  `Dependency-clean build boundary verified across ${dependencyClean.visited.size} emitted module(s).`,
);
console.log(
  `Lazy WASM peer boundary verified across ${lazyWasm.visited.size} emitted module(s) reachable from the SDK root barrels.`,
);
