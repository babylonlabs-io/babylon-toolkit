import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import ts from "typescript";

export const requiredExternals = [
  "react",
  "react-dom",
  "tailwind-merge",
  "wagmi",
  "viem",
  "@babylonlabs-io/core-ui",
  "@reown/appkit",
  "@reown/appkit-adapter-wagmi",
  "@tanstack/react-query",
];

// These wallet packages stay external in both library formats.
export const walletExternals = [
  "@babylonlabs-io/ledger-vault-signer",
  "@cosmjs/stargate",
  "@keystonehq/sdk",
  "@reown/appkit-adapter-bitcoin",
  "bitcoinjs-lib",
];

export function importSpecifiers(source, filename) {
  const specifiers = new Set();
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const add = (node) => {
    if (!node || !ts.isStringLiteralLike(node)) {
      throw new Error(`Cannot check a computed import in ${filename}`);
    }
    specifiers.add(node.text);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isExternalModuleReference(node)) {
      add(node.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...specifiers];
}

export const packageName = (specifier) =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");

export function emittedDependencies(entries) {
  const pending = [...entries];
  const files = new Set();
  const packages = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"), file)) {
      if (!specifier.startsWith(".")) {
        if (specifier.startsWith("@/")) throw new Error(`Unresolved alias in ${file}: ${specifier}`);
        packages.add(packageName(specifier));
        continue;
      }
      const target = resolve(dirname(file), specifier);
      const declaration = file.endsWith(".d.ts");
      const candidates = declaration
        ? [target.replace(/\.[cm]?js$/, "") + ".d.ts", target + ".d.ts", resolve(target, "index.d.ts")]
        : [target, target + ".js", target + ".cjs", resolve(target, "index.js")];
      const dependency = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
      if (!dependency) throw new Error(`Missing emitted import ${specifier} from ${file}`);
      if (extname(dependency) !== ".css") pending.push(dependency);
    }
  }
  return { files, packages };
}

export function bundledDependencies(files) {
  const packages = new Set();
  for (const file of files) {
    const map = JSON.parse(readFileSync(`${file}.map`, "utf8"));
    for (const source of map.sources) {
      const parts = source.split("node_modules/");
      if (parts.length > 1) packages.add(packageName(parts.at(-1)));
    }
  }
  return packages;
}

export function checkPackage(manifest, runtime, declarations) {
  const required = new Set([...runtime.eth.packages, ...declarations.eth.packages]);
  const used = new Set([...runtime.root.packages, ...declarations.root.packages, ...required]);
  const optionalPeers = new Set(walletExternals);
  for (const name of used) {
    if (!required.has(name) && !requiredExternals.includes(name)) optionalPeers.add(name);
  }
  for (const name of optionalPeers) {
    if (!used.has(name)) throw new Error(`Unused optional wallet dependency: ${name}`);
    if (required.has(name)) throw new Error(`Ethereum entry imports optional wallet dependency: ${name}`);
    if (!manifest.peerDependencies?.[name] || manifest.peerDependenciesMeta?.[name]?.optional !== true) {
      throw new Error(`Missing optional wallet peer: ${name}`);
    }
    if (manifest.dependencies?.[name] || manifest.optionalDependencies?.[name]) {
      throw new Error(`Ethereum installs optional wallet peer: ${name}`);
    }
  }
  for (const [name, meta] of Object.entries(manifest.peerDependenciesMeta ?? {})) {
    if (meta.optional && !optionalPeers.has(name)) throw new Error(`Stale optional wallet peer: ${name}`);
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (!used.has(name) && !requiredExternals.includes(name)) throw new Error(`Unused wallet peer: ${name}`);
  }
  for (const name of used) {
    if (!manifest.dependencies?.[name] && !manifest.peerDependencies?.[name]) {
      throw new Error(`Undeclared emitted dependency: ${name}`);
    }
  }
  const declared = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
  };
  const buildOnlyDependencies = [...(runtime.root.bundledPackages ?? [])].filter(
    (name) => !runtime.eth.bundledPackages?.has(name) && !required.has(name) && declared[name],
  );
  for (const name of buildOnlyDependencies) {
    if (manifest.dependencies?.[name] || manifest.optionalDependencies?.[name] || manifest.peerDependencies?.[name]) {
      throw new Error(`Ethereum installs a bundled wallet dependency: ${name}`);
    }
  }
  return { optionalPeers: [...optionalPeers].sort(), buildOnlyDependencies: buildOnlyDependencies.sort() };
}
