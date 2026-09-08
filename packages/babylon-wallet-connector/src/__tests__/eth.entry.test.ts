import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PACKAGE_ROOT, "src");
const ETH_ENTRY = path.join(SRC, "eth.ts");

const packageJson = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
  exports?: Record<string, Record<string, string>>;
};

// The Ethereum entry must not include these wallet or cryptography packages.
const BITCOIN_WALLET_PACKAGES = [
  "@reown/appkit-adapter-bitcoin",
  "@keystonehq/animated-qr",
  "@keystonehq/keystone-sdk",
  "@keystonehq/sdk",
  "@babylonlabs-io/ledger-vault-signer",
  "@tomo-inc/ledger-bitcoin-babylon",
  "@tomo-inc/wallet-connect-sdk",
  "ledger-bitcoin-babylon-boilerplate",
  "@keplr-wallet/provider-extension",
  "@scure/btc-signer",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@scure/bip32",
  "bip174",
  "bitcoinjs-lib",
];
const BITCOIN_SOURCE_DIRS = [path.join(SRC, "core", "wallets", "btc"), path.join(SRC, "core", "wallets", "bbn")];

function runtimeImports(source: string, filename: string): string[] {
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve },
  });
  const imports: string[] = [];
  const add = (node?: ts.Node) => {
    if (!node || !ts.isStringLiteralLike(node)) throw new Error(`Cannot check a computed import in ${filename}`);
    imports.push(node.text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(filename, outputText, ts.ScriptTarget.Latest, true));
  return imports;
}

function resolveModule(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;

  if (base === null) return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    base,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  throw new Error(`Missing source import ${specifier} from ${fromFile}`);
}

/** Walks the runtime import graph of an entry, following only in-package modules. */
function moduleGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file) || !existsSync(file)) continue;
    files.add(file);
    if (!/\.tsx?$/.test(file)) continue;

    const source = readFileSync(file, "utf8");
    for (const specifier of runtimeImports(source, file)) {
      const resolved = resolveModule(specifier, file);
      if (resolved) {
        queue.push(resolved);
      } else if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
        packages.add(specifier);
      }
    }
  }

  return { files, packages };
}

function exportedNames(source: string): string[] {
  const names: string[] = [];

  for (const block of source.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const clause of block[1].split(",")) {
      const trimmed = clause.trim();
      if (!trimmed) continue;
      const aliased = trimmed.match(/\sas\s+(\w+)$/);
      names.push(aliased ? aliased[1] : trimmed.replace(/^type\s+/, ""));
    }
  }

  return names;
}

describe("the ./eth entry point", () => {
  const source = readFileSync(ETH_ENTRY, "utf8");

  it("exports each symbol under exactly one name", () => {
    const names = exportedNames(source);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect(duplicates).toEqual([]);
  });

  it("declares no aliases, so no symbol is reachable under a second name", () => {
    const aliases = [...source.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)]
      .flatMap((block) => block[1].split(","))
      .map((clause) => clause.trim())
      .filter((clause) => /\sas\s/.test(clause));

    expect(aliases).toEqual([]);
  });

  it("resolves no Bitcoin wallet adapters, hardware SDKs, or cryptography", () => {
    const { packages } = moduleGraph(ETH_ENTRY);
    const bitcoin = [...packages].filter((specifier) =>
      BITCOIN_WALLET_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`)),
    );

    expect(bitcoin).toEqual([]);
  });

  it("resolves no Bitcoin or Cosmos wallet implementations", () => {
    const { files } = moduleGraph(ETH_ENTRY);
    const bitcoin = [...files]
      .filter((file) => BITCOIN_SOURCE_DIRS.some((dir) => file.startsWith(dir)))
      .map((file) => path.relative(SRC, file));

    expect(bitcoin).toEqual([]);
  });

  // Guards the two assertions above: applied to the root entry the same walk
  // must find the Bitcoin stack it claims `./eth` is free of. Without this, a
  // resolver that silently stopped walking would report a clean graph.
  it("is measured by a walk that does find Bitcoin in the root entry", () => {
    const ethGraph = moduleGraph(ETH_ENTRY);
    const rootGraph = moduleGraph(path.join(SRC, "index.tsx"));

    expect(ethGraph.files.size).toBeGreaterThan(30);
    expect([...rootGraph.files].some((file) => file.startsWith(BITCOIN_SOURCE_DIRS[0]))).toBe(true);
    expect([...rootGraph.packages]).toContain("bitcoinjs-lib");
  });

  it("is published as a subpath export", () => {
    expect(packageJson.exports?.["./eth"]).toEqual({
      types: "./dist/eth.d.ts",
      require: "./dist/eth.cjs.js",
      import: "./dist/eth.es.js",
    });
  });
});

describe("the source dependency parser", () => {
  it.each([
    'import "bitcoinjs-lib";',
    'export * from "bitcoinjs-lib";',
    'const load = () => import("bitcoinjs-lib");',
    'const load = () => Promise.resolve().then(() => require("bitcoinjs-lib"));',
  ])("finds the Bitcoin dependency in %s", (source) => {
    expect(runtimeImports(source, "entry.ts")).toEqual(["bitcoinjs-lib"]);
  });

  it("ignores type-only imports, comments, and strings", () => {
    expect(
      runtimeImports(
        `
      import type { Psbt } from "bitcoinjs-lib";
      export type { Psbt } from "bitcoinjs-lib";
      // import("bitcoinjs-lib");
      const text = 'require("bitcoinjs-lib")';
    `,
        "entry.ts",
      ),
    ).toEqual([]);
  });

  it("rejects imports that cannot be resolved before runtime", () => {
    expect(() => runtimeImports("const load = (name) => import(name);", "entry.ts")).toThrow("computed import");
  });
});
