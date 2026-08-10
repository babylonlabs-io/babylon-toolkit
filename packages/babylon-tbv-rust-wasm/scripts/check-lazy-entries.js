import { cpSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticSpecifier =
  /(?:import\s+(?!type\b)[\s\S]*?\sfrom\s*|export\s+(?!type\b)[\s\S]*?\sfrom\s*)['"]([^'"]+)['"]/g;

function resolveLocal(from, specifier) {
  const target = resolve(dirname(from), specifier);
  const candidates = extname(target)
    ? [target.replace(/\.js$/, '.ts'), `${target}.ts`]
    : [`${target}.ts`, resolve(target, 'index.ts')];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Continue through TypeScript resolution candidates.
    }
  }
  throw new Error(`Could not resolve ${specifier} from ${from}`);
}

function staticClosure(entry) {
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(staticSpecifier)) {
      const specifier = match[1];
      if (specifier.startsWith('.'))
        pending.push(resolveLocal(file, specifier));
    }
  }
  return visited;
}

for (const entryName of ['index.ts', 'index-node.ts']) {
  const entry = resolve(packageRoot, 'src', entryName);
  const generated = Array.from(staticClosure(entry)).filter((file) =>
    file.includes('/generated/'),
  );
  if (generated.length > 0) {
    throw new Error(
      `${entryName} statically reaches generated WASM glue:\n${generated.join('\n')}`,
    );
  }
}

for (const loaderName of ['wasm-loader.ts', 'wasm-loader-node.ts']) {
  const source = readFileSync(resolve(packageRoot, 'src', loaderName), 'utf8');
  if (!source.includes("import('./generated/vault_wasm.js')")) {
    throw new Error(
      `${loaderName} must dynamically import generated WASM glue`,
    );
  }
}

for (const rawName of ['raw.ts', 'raw-node.ts']) {
  const source = readFileSync(resolve(packageRoot, 'src', rawName), 'utf8');
  if (!/from ['"]\.\/generated\/vault_wasm\.js['"]/.test(source)) {
    throw new Error(`${rawName} must remain the explicit eager raw entry`);
  }
}

// Runtime proof against the compiled artifacts: remove generated glue from an
// isolated package copy. Lazy browser/Node roots must still import, then fail
// only when the first facade call attempts the dynamic import. The explicit
// raw entries must fail during import because their generated import is eager.
const isolatedPackage = mkdtempSync(join(tmpdir(), 'tbv-wasm-lazy-'));
try {
  cpSync(
    resolve(packageRoot, 'package.json'),
    join(isolatedPackage, 'package.json'),
  );
  cpSync(resolve(packageRoot, 'dist'), join(isolatedPackage, 'dist'), {
    recursive: true,
  });
  rmSync(join(isolatedPackage, 'dist', 'generated'), {
    recursive: true,
    force: true,
  });

  for (const entryName of ['index.js', 'index-node.js']) {
    const url = pathToFileURL(join(isolatedPackage, 'dist', entryName)).href;
    const facade = await import(`${url}?lazy-root=${entryName}`);
    try {
      await facade.initWasm();
      throw new Error(`${entryName} first call unexpectedly found WASM glue`);
    } catch (error) {
      if (!String(error).includes('generated/vault_wasm.js')) {
        throw error;
      }
    }
  }

  for (const entryName of ['raw.js', 'raw-node.js']) {
    const url = pathToFileURL(join(isolatedPackage, 'dist', entryName)).href;
    try {
      await import(`${url}?eager-raw=${entryName}`);
      throw new Error(`${entryName} unexpectedly imported without WASM glue`);
    } catch (error) {
      if (!String(error).includes('generated/vault_wasm.js')) {
        throw error;
      }
    }
  }
} finally {
  rmSync(isolatedPackage, { recursive: true, force: true });
}

// Regression: browser facade calls must own independent WASM objects. The
// generated module is initialized through the Node raw entry first so this
// file://-based check does not rely on fetch(file://...). A shared connector
// cache used to let the second call free the first call's object after the
// asynchronous loader resumed but before the first call used its getters.
const rawNodeUrl = pathToFileURL(
  resolve(packageRoot, 'dist', 'raw-node.js'),
).href;
const rawNode = await import(`${rawNodeUrl}?concurrent-connector-init`);
rawNode.initWasm();

const browserFacadeUrl = pathToFileURL(
  resolve(packageRoot, 'dist', 'index.js'),
).href;
const browserFacade = await import(
  `${browserFacadeUrl}?concurrent-connector-facade`
);
const xOnlyKeys = [
  '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
  'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
  'e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13',
  '2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4',
  'fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a1460297556',
].sort();
const connectorParams = {
  txGraphVersion: 1,
  claimer: xOnlyKeys[0],
  localChallengers: [xOnlyKeys[1]],
  universalChallengers: [xOnlyKeys[2]],
  timelockAssert: 144,
  councilMembers: xOnlyKeys.slice(3),
  councilQuorum: 2,
};
const concurrentConnectorResults = await Promise.all([
  browserFacade.getAssertPayoutScriptInfo(connectorParams),
  browserFacade.getAssertPayoutScriptInfo({
    ...connectorParams,
    timelockAssert: 145,
  }),
]);
for (const result of concurrentConnectorResults) {
  if (!result.payoutScript || !result.payoutControlBlock) {
    throw new Error('Concurrent connector facade returned empty script data');
  }
}

console.log('Lazy WASM facade boundary verified (browser, node, and raw).');
