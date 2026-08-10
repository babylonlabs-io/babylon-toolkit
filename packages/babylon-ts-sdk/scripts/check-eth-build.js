import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const banned = [
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@babylonlabs-io/babylon-tbv-rust-wasm",
];
const specifierPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?[^"';]*?\sfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function isBanned(specifier) {
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

function emittedClosure(entries) {
  const pending = [...entries];
  const visited = new Set();
  const violations = [];
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Missing emitted entry: ${file}`);
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const pattern of specifierPatterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (isBanned(specifier)) {
          violations.push(`${file} imports ${specifier}`);
        } else if (specifier.startsWith(".")) {
          pending.push(resolveLocal(file, specifier));
        }
      }
    }
  }
  return { violations, visited };
}

const entries = [
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
const { violations, visited } = emittedClosure(entries);
if (violations.length > 0) {
  throw new Error(
    `Dependency-clean build boundary violations:\n${violations.join("\n")}`,
  );
}

console.log(
  `Dependency-clean build boundary verified across ${visited.size} emitted module(s).`,
);
