import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmBytes = readFileSync(
  resolve(packageRoot, 'dist', 'generated', 'vault_wasm_bg.wasm'),
);
// This minimal module instantiates, then its exported start function traps.
const trappingWasmBytes = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00,
  0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x14, 0x01, 0x10, 0x5f, 0x5f, 0x77, 0x62,
  0x69, 0x6e, 0x64, 0x67, 0x65, 0x6e, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00,
  0x00, 0x0a, 0x05, 0x01, 0x03, 0x00, 0x00, 0x0b,
]);
// This module instantiates, then its exported start throws through the
// generated wasm-bindgen import. The test replaces Error with LinkError so the
// loader cannot use the error class as a proxy for the initialization phase.
const linkErrorOnStartWasmBytes = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x09, 0x02, 0x60, 0x02,
  0x7f, 0x7f, 0x00, 0x60, 0x00, 0x00, 0x02, 0x3e, 0x01, 0x12, 0x2e, 0x2f, 0x76,
  0x61, 0x75, 0x6c, 0x74, 0x5f, 0x77, 0x61, 0x73, 0x6d, 0x5f, 0x62, 0x67, 0x2e,
  0x6a, 0x73, 0x27, 0x5f, 0x5f, 0x77, 0x62, 0x67, 0x5f, 0x5f, 0x5f, 0x77, 0x62,
  0x69, 0x6e, 0x64, 0x67, 0x65, 0x6e, 0x5f, 0x74, 0x68, 0x72, 0x6f, 0x77, 0x5f,
  0x33, 0x34, 0x34, 0x66, 0x34, 0x32, 0x64, 0x33, 0x32, 0x31, 0x31, 0x63, 0x34,
  0x37, 0x36, 0x35, 0x00, 0x00, 0x03, 0x02, 0x01, 0x01, 0x05, 0x03, 0x01, 0x00,
  0x01, 0x07, 0x1d, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
  0x10, 0x5f, 0x5f, 0x77, 0x62, 0x69, 0x6e, 0x64, 0x67, 0x65, 0x6e, 0x5f, 0x73,
  0x74, 0x61, 0x72, 0x74, 0x00, 0x01, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00,
  0x41, 0x00, 0x10, 0x00, 0x0b,
]);
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

function wotsPublicKey(messageDigits, fill) {
  const terminal = () => Array(20).fill(fill);
  return {
    config: {
      d: 4,
      n: messageDigits,
      checksum_radix: messageDigits === 64 ? 31 : 22,
    },
    message_terminals: Array.from({ length: messageDigits }, terminal),
    checksum_major_terminal: terminal(),
    checksum_minor_terminal: terminal(),
  };
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function withBrowserFacade(fetchImpl, run) {
  const isolatedPackage = mkdtempSync(join(tmpdir(), 'tbv-wasm-test-'));
  const originalFetch = globalThis.fetch;
  try {
    cpSync(
      resolve(packageRoot, 'package.json'),
      join(isolatedPackage, 'package.json'),
    );
    cpSync(resolve(packageRoot, 'dist'), join(isolatedPackage, 'dist'), {
      recursive: true,
    });
    globalThis.fetch = fetchImpl;
    const entry = pathToFileURL(join(isolatedPackage, 'dist', 'index.js')).href;
    await run(await import(entry));
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(isolatedPackage, { recursive: true, force: true });
  }
}

test('retries a transient browser WASM fetch', async () => {
  let fetchCalls = 0;
  await withBrowserFacade(
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) return new Response(null, { status: 503 });
      return new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    },
    async (facade) => {
      const firstCalls = await Promise.allSettled([
        facade.initWasm(),
        facade.initWasm(),
      ]);
      assert.deepEqual(
        firstCalls.map(({ status }) => status),
        ['rejected', 'rejected'],
      );
      assert.equal(fetchCalls, 1);

      await facade.initWasm();
      assert.equal(fetchCalls, 2);
    },
  );
});

test('retries a transient browser WASM body read', async () => {
  let fetchCalls = 0;
  await withBrowserFacade(
    async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('body disconnected'));
            },
          }),
          { headers: { 'Content-Type': 'application/wasm' } },
        );
      }
      return new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    },
    async (facade) => {
      await assert.rejects(facade.initWasm(), /could not be fetched/);
      await facade.initWasm();
      assert.equal(fetchCalls, 2);
    },
  );
});

test('retries invalid WASM bytes that fail before instantiation', async () => {
  let fetchCalls = 0;
  await withBrowserFacade(
    async () => {
      fetchCalls += 1;
      return new Response(fetchCalls === 1 ? Uint8Array.of(0) : wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    },
    async (facade) => {
      await assert.rejects(facade.initWasm(), WebAssembly.CompileError);
      await facade.initWasm();
      assert.equal(fetchCalls, 2);
    },
  );
});

test('latches a failure after WASM is instantiated', async () => {
  let fetchCalls = 0;
  await withBrowserFacade(
    async () => {
      fetchCalls += 1;
      return new Response(trappingWasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    },
    async (facade) => {
      await assert.rejects(facade.initWasm(), /unreachable/);
      await assert.rejects(facade.initWasm(), /unreachable/);
      assert.equal(fetchCalls, 1);
    },
  );
});

test('latches a LinkError after WASM is instantiated', async () => {
  let fetchCalls = 0;
  await withBrowserFacade(
    async () => {
      fetchCalls += 1;
      return new Response(linkErrorOnStartWasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    },
    async (facade) => {
      const NativeError = globalThis.Error;
      let startError;
      try {
        globalThis.Error = WebAssembly.LinkError;
        await facade.initWasm();
      } catch (error) {
        startError = error;
      } finally {
        globalThis.Error = NativeError;
      }

      assert.ok(startError instanceof WebAssembly.LinkError);
      await assert.rejects(facade.initWasm(), WebAssembly.LinkError);
      assert.equal(fetchCalls, 1);
    },
  );
});

test('pins getAssertNoPayoutScriptInfo through the browser entry', async () => {
  await withBrowserFacade(
    async () =>
      new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      }),
    async (facade) => {
      const result = await facade.getAssertNoPayoutScriptInfo(
        connectorParams,
        xOnlyKeys[1],
      );
      assert.deepEqual(
        {
          script: sha256Text(result.noPayoutScript),
          controlBlock: sha256Text(result.noPayoutControlBlock),
        },
        {
          script:
            'd428969a9c775a23c84bf1e897372addc2a12069c5a3389c66a5b26884a6b48b',
          controlBlock:
            '6a68a3687de495af273b18363b166a146525183d0a0550f3c6a77b32163bded5',
        },
      );
    },
  );
});

test('pins getChallengeAssertScriptInfo through the browser entry', async () => {
  const claimerWotsKeysJson = JSON.stringify(wotsPublicKey(64, 1));
  const gcWotsKeysJson = JSON.stringify([
    Array.from({ length: 6 }, (_, index) => wotsPublicKey(32, index + 2)),
    Array.from({ length: 6 }, (_, index) => wotsPublicKey(32, index + 8)),
  ]);

  await withBrowserFacade(
    async () =>
      new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      }),
    async (facade) => {
      const result = await facade.getChallengeAssertScriptInfo({
        txGraphVersion: 1,
        claimer: xOnlyKeys[0],
        challenger: xOnlyKeys[1],
        claimerWotsKeysJson,
        gcWotsKeysJson,
      });
      assert.deepEqual(
        {
          script: sha256Text(result.script),
          controlBlock: sha256Text(result.controlBlock),
        },
        {
          script:
            '3e6de1e5ce5ebb76b05659e7040befe3e2398ab4c809f8195fb271815cedfb76',
          controlBlock:
            '7ece40ba5cd9386d50ae395585c102cb123776238e8d6bd17e6ea1359a294f1a',
        },
      );
    },
  );
});
