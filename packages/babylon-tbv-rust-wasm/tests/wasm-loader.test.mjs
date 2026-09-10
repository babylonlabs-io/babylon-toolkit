import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageExports = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
).exports;
const rawClassNames = [
  'WasmPeginTx',
  'WasmPeginPayoutConnector',
  'WasmPrePeginTx',
  'WasmPrePeginHtlcConnector',
];

for (const entry of ['raw', 'raw-node']) {
  test(`${entry} retains the raw API and shared initializer`, async () => {
    assert.deepEqual(
      packageExports['./raw'][entry === 'raw' ? 'default' : 'node'],
      {
        types: `./dist/${entry}.d.ts`,
        default: `./dist/${entry}.js`,
      },
    );
    const raw = await import(`../dist/${entry}.js`);
    const generated = await import('../dist/generated/vault_wasm.js');
    const loader = await import(
      `../dist/${entry === 'raw' ? 'wasm-loader' : 'wasm-loader-node'}.js`
    );
    assert.deepEqual(
      Object.keys(raw).sort(),
      [...rawClassNames, 'initWasm'].sort(),
    );
    for (const name of rawClassNames) {
      assert.equal(typeof raw[name], 'function', name);
      if (
        name === 'WasmPrePeginHtlcConnector' ||
        name === 'WasmPeginPayoutConnector'
      ) {
        assert.notEqual(raw[name], generated[name]);
      } else {
        assert.equal(raw[name], generated[name]);
      }
    }
    assert.equal(raw.initWasm, loader.initWasm);
  });

  test(`${entry} preserves class types and marks consumer imports deprecated`, () => {
    const consumerFile = join(packageRoot, 'dist', 'raw-consumer.ts');
    const source = [
      `import { ${rawClassNames.join(', ')} } from './${entry}.js';`,
      "import * as generated from './generated/vault_wasm.js';",
      'type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;',
      'type Check<T extends true> = T;',
      ...rawClassNames.flatMap((name) => [
        `type CheckType${name} = Check<Same<${name}, generated.${name}>>;`,
        `type CheckConstructor${name} = Check<Same<typeof ${name}, typeof generated.${name}>>;`,
        `void ${name};`,
      ]),
    ].join('\n');
    const options = {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      skipLibCheck: true,
    };
    const service = ts.createLanguageService({
      ...ts.sys,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
      getScriptFileNames: () => [consumerFile],
      getScriptVersion: () => '0',
      getScriptSnapshot(file) {
        const text = file === consumerFile ? source : ts.sys.readFile(file);
        return text === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => packageRoot,
      getCompilationSettings: () => options,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
    });
    try {
      assert.deepEqual(
        service
          .getSemanticDiagnostics(consumerFile)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          ),
        [],
      );
      for (const name of rawClassNames) {
        for (const reference of [`void ${name}`, `Same<${name},`]) {
          const info = service.getQuickInfoAtPosition(
            consumerFile,
            source.indexOf(reference) + 5,
          );
          assert.ok(
            info?.tags?.some((tag) => tag.name === 'deprecated'),
            `${name} must be deprecated at ${reference}`,
          );
        }
      }
    } finally {
      service.dispose();
    }
  });
}

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
const payoutConnectorParams = {
  txGraphVersion: 1,
  depositor: xOnlyKeys[0],
  vaultProvider: xOnlyKeys[1],
  vaultKeepers: [xOnlyKeys[2]],
  universalChallengers: [xOnlyKeys[3]],
  timelockPegin: 1008,
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
    symlinkSync(
      resolve(packageRoot, 'node_modules'),
      join(isolatedPackage, 'node_modules'),
    );
    globalThis.fetch = fetchImpl;
    const entry = pathToFileURL(join(isolatedPackage, 'dist', 'index.js')).href;
    await run(await import(entry), entry);
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

test('pins getAssertPayoutScriptInfo through the browser entry', async () => {
  await withBrowserFacade(
    async () =>
      new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      }),
    async (facade) => {
      const result = await facade.getAssertPayoutScriptInfo(connectorParams);
      assert.deepEqual(
        {
          script: sha256Text(result.payoutScript),
          controlBlock: sha256Text(result.payoutControlBlock),
        },
        {
          script:
            '4b6fa03aad6f737be6e8c960f3c69e369242a54893db38d95457eb73bebcbbec',
          controlBlock:
            '33fa9421213d024727a823ea9d0bbd7f52a47668a7e6d782d81f7d5e0705d590',
        },
      );
    },
  );
});

test('pins createPayoutConnector through the browser entry', async () => {
  await withBrowserFacade(
    async () =>
      new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      }),
    async (facade) => {
      const result = await facade.createPayoutConnector(
        payoutConnectorParams,
        'signet',
      );
      // The control block is pinned raw: a single leaf makes it one
      // version/parity byte plus the NUMS internal key, readable in a
      // failure diff.
      assert.deepEqual(
        {
          script: sha256Text(result.payoutScript),
          controlBlock: result.payoutControlBlock,
          taprootScriptHash: result.taprootScriptHash,
          scriptPubKey: result.scriptPubKey,
          address: result.address,
        },
        {
          script:
            'd851c37a211d3e4c55b2bae8a2a3262e2960de9f1015e43986f76ce5c8628991',
          controlBlock:
            'c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          taprootScriptHash:
            '82c0e27be3e706b67c07953fa18ed9b9854ea1cebbc1040f535b130f38f72c73',
          scriptPubKey:
            '5120f168b9531c9ace8d638245e004e2550756b996300391337e169c7fb5c354d61d',
          address:
            'tb1p795tj5cunt8g6cuzghsqfcj4qattn93sqwgnxlskn3lmts656cwsk4p9uy',
        },
      );
    },
  );
});

test('createPayoutConnector forwards the network to the address through the browser entry', async () => {
  await withBrowserFacade(
    async () =>
      new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      }),
    async (facade) => {
      // Signet and testnet share the `tb` prefix, so the signet pin above
      // cannot tell them apart. Mainnet can.
      const result = await facade.createPayoutConnector(
        payoutConnectorParams,
        'bitcoin',
      );
      assert.equal(
        result.address,
        'bc1p795tj5cunt8g6cuzghsqfcj4qattn93sqwgnxlskn3lmts656cwspah2xt',
      );
    },
  );
});

async function withRawEntry(entry, run) {
  if (entry === 'raw-node') {
    const raw = await import('../dist/raw-node.js');
    await raw.initWasm();
    await run(
      raw,
      await import('../dist/generated/vault_wasm.js'),
      await import('../dist/index-node.js'),
    );
    return;
  }
  await withBrowserFacade(
    async () =>
      new Response(wasmBytes, {
        headers: { 'Content-Type': 'application/wasm' },
      }),
    async (facade, url) => {
      const raw = await import(new URL('./raw.js', url));
      await raw.initWasm();
      await run(
        raw,
        await import(new URL('./generated/vault_wasm.js', url)),
        facade,
      );
    },
  );
}

function htlcArgs(version = 1, keepers = [xOnlyKeys[2]]) {
  return [
    version,
    xOnlyKeys[0],
    xOnlyKeys[1],
    keepers,
    [xOnlyKeys[3]],
    sha256Text('raw HTLC'),
    144,
  ];
}

function payoutArgs(params = payoutConnectorParams) {
  return [
    params.txGraphVersion,
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin,
  ];
}

const payoutGetters = [
  'getPayoutScript',
  'getPayoutControlBlock',
  'getTaprootScriptHash',
  'getTxGraphVersion',
];

for (const entry of ['raw', 'raw-node']) {
  test(`${entry} pins independent payout fields for every graph version`, async () => {
    await withRawEntry(entry, async (raw, generated, facade) => {
      for (const version of [1, 2, 3]) {
        const params = { ...payoutConnectorParams, txGraphVersion: version };
        const expected = await facade.deriveExpectedPeginPayout(params);
        assert.equal(
          expected.scriptPubKey.toString('hex'),
          '5120f168b9531c9ace8d638245e004e2550756b996300391337e169c7fb5c354d61d',
        );
        assert.equal(
          expected.taprootScriptHash.toString('hex'),
          '82c0e27be3e706b67c07953fa18ed9b9854ea1cebbc1040f535b130f38f72c73',
        );
        assert.equal(
          expected.payoutControlBlock.toString('hex'),
          'c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
        );
        assert.equal(
          sha256Text(expected.payoutScript.toString('hex')),
          'd851c37a211d3e4c55b2bae8a2a3262e2960de9f1015e43986f76ce5c8628991',
        );
        const checked = new raw.WasmPeginPayoutConnector(...payoutArgs(params));
        const original = new generated.WasmPeginPayoutConnector(
          ...payoutArgs(params),
        );
        try {
          assert.ok(checked instanceof raw.WasmPeginPayoutConnector);
          for (const getter of payoutGetters)
            assert.equal(checked[getter](), original[getter]());
          for (const network of [
            'bitcoin',
            'testnet',
            'testnet4',
            'signet',
            'regtest',
          ]) {
            assert.equal(
              checked.getAddress(network),
              original.getAddress(network),
            );
            assert.equal(
              checked.getScriptPubKey(network),
              original.getScriptPubKey(network),
            );
          }
          assert.throws(
            () => checked.getAddress('mainnet'),
            /Unsupported Bitcoin network/,
          );
          assert.throws(
            () => checked.getScriptPubKey('invalid'),
            /Unsupported Bitcoin network/,
          );
        } finally {
          checked.free();
          original.free();
        }
        assert.throws(() => checked.getPayoutScript(), /null pointer passed to rust/);
      }
    });
  });

  test(`${entry} matches randomized payout inputs and script-number boundaries`, async () => {
    await withRawEntry(entry, async (raw, generated, facade) => {
      const timelocks = [1, 16, 17, 127, 128, 255, 256, 32767, 32768, 65535];
      for (let sample = 0; sample < timelocks.length; sample += 1) {
        const keys = Array.from({ length: 36 }, () =>
          Buffer.from(
            secp256k1
              .getPublicKey(secp256k1.utils.randomPrivateKey(), true)
              .subarray(1),
          ).toString('hex'),
        );
        const count = [1, 2, 16, 17][sample % 4];
        const params = {
          txGraphVersion: 1 + (sample % 3),
          depositor: keys[0],
          vaultProvider: keys[1],
          vaultKeepers: keys.slice(2, 2 + count),
          universalChallengers: keys.slice(19, 19 + count),
          timelockPegin: timelocks[sample],
        };
        const checked = new raw.WasmPeginPayoutConnector(...payoutArgs(params));
        const original = new generated.WasmPeginPayoutConnector(
          ...payoutArgs(params),
        );
        try {
          for (const getter of payoutGetters)
            assert.equal(checked[getter](), original[getter]());
          assert.equal(
            checked.getAddress('signet'),
            original.getAddress('signet'),
          );
          assert.equal(
            checked.getScriptPubKey('signet'),
            original.getScriptPubKey('signet'),
          );
          const reordered = await facade.deriveExpectedPeginPayout({
            ...params,
            vaultKeepers: [...params.vaultKeepers].reverse(),
            universalChallengers: [...params.universalChallengers].reverse(),
          });
          assert.equal(
            reordered.payoutScript.toString('hex'),
            original.getPayoutScript(),
          );
        } finally {
          checked.free();
          original.free();
        }
      }
    });
  });

  test(`${entry} rejects changed payout fields at raw and async boundaries`, async () => {
    await withRawEntry(entry, async (raw, generated, facade) => {
      const prototype = generated.WasmPeginPayoutConnector.prototype;
      for (const getter of [
        ...payoutGetters,
        'getScriptPubKey',
        'getAddress',
      ]) {
        const checked = new raw.WasmPeginPayoutConnector(...payoutArgs());
        const original = prototype[getter];
        const free = prototype.free;
        let releases = 0;
        prototype.free = function () {
          releases += 1;
          return free.call(this);
        };
        prototype[getter] = function (...args) {
          const value = original.apply(this, args);
          return typeof value === 'number'
            ? value + 1
            : value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
        };
        try {
          assert.throws(() => checked[getter]('bitcoin'), /does not match/);
          if (getter !== 'getAddress') {
            assert.throws(
              () => new raw.WasmPeginPayoutConnector(...payoutArgs()),
              /does not match/,
            );
            assert.equal(releases, 1);
            await assert.rejects(
              facade.getPeginPayoutScriptInfo(payoutConnectorParams),
              /does not match/,
            );
            assert.equal(releases, 2);
          }
          const before = releases;
          await assert.rejects(
            facade.createPayoutConnector(payoutConnectorParams, 'bitcoin'),
            /does not match/,
          );
          assert.equal(
            releases,
            before + 1,
            'failed async construction releases the engine object',
          );
        } finally {
          prototype[getter] = original;
          prototype.free = free;
          checked.free();
        }
      }
    });
  });

  test(`${entry} validates original payout inputs and keeps its private expectations`, async () => {
    await withRawEntry(entry, async (raw, generated) => {
      const params = {
        ...payoutConnectorParams,
        vaultKeepers: [...payoutConnectorParams.vaultKeepers],
      };
      const checked = new raw.WasmPeginPayoutConnector(...payoutArgs(params));
      const expected = checked.getPayoutScript();
      params.vaultKeepers[0] = xOnlyKeys[4];
      params.timelockPegin += 1;
      assert.equal(checked.getPayoutScript(), expected);
      checked[Symbol.dispose]();
      assert.throws(() => checked.getPayoutControlBlock(), /null pointer passed to rust/);
      for (const version of [0, 4, 99, 0x100000001, NaN]) {
        assert.throws(
          () =>
            new raw.WasmPeginPayoutConnector(
              ...payoutArgs({
                ...payoutConnectorParams,
                txGraphVersion: version,
              }),
            ),
          /Unsupported payout graph version/,
        );
      }
      for (const timelock of [0, -1, 1.5, 65536, 65537, NaN, Infinity]) {
        assert.throws(
          () =>
            new raw.WasmPeginPayoutConnector(
              ...payoutArgs({
                ...payoutConnectorParams,
                timelockPegin: timelock,
              }),
            ),
          /timelockPegin/,
        );
      }
      // The derivation must accept exactly what the engine accepts, so that
      // no input can produce a script on one side and an error on the other.
      const prefixedArgs = payoutArgs({
        ...payoutConnectorParams,
        depositor: `0x${payoutConnectorParams.depositor}`,
      });
      assert.throws(
        () => new raw.WasmPeginPayoutConnector(...prefixedArgs),
        /depositor must be a 32-byte x-only public key/,
      );
      assert.throws(
        () => new generated.WasmPeginPayoutConnector(...prefixedArgs),
        /malformed public key/,
      );
      for (const role of ['vaultKeepers', 'universalChallengers']) {
        for (const keys of [[], [xOnlyKeys[0], xOnlyKeys[0].toUpperCase()]]) {
          assert.throws(
            () =>
              new raw.WasmPeginPayoutConnector(
                ...payoutArgs({ ...payoutConnectorParams, [role]: keys }),
              ),
            /must not/,
          );
        }
      }
      assert.throws(
        () =>
          new raw.WasmPeginPayoutConnector(
            ...payoutArgs({
              ...payoutConnectorParams,
              depositor: 'ff'.repeat(32),
            }),
          ),
        /secp256k1 x-coordinate/,
      );
    });
  });
}

const htlcGetters = [
  'getHashlockScript',
  'getHashlockControlBlock',
  'getRefundScript',
  'getRefundControlBlock',
  'getTxGraphVersion',
];

for (const entry of ['raw', 'raw-node']) {
  test(`${entry} matches real HTLC connectors for all versions and networks`, async () => {
    await withRawEntry(entry, async (raw, generated) => {
      for (const version of [1, 2, 3]) {
        for (const keepers of [[xOnlyKeys[2]], [xOnlyKeys[4], xOnlyKeys[2]]]) {
          const args = htlcArgs(version, keepers);
          const checked = new raw.WasmPrePeginHtlcConnector(...args);
          const original = new generated.WasmPrePeginHtlcConnector(...args);
          try {
            assert.ok(checked instanceof raw.WasmPrePeginHtlcConnector);
            for (const getter of htlcGetters)
              assert.equal(checked[getter](), original[getter]());
            for (const network of [
              'bitcoin',
              'testnet',
              'testnet4',
              'signet',
              'regtest',
            ]) {
              assert.equal(
                checked.getAddress(network),
                original.getAddress(network),
              );
              assert.equal(
                checked.getScriptPubKey(network),
                original.getScriptPubKey(network),
              );
            }
            assert.throws(() => checked.getAddress('mainnet'), /Unsupported Bitcoin network/);
            assert.throws(() => checked.getScriptPubKey('invalid'), /Unsupported Bitcoin network/);
          } finally {
            checked.free();
            original.free();
          }
          assert.throws(() => checked.getHashlockScript(), /null pointer passed to rust/);
        }
      }
    });
  });

  test(`${entry} pins HTLC signing data and matches randomized engine inputs`, async () => {
    await withRawEntry(entry, async (raw, generated) => {
      const pinned = new raw.WasmPrePeginHtlcConnector(...htlcArgs());
      try {
        assert.equal(
          pinned.getScriptPubKey('bitcoin'),
          '51201e329cae02c721440dd11bb652c9992e59b9ca7b2a8dbbb08d6fd49278a47fa4',
        );
        assert.equal(
          sha256Text(
            [
              pinned.getHashlockScript(),
              pinned.getHashlockControlBlock(),
              pinned.getRefundScript(),
              pinned.getRefundControlBlock(),
            ].join('|'),
          ),
          '625a8b363190adc2e1f6b3edea52cbed792b96967dbb2bb5be5e2635ad1598cf',
        );
      } finally {
        pinned.free();
      }
      for (let sample = 0; sample < 12; sample += 1) {
        const keys = Array.from({ length: 6 }, () =>
          Buffer.from(
            secp256k1
              .getPublicKey(secp256k1.utils.randomPrivateKey(), true)
              .subarray(1),
          ).toString('hex'),
        );
        const args = [
          1 + (sample % 3),
          keys[0],
          keys[1],
          keys.slice(2, 4),
          keys.slice(4),
          sha256Text(keys.join('')),
          1 + sample * 31,
        ];
        const checked = new raw.WasmPrePeginHtlcConnector(...args);
        const original = new generated.WasmPrePeginHtlcConnector(...args);
        try {
          for (const getter of htlcGetters)
            assert.equal(checked[getter](), original[getter]());
          assert.equal(
            checked.getAddress('signet'),
            original.getAddress('signet'),
          );
          assert.equal(
            checked.getScriptPubKey('signet'),
            original.getScriptPubKey('signet'),
          );
        } finally {
          checked.free();
          original.free();
        }
      }
    });
  });

  test(`${entry} rejects changed HTLC outputs and releases failed construction`, async () => {
    await withRawEntry(entry, async (raw, generated) => {
      const prototype = generated.WasmPrePeginHtlcConnector.prototype;
      for (const getter of [...htlcGetters, 'getScriptPubKey', 'getAddress']) {
        const checked = new raw.WasmPrePeginHtlcConnector(...htlcArgs());
        const original = prototype[getter];
        const free = prototype.free;
        let releases = 0;
        prototype.free = function () {
          releases += 1;
          return free.call(this);
        };
        prototype[getter] = function (...args) {
          const value = original.apply(this, args);
          return typeof value === 'number'
            ? value + 1
            : value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
        };
        try {
          assert.throws(() => checked[getter]('bitcoin'), /does not match/);
          if (getter !== 'getAddress') {
            assert.throws(
              () => new raw.WasmPrePeginHtlcConnector(...htlcArgs()),
              /does not match/,
            );
            assert.equal(
              releases,
              1,
              'failed construction releases its engine object',
            );
          }
        } finally {
          prototype[getter] = original;
          prototype.free = free;
          checked.free();
        }
      }
    });
  });

  test(`${entry} keeps trusted HTLC inputs after caller mutation and supports dispose`, async () => {
    await withRawEntry(entry, async (raw) => {
      const keepers = [xOnlyKeys[2]];
      const checked = new raw.WasmPrePeginHtlcConnector(
        ...htlcArgs(1, keepers),
      );
      const expected = checked.getHashlockScript();
      keepers[0] = xOnlyKeys[4];
      assert.equal(checked.getHashlockScript(), expected);
      checked[Symbol.dispose]();
      assert.throws(() => checked.getRefundControlBlock(), /null pointer passed to rust/);
      for (const version of [0, 4, 99, 0x100000001, NaN]) {
        assert.throws(
          () => new raw.WasmPrePeginHtlcConnector(...htlcArgs(version)),
          /Unsupported HTLC graph version/,
        );
      }
      const invalid = htlcArgs();
      invalid[6] = 0;
      assert.throws(
        () => new raw.WasmPrePeginHtlcConnector(...invalid),
        /timelockRefund/,
      );
    });
  });
}
