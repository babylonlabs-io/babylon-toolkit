import { cpSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The third alternative matches a bare side-effect import (`import './x.js'`),
// which has no `from` clause. Without it the closure walks past an eager edge.
const staticSpecifier =
  /(?:import\s+(?!type\b)[\s\S]*?\sfrom\s*|export\s+(?!type\b)[\s\S]*?\sfrom\s*|import\s*)['"]([^'"]+)['"]/g;

// Comments are removed before the specifier scan. Prose in a JSDoc block can
// contain the bare word `import` or `export`, and the lazy `[\s\S]*?` between
// the keyword and its `from` clause would otherwise swallow the next real
// specifier. A commented-out import must not count as an eager edge either.
function stripComments(source) {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== char) {
        cursor += source[cursor] === '\\' ? 2 : 1;
      }
      out += source.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

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

// The glue is matched on the specifier, not on a resolved path: it ships only
// as dist/generated/vault_wasm.js, so an eager edge to it never resolves to a
// file this walk can visit.
const generatedSpecifier = /(?:^|\/)generated\//;

function eagerGeneratedEdges(entry) {
  const pending = [entry];
  const visited = new Set();
  const edges = [];
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(staticSpecifier)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      if (generatedSpecifier.test(specifier)) {
        edges.push(`${file} -> ${specifier}`);
        continue;
      }
      pending.push(resolveLocal(file, specifier));
    }
  }
  return edges;
}

for (const entryName of ['index.ts', 'index-node.ts']) {
  const entry = resolve(packageRoot, 'src', entryName);
  const edges = eagerGeneratedEdges(entry);
  if (edges.length > 0) {
    throw new Error(
      `${entryName} statically reaches generated WASM glue, so importing the ` +
        `facade loads the engine eagerly. Reach the glue only through ` +
        `import('./generated/vault_wasm.js') inside a loader, or through the ` +
        `explicit raw entry:\n${edges.join('\n')}`,
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

// Each loader's type-only import is copied into its emitted declaration
// verbatim, so it has to resolve from dist too. Nothing reports it when it
// stops resolving: tsc is silent here, and every consumer inherits
// skipLibCheck, which drops the error inside the emitted declaration.
for (const loaderName of ['wasm-loader.d.ts', 'wasm-loader-node.d.ts']) {
  const emitted = resolve(packageRoot, 'dist', loaderName);
  const match = readFileSync(emitted, 'utf8').match(
    /from ['"]([^'"]*generated\/vault_wasm\.js)['"]/,
  );
  if (!match) {
    throw new Error(
      `${loaderName} no longer pins its bindings to the generated declarations`,
    );
  }
  const [, specifier] = match;
  try {
    readFileSync(
      resolve(dirname(emitted), specifier.replace(/\.js$/, '.d.ts')),
    );
  } catch {
    throw new Error(
      `${loaderName} emits '${specifier}', which resolves to no declaration ` +
        `from dist. The emitted specifier reaches the generated surface only ` +
        `while the emit directory and src stay siblings one level under the ` +
        `package root.`,
    );
  }
}

for (const [rawName, loaderName] of [
  ['raw.ts', 'wasm-loader.js'],
  ['raw-node.ts', 'wasm-loader-node.js'],
]) {
  const source = readFileSync(resolve(packageRoot, 'src', rawName), 'utf8');
  if (!/from ['"]\.\/generated\/vault_wasm\.js['"]/.test(source)) {
    throw new Error(`${rawName} must remain the explicit eager raw entry`);
  }
  if (!source.includes(`export { initWasm } from './${loaderName}'`)) {
    throw new Error(
      `${rawName} must re-export initWasm from ./${loaderName}, so the raw ` +
        `and facade entries share one initializer and cannot initialize the ` +
        `generated module twice`,
    );
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
const payoutConnectorParams = {
  txGraphVersion: 1,
  depositor: xOnlyKeys[0],
  vaultProvider: xOnlyKeys[1],
  vaultKeepers: [xOnlyKeys[2]],
  universalChallengers: [xOnlyKeys[3]],
  timelockPegin: 144,
};

// Browser raw and facade entry points must share one in-flight initializer.
// A second wasm-bindgen initialization replaces the module-global memory and
// invalidates raw objects created after the first initialization completes.
const browserRacePackage = mkdtempSync(join(tmpdir(), 'tbv-wasm-race-'));
const originalFetch = globalThis.fetch;
let browserRaceConnector;
let browserRaceCompleted = false;
try {
  cpSync(
    resolve(packageRoot, 'package.json'),
    join(browserRacePackage, 'package.json'),
  );
  cpSync(resolve(packageRoot, 'dist'), join(browserRacePackage, 'dist'), {
    recursive: true,
  });
  const wasmBytes = readFileSync(
    join(
      browserRacePackage,
      'dist',
      'generated',
      'vault_wasm_bg.wasm',
    ),
  );
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    const delayMs = fetchCalls === 1 ? 20 : 200;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    return new Response(wasmBytes, {
      headers: { 'Content-Type': 'application/wasm' },
    });
  };

  const rawBrowserUrl = pathToFileURL(
    join(browserRacePackage, 'dist', 'raw.js'),
  ).href;
  const facadeBrowserUrl = pathToFileURL(
    join(browserRacePackage, 'dist', 'index.js'),
  ).href;
  const rawBrowser = await import(`${rawBrowserUrl}?shared-browser-init=raw`);
  const facadeBrowser = await import(
    `${facadeBrowserUrl}?shared-browser-init=facade`
  );

  const rawInit = rawBrowser.initWasm();
  const facadeInit = facadeBrowser.initWasm();
  await rawInit;
  browserRaceConnector = new rawBrowser.WasmPeginPayoutConnector(
    payoutConnectorParams.txGraphVersion,
    payoutConnectorParams.depositor,
    payoutConnectorParams.vaultProvider,
    payoutConnectorParams.vaultKeepers,
    payoutConnectorParams.universalChallengers,
    payoutConnectorParams.timelockPegin,
  );
  const payoutScriptBefore = browserRaceConnector.getPayoutScript();
  await facadeInit;
  const payoutScriptAfter = browserRaceConnector.getPayoutScript();

  if (fetchCalls !== 1) {
    throw new Error(
      `Browser raw and facade entries initialized WASM ${fetchCalls} times`,
    );
  }
  if (payoutScriptAfter !== payoutScriptBefore) {
    throw new Error('Concurrent browser initialization invalidated a raw object');
  }
  browserRaceCompleted = true;
} finally {
  try {
    if (browserRaceCompleted) browserRaceConnector?.free();
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(browserRacePackage, { recursive: true, force: true });
  }
}

// Concurrent browser-facade calls with different parameters must each return
// their own complete result. That is what per-call connector ownership buys:
// neither call can free or overwrite the object the other is reading. The
// generated module is initialized through the Node raw entry first so this
// file://-based check does not rely on fetch(file://...).
const rawNodeUrl = pathToFileURL(
  resolve(packageRoot, 'dist', 'raw-node.js'),
).href;
const rawNode = await import(`${rawNodeUrl}?concurrent-connector-init`);
await rawNode.initWasm();

const browserFacadeUrl = pathToFileURL(
  resolve(packageRoot, 'dist', 'index.js'),
).href;
const browserFacade = await import(
  `${browserFacadeUrl}?concurrent-connector-facade`
);
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
// The two calls differ only in `timelockAssert`, so their script data must
// differ too. Truthiness alone would pass a cache that hands both callers the
// same connector — the wrong taproot leaf, fully populated.
const [firstConnectorResult, secondConnectorResult] =
  concurrentConnectorResults;
if (
  firstConnectorResult.payoutScript === secondConnectorResult.payoutScript ||
  firstConnectorResult.payoutControlBlock ===
    secondConnectorResult.payoutControlBlock
) {
  throw new Error(
    'Concurrent connector facade returned aliased script data for different timelockAssert values',
  );
}

console.log('Lazy WASM facade boundary verified (browser, node, and raw).');
