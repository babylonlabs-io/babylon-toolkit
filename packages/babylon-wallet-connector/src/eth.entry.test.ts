import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(SRC_ROOT, "eth.ts");
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
const OPTIONAL_BITCOIN_INSTALL_PACKAGES = [
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

describe("the Ethereum package entry", () => {
  it("has no static path to the Bitcoin implementation stack", () => {
    const visited = new Set<string>();
    const externalPackages = new Set<string>();
    const queue = [ENTRY];

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

    const normalizedFiles = [...visited].map((file) => file.replaceAll(path.sep, "/"));
    for (const forbidden of FORBIDDEN_LOCAL_PATHS) {
      expect(normalizedFiles, `static ETH graph reached ${forbidden}`).not.toEqual(
        expect.arrayContaining([expect.stringContaining(forbidden)]),
      );
    }
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect(
        [...externalPackages].some((specifier) => specifier === forbidden || specifier.startsWith(`${forbidden}/`)),
        `static ETH graph imported ${forbidden}`,
      ).toBe(false);
    }
  });

  it("does not install the Bitcoin crypto runtime for ETH-only consumers", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC_ROOT, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      devDependencies?: Record<string, string>;
    };

    for (const dependency of OPTIONAL_BITCOIN_INSTALL_PACKAGES) {
      expect(manifest.dependencies).not.toHaveProperty(dependency);
      expect(manifest.peerDependencies).toHaveProperty(dependency);
      expect(manifest.peerDependenciesMeta?.[dependency]?.optional).toBe(true);
      expect(manifest.devDependencies).toHaveProperty(dependency);
    }
  });
});
