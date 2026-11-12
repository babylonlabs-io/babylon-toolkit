import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertNoStubbedStreamTransform,
  bundledDependencies,
  checkPackage,
  emittedDependencies,
  importSpecifiers,
  walletExternals,
} from "./package-boundary.js";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// A peer only the root declarations reach. The package has none today; the checker must still accept one.
const DECLARED_PEER = "@example/declared-peer";
manifest.peerDependencies[DECLARED_PEER] = "1.0.0";
manifest.peerDependenciesMeta[DECLARED_PEER] = { optional: true };

function fixture(
  t,
  source = 'import "react";',
  declaration = "export {};",
  btcEthSource = 'import "bitcoinjs-lib";',
  btcEthDeclaration = "export {};",
) {
  const root = mkdtempSync(join(tmpdir(), "wallet-import-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries({
    "root.js": walletExternals.map((name) => `import ${JSON.stringify(name)};`).join("\n"),
    "root.d.ts": `export type Signer = import(${JSON.stringify(DECLARED_PEER)}).Signer;`,
    "eth.js": source,
    "eth.d.ts": declaration,
    "btc-eth.js": btcEthSource,
    "btc-eth.d.ts": btcEthDeclaration,
    "bitcoin.js": 'export * from "bitcoinjs-lib/src/payments/index.js";',
    "bitcoin.d.ts": 'export type { Psbt } from "bitcoinjs-lib";',
  })) {
    writeFileSync(join(root, file), contents);
  }
  const runtime = {
    root: { ...emittedDependencies([join(root, "root.js")]), bundledPackages: new Set() },
    eth: { ...emittedDependencies([join(root, "eth.js")]), bundledPackages: new Set() },
    btcEth: { ...emittedDependencies([join(root, "btc-eth.js")]), bundledPackages: new Set() },
  };
  const declarations = {
    root: emittedDependencies([join(root, "root.d.ts")]),
    eth: emittedDependencies([join(root, "eth.d.ts")]),
    btcEth: emittedDependencies([join(root, "btc-eth.d.ts")]),
  };
  return { runtime, declarations, check: (candidate = manifest) => checkPackage(candidate, runtime, declarations) };
}

test("accepts optional peers from externals and declarations, including partially bundled peers", (t) => {
  const { runtime, check } = fixture(t);
  runtime.root.bundledPackages.add("bitcoinjs-lib");
  assert.deepEqual(check().optionalPeers, [
    "@babylonlabs-io/ledger-vault-signer",
    "@cosmjs/stargate",
    DECLARED_PEER,
    "@keystonehq/sdk",
    "@reown/appkit-adapter-bitcoin",
    "bitcoinjs-lib",
  ]);
});

for (const [name, change, error] of [
  ["missing peer", (pkg) => delete pkg.peerDependencies["bitcoinjs-lib"], /Missing optional wallet peer/],
  [
    "missing optional metadata",
    (pkg) => delete pkg.peerDependenciesMeta["bitcoinjs-lib"],
    /Missing optional wallet peer/,
  ],
  [
    "stale peer",
    (pkg) => {
      pkg.peerDependencies["bip174"] = "2.1.1";
      pkg.peerDependenciesMeta["bip174"] = { optional: true };
    },
    /Stale optional wallet peer/,
  ],
  [
    "required install",
    (pkg) => {
      pkg.dependencies["bitcoinjs-lib"] = "6.1.7";
    },
    /Ethereum installs optional wallet peer/,
  ],
  [
    "optional install",
    (pkg) => {
      pkg.optionalDependencies = { "bitcoinjs-lib": "6.1.7" };
    },
    /Ethereum installs optional wallet peer/,
  ],
]) {
  test(`rejects ${name}`, (t) => {
    const candidate = structuredClone(manifest);
    change(candidate);
    assert.throws(() => fixture(t).check(candidate), error);
  });
}

for (const [name, source] of [
  ["static import", 'import { Psbt } from "bitcoinjs-lib";'],
  ["static chunk import", 'import "./bitcoin.js";'],
  ["re-export", 'export * from "./bitcoin.js";'],
  ["dynamic import", 'export const load = () => import("bitcoinjs-lib");'],
  ["dynamic chunk import", 'export const load = () => import("./bitcoin.js");'],
  ["CommonJS import", 'const bitcoin = require("bitcoinjs-lib");'],
  ["deferred CommonJS import", 'Promise.resolve().then(() => require("./bitcoin.js"));'],
]) {
  test(`rejects Bitcoin ${name}`, (t) => {
    assert.throws(() => fixture(t, source).check(), /Ethereum entry imports optional wallet dependency: bitcoinjs-lib/);
  });
}

test("rejects Bitcoin declaration imports through local files", (t) => {
  assert.throws(
    () => fixture(t, undefined, 'export * from "./bitcoin.js";').check(),
    /Ethereum entry imports optional wallet dependency/,
  );
});

for (const [name, source] of [
  ["static import", 'import "@cosmjs/stargate";'],
  ["dynamic import", 'export const load = () => import("@tomo-inc/wallet-connect-sdk");'],
  ["CommonJS import", 'const keplr = require("@keplr-wallet/provider-extension");'],
]) {
  test(`rejects Cosmos ${name} in the Bitcoin-Ethereum entry`, (t) => {
    assert.throws(
      () => fixture(t, undefined, undefined, source).check(),
      /Bitcoin-Ethereum entry includes Cosmos wallet dependency/,
    );
  });
}

test("rejects a Cosmos package bundled into the Bitcoin-Ethereum entry", (t) => {
  const { runtime, check } = fixture(t);
  runtime.btcEth.bundledPackages.add("cosmjs-types");
  assert.throws(() => check(), /Bitcoin-Ethereum entry includes Cosmos wallet dependency: cosmjs-types/);
});

test("accepts the Cosmos encoding helpers the Ledger v1 wallet dependency bundles into the Bitcoin-Ethereum entry", (t) => {
  const { runtime, check } = fixture(t);
  runtime.btcEth.bundledPackages.add("@cosmjs/encoding");
  assert.ok(check());
});

test("rejects a Cosmos type the Bitcoin-Ethereum declarations reach", (t) => {
  assert.throws(
    () =>
      fixture(
        t,
        undefined,
        undefined,
        undefined,
        'export type Client = import("@cosmjs/stargate").SigningStargateClient;',
      ).check(),
    /Bitcoin-Ethereum entry declares Cosmos wallet dependency: @cosmjs\/stargate/,
  );
});

test("accepts a Cosmos types package the manifest installs for every consumer", (t) => {
  // The shared core/types.d.ts reaches it from every entry, the Ethereum one included.
  const declaration = 'export type Chain = import("@keplr-wallet/types").ChainInfo;';
  assert.ok(fixture(t, undefined, declaration, undefined, declaration).check());
});

test("counts a Bitcoin-Ethereum import as a use of its optional peer", (t) => {
  const { runtime, check } = fixture(t);
  runtime.root.packages.delete("@keystonehq/sdk");
  runtime.btcEth.packages.add("@keystonehq/sdk");
  assert.doesNotThrow(() => check());
});

test("counts a Bitcoin-Ethereum declaration as a use of its optional peer", (t) => {
  const declaration = 'export type Sdk = import("@keystonehq/sdk").SDK;';
  const { runtime, check } = fixture(t, undefined, undefined, undefined, declaration);
  runtime.root.packages.delete("@keystonehq/sdk");
  assert.doesNotThrow(() => check());
});

test("rejects an undeclared Ethereum-only dependency", (t) => {
  assert.throws(() => fixture(t, 'import "@keystonehq/animated-qr";').check(), /Undeclared emitted dependency/);
});

test("rejects an unused peer after its optional metadata is removed", (t) => {
  const { declarations, check } = fixture(t);
  const candidate = structuredClone(manifest);
  delete candidate.peerDependenciesMeta[DECLARED_PEER];
  declarations.root.packages.delete(DECLARED_PEER);
  assert.throws(() => check(candidate), /Unused wallet peer: @example\/declared-peer/);
});

for (const section of ["dependencies", "optionalDependencies"]) {
  test(`rejects bundled Bitcoin crypto moved to ${section} or the Ethereum bundle`, (t) => {
    const { runtime, check } = fixture(t);
    const candidate = structuredClone(manifest);
    const name = "@bitcoin-js/tiny-secp256k1-asmjs";
    candidate[section] = { ...candidate[section], [name]: candidate.devDependencies[name] };
    delete candidate.devDependencies[name];
    runtime.root.bundledPackages.add(name);
    assert.throws(() => check(candidate), /Ethereum installs a bundled wallet dependency/);
    runtime.eth.bundledPackages.add(name);
    assert.throws(() => check(), /Ethereum bundles Bitcoin wallet dependency/);
  });
}

test("reads bundled packages from the emitted source map", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wallet-bundle-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "eth.js");
  writeFileSync(
    `${file}.map`,
    JSON.stringify({
      sources: [
        "../src/eth.ts",
        "../../../node_modules/.pnpm/@bitcoin-js+tiny-secp256k1-asmjs@2.2.3/node_modules/@bitcoin-js/tiny-secp256k1-asmjs/lib/index.js",
      ],
    }),
  );
  assert.deepEqual([...bundledDependencies([file])], ["@bitcoin-js/tiny-secp256k1-asmjs"]);
});

test("rejects a new root-only dependency installed for Ethereum", (t) => {
  const { runtime, check } = fixture(t);
  const candidate = structuredClone(manifest);
  candidate.dependencies["@scure/btc-signer"] = "1.8.1";
  runtime.root.packages.add("@scure/btc-signer");
  assert.throws(() => check(candidate), /Missing optional wallet peer: @scure\/btc-signer/);
});

test("rejects missing local chunks", (t) => {
  assert.throws(() => fixture(t, 'import "./missing.js";'), /Missing emitted import/);
});

test("rejects imports that cannot be checked", () => {
  assert.throws(() => importSpecifiers("import(walletModule)", "eth.js"), /computed import/);
  assert.throws(() => importSpecifiers("require(walletModule)", "eth.cjs"), /computed import/);
});

test("ignores import text in comments and strings", () => {
  assert.deepEqual(
    importSpecifiers(
      `// import "bitcoinjs-lib";
    const message = 'require("bitcoinjs-lib")';
    /* import("bitcoinjs-lib") */`,
      "eth.js",
    ),
    [],
  );
});

function bundle(t, contents) {
  const root = mkdtempSync(join(tmpdir(), "wallet-stub-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "index.es.js");
  writeFileSync(file, contents);
  return file;
}

test("rejects cipher-base reading Transform from an empty stream stub", (t) => {
  const file = bundle(
    t,
    `const __viteBrowserExternal = {}, require$$2$2 = /* @__PURE__ */ getAugmentedNamespace(__viteBrowserExternal$1);
    var g = require$$2$2.Transform;`,
  );
  assert.throws(() => assertNoStubbedStreamTransform([file]), /reads stream.Transform from an empty browser stub/);
});

test("rejects a minified Transform read from an empty stream stub", (t) => {
  const file = bundle(t, "require$$2$4=getAugmentedNamespace$1(__viteBrowserExternal$3);var Dc=require$$2$4.Transform;");
  assert.throws(() => assertNoStubbedStreamTransform([file]), /reads stream.Transform from an empty browser stub/);
});

test("rejects a Transform read through another interop helper and pure-comment form", (t) => {
  const file = bundle(t, "var x = /*#__PURE__*/ _interopNamespace(__viteBrowserExternal$1); var g = x.Transform;");
  assert.throws(() => assertNoStubbedStreamTransform([file]), /through x;/);
});

test("rejects a Transform read directly from the stub namespace", (t) => {
  const file = bundle(t, "const __viteBrowserExternal$1 = Object.freeze({}); var g = __viteBrowserExternal$1.Transform;");
  assert.throws(() => assertNoStubbedStreamTransform([file]), /through __viteBrowserExternal\$1;/);
});

test("accepts guarded builtin reads from the stub and Transform from stream-browserify", (t) => {
  const file = bundle(
    t,
    `const require$$2$2 = /* @__PURE__ */ getAugmentedNamespace(__viteBrowserExternal$1);
    var B = require$$2$2; B && B.debuglog;
    var g = requireStreamBrowserify().Transform;`,
  );
  assert.doesNotThrow(() => assertNoStubbedStreamTransform([file]));
});
