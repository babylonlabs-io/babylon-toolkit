import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundledDependencies, checkPackage, emittedDependencies } from "./package-boundary.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const entries = (subpath, formats) => formats.map((format) => resolve(root, manifest.exports[subpath][format]));
const runtime = {
  root: emittedDependencies(entries(".", ["import", "require"])),
  eth: emittedDependencies(entries("./eth", ["import", "require"])),
};
for (const graph of Object.values(runtime)) graph.bundledPackages = bundledDependencies(graph.files);
const declarations = {
  root: emittedDependencies(entries(".", ["types"])),
  eth: emittedDependencies(entries("./eth", ["types"])),
};
const report = checkPackage(manifest, runtime, declarations);
writeFileSync(resolve(root, "dist/package-dependencies.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`Wallet package verified: ${report.optionalPeers.length} optional peers; Ethereum imports none.`);
