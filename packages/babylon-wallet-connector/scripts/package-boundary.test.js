import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  bundledDependencies,
  checkPackage,
  emittedDependencies,
  importSpecifiers,
  walletExternals,
} from "./package-boundary.js";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function fixture(t, source = 'import "react";', declaration = "export {};") {
  const root = mkdtempSync(join(tmpdir(), "wallet-import-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries({
    "root.js": walletExternals.map((name) => `import ${JSON.stringify(name)};`).join("\n"),
    "root.d.ts": 'export type Signer = import("@cosmjs/proto-signing").OfflineSigner;',
    "eth.js": source,
    "eth.d.ts": declaration,
    "bitcoin.js": 'export * from "bitcoinjs-lib/src/payments/index.js";',
    "bitcoin.d.ts": 'export type { Psbt } from "bitcoinjs-lib";',
  })) {
    writeFileSync(join(root, file), contents);
  }
  const runtime = {
    root: emittedDependencies([join(root, "root.js")]),
    eth: emittedDependencies([join(root, "eth.js")]),
  };
  const declarations = {
    root: emittedDependencies([join(root, "root.d.ts")]),
    eth: emittedDependencies([join(root, "eth.d.ts")]),
  };
  return (candidate = manifest) => checkPackage(candidate, runtime, declarations);
}

test("accepts optional peers derived from the build externals and declarations", (t) => {
  assert.deepEqual(fixture(t)().optionalPeers, [...walletExternals, "@cosmjs/proto-signing"].sort());
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
    assert.throws(() => fixture(t)(candidate), error);
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
    assert.throws(() => fixture(t, source)(), /Ethereum entry imports optional wallet dependency: bitcoinjs-lib/);
  });
}

test("rejects Bitcoin declaration imports through local files", (t) => {
  assert.throws(
    () => fixture(t, undefined, 'export * from "./bitcoin.js";')(),
    /Ethereum entry imports optional wallet dependency/,
  );
});

test("rejects an undeclared Ethereum-only dependency", (t) => {
  assert.throws(() => fixture(t, 'import "@keystonehq/animated-qr";')(), /Undeclared emitted dependency/);
});

test("rejects an unused peer after its optional metadata is removed", () => {
  const candidate = structuredClone(manifest);
  delete candidate.peerDependenciesMeta["@cosmjs/proto-signing"];
  const graph = (names) => ({ packages: new Set(names) });
  assert.throws(
    () =>
      checkPackage(
        candidate,
        {
          root: graph(walletExternals),
          eth: graph(["react"]),
        },
        {
          root: graph([]),
          eth: graph([]),
        },
      ),
    /Unused wallet peer: @cosmjs\/proto-signing/,
  );
});

for (const section of ["dependencies", "optionalDependencies"]) {
  test(`rejects bundled Bitcoin crypto moved to ${section}`, () => {
    const candidate = structuredClone(manifest);
    const name = "@bitcoin-js/tiny-secp256k1-asmjs";
    candidate[section] = { ...candidate[section], [name]: candidate.devDependencies[name] };
    delete candidate.devDependencies[name];
    const graph = (names) => ({ packages: new Set(names) });
    assert.throws(
      () =>
        checkPackage(
          candidate,
          {
            root: { ...graph(walletExternals), bundledPackages: new Set([name]) },
            eth: graph(["react"]),
          },
          {
            root: graph(["@cosmjs/proto-signing"]),
            eth: graph([]),
          },
        ),
      /Ethereum installs a bundled wallet dependency/,
    );
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

test("rejects a new root-only dependency installed for Ethereum", () => {
  const graph = (names) => ({ packages: new Set(names) });
  const candidate = structuredClone(manifest);
  candidate.dependencies["@scure/btc-signer"] = "1.8.1";
  assert.throws(
    () =>
      checkPackage(
        candidate,
        {
          root: graph([...walletExternals, "@scure/btc-signer"]),
          eth: graph(["react"]),
        },
        {
          root: graph(["@cosmjs/proto-signing"]),
          eth: graph([]),
        },
      ),
    /Missing optional wallet peer: @scure\/btc-signer/,
  );
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
