import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(PACKAGE_ROOT, "src");
const ETH_ENTRY = path.join(SRC, "eth.ts");

const packageJson = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports?: Record<string, Record<string, string>>;
};

/**
 * Bitcoin wallet implementations — adapters, hardware SDKs and the connector's
 * own Bitcoin and Cosmos wallet modules. None of these may be reachable from
 * `./eth`.
 */
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
  "bip174",
];
const BITCOIN_SOURCE_DIRS = [path.join(SRC, "core", "wallets", "btc"), path.join(SRC, "core", "wallets", "bbn")];

/**
 * Bitcoin cryptography still reachable from `./eth`, and only through
 * `core/utils/wallet`'s address validation, which the shared dialog calls when
 * a Bitcoin wallet connects. Removing it means loading that validation on
 * demand, which is the lazy Bitcoin engine work — not this change.
 *
 * Pinned as an exact set so the leak can shrink but never grow: adding a new
 * Bitcoin dependency to the dialog fails here, and making the validation lazy
 * fails here too, as a prompt to empty the list.
 */
const BITCOIN_CRYPTO_PACKAGES_PENDING_LAZY_ENGINE = ["@bitcoin-js/tiny-secp256k1-asmjs", "@scure/bip32", "bitcoinjs-lib"];

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT_PATTERN = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;

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

  return null;
}

/** Walks the static import graph of an entry, following only in-package modules. */
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
    const specifiers = [
      ...[...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]),
      ...[...source.matchAll(BARE_IMPORT_PATTERN)].map((match) => match[1]),
    ];

    for (const specifier of specifiers) {
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

  it("resolves no Bitcoin wallet adapters or hardware SDKs", () => {
    const { packages } = moduleGraph(ETH_ENTRY);
    const bitcoin = [...packages].filter((specifier) =>
      BITCOIN_WALLET_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`)),
    );

    expect(bitcoin).toEqual([]);
  });

  it("resolves no Bitcoin cryptography beyond the address validation still awaiting the lazy engine", () => {
    const { packages } = moduleGraph(ETH_ENTRY);
    const reachable = [...packages]
      .map((specifier) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/"))
      .filter((name) => BITCOIN_CRYPTO_PACKAGES_PENDING_LAZY_ENGINE.includes(name));

    expect([...new Set(reachable)].sort()).toEqual(BITCOIN_CRYPTO_PACKAGES_PENDING_LAZY_ENGINE);
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

describe("optional peer dependencies", () => {
  /**
   * The rule, rather than a list of package names: an optional peer is only
   * safe if a consuming app can resolve it. Either it is externalised and every
   * consuming app declares it, or it is bundled — which needs it present at
   * build time as a dev dependency. Checked by rule so it stays correct as the
   * externals list changes.
   */
  const optionalPeers = Object.entries(packageJson.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta.optional)
    .map(([name]) => name);

  const viteConfig = readFileSync(path.join(PACKAGE_ROOT, "vite.config.ts"), "utf8");
  const externals = viteConfig.slice(viteConfig.indexOf("external: ["), viteConfig.indexOf("output: {"));

  const consumers = ["services/vault", "services/simple-staking"].map((relative) => {
    const manifestPath = path.join(PACKAGE_ROOT, "../..", relative, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return { relative, declared: { ...manifest.dependencies, ...manifest.devDependencies } };
  });

  it.each(optionalPeers)("%s is either externalised and declared by every consumer, or bundled", (peer) => {
    const isExternalised = externals.includes(`"${peer}"`);

    if (isExternalised) {
      const missing = consumers.filter(({ declared }) => !declared[peer]).map(({ relative }) => relative);
      expect(missing).toEqual([]);
      return;
    }

    expect(packageJson.devDependencies ?? {}).toHaveProperty(peer);
  });

  it("declares every optional peer in peerDependencies", () => {
    const undeclared = optionalPeers.filter((peer) => !(packageJson.peerDependencies ?? {})[peer]);

    expect(undeclared).toEqual([]);
  });
});
