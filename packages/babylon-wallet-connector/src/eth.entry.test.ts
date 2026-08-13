import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ETH_ENTRY = path.join(SRC_ROOT, "eth.ts");
const DEFAULT_ENTRY = path.join(SRC_ROOT, "index.tsx");
const FORBIDDEN_LOCAL_PATHS = [
  "/core/wallets/btc/",
  "/providers/BTCWalletProvider",
  "/widgets/tomo/",
  "/context/TomoProvider",
  "/components/ExternalWallets/",
];
const FORBIDDEN_PACKAGES = [
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@reown/appkit-adapter-bitcoin",
  "@tomo-inc/wallet-connect-sdk",
];
const REQUIRED_BITCOIN_PACKAGES = [
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
  "@reown/appkit-adapter-bitcoin",
  "@tomo-inc/ledger-bitcoin-babylon",
  "@tomo-inc/wallet-connect-sdk",
  "ledger-bitcoin-babylon-boilerplate",
];

function resolveLocalImport(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? path.join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : undefined;
  if (!base) return undefined;

  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function staticRuntimeImports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];

  source.forEachChild((node) => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly) return;
      if (ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) return;
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text);
      }
    }
  });

  return imports;
}

function staticClosure(entry: string): { files: string[]; externalPackages: string[] } {
  const visited = new Set<string>();
  const externalPackages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    for (const specifier of staticRuntimeImports(file)) {
      const local = resolveLocalImport(file, specifier);
      if (local) queue.push(local);
      else if (!specifier.endsWith(".css") && !specifier.endsWith(".svg")) externalPackages.add(specifier);
    }
  }

  return { files: [...visited], externalPackages: [...externalPackages] };
}

function importsPackage(externalPackages: string[], name: string): boolean {
  return externalPackages.some((specifier) => specifier === name || specifier.startsWith(`${name}/`));
}

describe("the Ethereum package entry", () => {
  it("has no static path to the Bitcoin implementation stack", () => {
    const { files, externalPackages } = staticClosure(ETH_ENTRY);

    const normalizedFiles = files.map((file) => file.replaceAll(path.sep, "/"));
    for (const forbidden of FORBIDDEN_LOCAL_PATHS) {
      expect(normalizedFiles, `static ETH graph reached ${forbidden}`).not.toEqual(
        expect.arrayContaining([expect.stringContaining(forbidden)]),
      );
    }
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect(importsPackage(externalPackages, forbidden), `static ETH graph imported ${forbidden}`).toBe(false);
    }
  });
});

describe("the default package entry", () => {
  it("statically requires the Bitcoin stack, so those dependencies must not be optional peers", () => {
    const { externalPackages } = staticClosure(DEFAULT_ENTRY);
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC_ROOT, "..", "package.json"), "utf8")) as {
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };

    for (const dependency of REQUIRED_BITCOIN_PACKAGES) {
      expect(importsPackage(externalPackages, dependency), `static default graph no longer imports ${dependency}`).toBe(
        true,
      );
      expect(manifest.peerDependenciesMeta?.[dependency]?.optional, `${dependency} is an optional peer`).not.toBe(true);
    }
  });
});
