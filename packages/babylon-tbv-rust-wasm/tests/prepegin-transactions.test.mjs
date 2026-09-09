import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { test } from 'node:test';
import { RawOldTx, RawTx } from '@scure/btc-signer/script';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { getWasmBindings } from '../dist/wasm-loader-node.js';
import { WasmPrePeginTx } from '../dist/raw-node.js';
import { createPrePeginTransaction } from '../dist/index-node.js';

const bindings = await getWasmBindings();
// Use the SDK's deterministic secp256k1 key vectors and real WASM transactions.
const keys = Array.from({ length: 6 }, (_, index) =>
  Buffer.from(
    secp256k1.getPublicKey(BigInt(index + 1), true).subarray(1),
  ).toString('hex'),
);
const hashlock = createHash('sha256')
  .update(Buffer.from(keys[0], 'hex'))
  .digest('hex');
function params(version, overrides = {}) {
  return {
    txGraphVersion: version,
    depositorPubkey: keys[0],
    vaultProviderPubkey: keys[1],
    vaultKeeperPubkeys: keys.slice(2, 4),
    universalChallengerPubkeys: keys.slice(4),
    hashlocks: [hashlock],
    pegInAmounts: [90_000n],
    timelockRefund: 50,
    feeRate: 3n,
    minPeginFeeRate: 7n,
    numLocalChallengers: 2,
    councilQuorum: 2,
    councilSize: 3,
    network: 'signet',
    ...overrides,
  };
}
function args(p, native = false) {
  return [
    p.txGraphVersion,
    p.depositorPubkey,
    p.vaultProviderPubkey,
    p.vaultKeeperPubkeys,
    p.universalChallengerPubkeys,
    p.hashlocks,
    native ? new BigUint64Array(p.pegInAmounts) : p.pegInAmounts,
    p.timelockRefund,
    p.feeRate,
    p.minPeginFeeRate,
    p.numLocalChallengers,
    p.councilQuorum,
    p.councilSize,
    p.network,
    p.authAnchorHash,
  ];
}
function encode(tx) {
  return Buffer.from(RawTx.encode(tx)).toString('hex');
}
function fundedBytes(native) {
  const bytes = Buffer.from(native.toHex(), 'hex');
  const template = RawOldTx.decode(
    Buffer.concat([bytes.subarray(0, 4), bytes.subarray(6)]),
  );
  // Reuse a real engine transaction ID as the funding outpoint. These tests
  // check construction and do not claim that this transaction was broadcast.
  return encode({
    ...template,
    inputs: [
      {
        txid: Buffer.from(native.getTxid(), 'hex'),
        index: template.outputs.length - 1,
        finalScriptSig: new Uint8Array(),
        sequence: 0xfffffffd,
      },
    ],
  });
}
function mutateNative(method, mutate, run) {
  const original = bindings.WasmPrePeginTx.prototype[method];
  bindings.WasmPrePeginTx.prototype[method] = function (...methodArgs) {
    return mutate(original.apply(this, methodArgs));
  };
  try {
    run();
  } finally {
    bindings.WasmPrePeginTx.prototype[method] = original;
  }
}

for (const version of [1, 2, 3]) {
  test(`v${version} raw Pre-PegIn preserves exact amounts, funding and refunds`, () => {
    for (const amount of [90_000n, 2n ** 53n + 1n]) {
      const p = params(version, {
        pegInAmounts: [amount, amount + 1n],
        hashlocks: [
          hashlock,
          createHash('sha256').update(hashlock).digest('hex'),
        ],
        authAnchorHash: hashlock,
      });
      const native = new bindings.WasmPrePeginTx(...args(p, true));
      const guarded = new WasmPrePeginTx(...args(p));
      let nativeFunded, guardedFunded;
      try {
        assert.equal(guarded.toHex(), native.toHex());
        assert.equal(guarded.getTxid(), native.getTxid());
        assert.equal(
          guarded.getDepositorClaimValue(),
          native.getDepositorClaimValue(),
        );
        const funded = fundedBytes(native);
        nativeFunded = native.fromFundedTransaction(funded);
        guardedFunded = guarded.fromFundedTransaction(funded);
        assert.equal(guardedFunded.toHex(), funded);
        assert.equal(guardedFunded.getTxid(), nativeFunded.getTxid());
        for (const index of [0, 1]) {
          assert.equal(
            guardedFunded.getPeginAmountAt(index),
            p.pegInAmounts[index],
          );
          assert.equal(
            guardedFunded.getHtlcValue(index),
            native.getHtlcValue(index),
          );
          assert.equal(
            guardedFunded.getHtlcScriptPubKey(index),
            native.getHtlcScriptPubKey(index),
          );
          assert.equal(
            guardedFunded.getHtlcAddress(index),
            native.getHtlcAddress(index),
          );
          for (const fee of [0n, 1n, guardedFunded.getHtlcValue(index)]) {
            assert.equal(
              guardedFunded.buildRefundTx(fee, index),
              nativeFunded.buildRefundTx(fee, index),
            );
          }
        }
        // Mutating caller arrays cannot change the saved trusted request.
        p.pegInAmounts[0] += 5n;
        p.vaultKeeperPubkeys.reverse();
        p.hashlocks[0] = p.hashlocks[1];
        assert.equal(guarded.getPeginAmountAt(0), amount);
        assert.equal(
          guardedFunded.buildRefundTx(1n, 0),
          nativeFunded.buildRefundTx(1n, 0),
        );
        assert.throws(() => guarded.buildRefundTx(1n, 0), /must be funded/);
        for (const invalid of [-1, 0.5, 2, 256, NaN]) {
          assert.throws(() => guardedFunded.getHtlcValue(invalid), /htlcVout/);
          assert.throws(
            () => guardedFunded.buildRefundTx(1n, invalid),
            /htlcVout/,
          );
        }
      } finally {
        guardedFunded?.free();
        nativeFunded?.free();
        guarded.free();
        native.free();
      }
    }
  });

  test(`v${version} rejects funded output mutations and preserves wallet change`, () => {
    const p = params(version, { authAnchorHash: hashlock });
    const native = new bindings.WasmPrePeginTx(...args(p, true));
    const guarded = new WasmPrePeginTx(...args(p));
    try {
      const tx = RawTx.decode(Buffer.from(fundedBytes(native), 'hex'));
      for (let index = 0; index < tx.outputs.length; index += 1) {
        for (const field of ['amount', 'script']) {
          const changed = structuredClone(tx);
          if (field === 'amount') changed.outputs[index].amount += 1n;
          else
            changed.outputs[index].script[
              changed.outputs[index].script.length - 1
            ] ^= 1;
          assert.throws(
            () => guarded.fromFundedTransaction(encode(changed)),
            /original request/,
          );
        }
      }
      const changed = structuredClone(tx);
      changed.outputs.push(structuredClone(tx.outputs.at(-1)));
      const extra = guarded.fromFundedTransaction(encode(changed));
      assert.equal(extra.toHex(), encode(changed));
      extra.free();
      changed.inputs[0].finalScriptSig = Uint8Array.of(0);
      assert.throws(
        () => guarded.fromFundedTransaction(encode(changed)),
        /empty scriptSig/,
      );
      changed.inputs[0].finalScriptSig = new Uint8Array();
      changed.version = 1;
      assert.throws(
        () => guarded.fromFundedTransaction(encode(changed)),
        /version/,
      );
      assert.throws(() => guarded.fromFundedTransaction(encode(tx) + '00'));
      assert.throws(
        () => guarded.fromFundedTransaction('0x' + encode(tx)),
        /even-length hex/,
      );
    } finally {
      guarded.free();
      native.free();
    }
  });

  test(`v${version} rejects real engine field and refund mutations`, () => {
    const p = params(version);
    const native = new bindings.WasmPrePeginTx(...args(p, true));
    const guarded = new WasmPrePeginTx(...args(p));
    const funded = guarded.fromFundedTransaction(fundedBytes(native));
    try {
      const fieldMutations = {
        getDepositorClaimValue: (v) => v + 1n,
        getHtlcValue: (v) => v + 1n,
        getPeginAmountAt: (v) => v + 1n,
        getNumHtlcs: (v) => v + 1,
        getTxGraphVersion: (v) => v + 1,
        getTxid: (v) => v.slice(2) + v.slice(0, 2),
        getHtlcAddress: (v) => v + 'q',
        getHtlcScriptPubKey: (v) => v.slice(0, -2) + '00',
        toHex: (v) => v + '00',
      };
      for (const [method, mutate] of Object.entries(fieldMutations)) {
        mutateNative(method, mutate, () => {
          assert.throws(
            () => new WasmPrePeginTx(...args(p)),
            /original request/,
          );
          assert.throws(() => guarded[method](0), /original request/);
        });
      }
      const mutations = [
        (tx) => {
          tx.version += 1;
        },
        (tx) => {
          tx.lockTime += 1;
        },
        (tx) => {
          tx.inputs[0].index += 1;
        },
        (tx) => {
          tx.inputs[0].txid[0] ^= 1;
        },
        (tx) => {
          tx.inputs[0].sequence += 1;
        },
        (tx) => {
          tx.inputs[0].finalScriptSig = Uint8Array.of(0);
        },
        (tx) => {
          tx.outputs[0].amount += 1n;
        },
        (tx) => {
          tx.outputs[0].script[2] ^= 1;
        },
        (tx) => {
          tx.outputs.push(structuredClone(tx.outputs[0]));
        },
      ];
      for (const mutate of mutations) {
        mutateNative(
          'buildRefundTx',
          (value) => {
            const tx = RawTx.decode(Buffer.from(value, 'hex'));
            mutate(tx);
            return encode(tx);
          },
          () =>
            assert.throws(
              () => funded.buildRefundTx(1n, 0),
              /refund transaction/,
            ),
        );
      }
      for (const fee of [-1n, 1, 2n ** 64n, funded.getHtlcValue(0) + 1n]) {
        assert.throws(() => funded.buildRefundTx(fee, 0), /refundFee/);
      }
    } finally {
      funded.free();
      guarded.free();
      native.free();
    }
  });

  test(`v${version} randomized original requests match the native engine`, () => {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const p = params(version, {
        pegInAmounts: [BigInt(randomInt(1, 1_000_000))],
        feeRate: BigInt(randomInt(0, 50)),
        minPeginFeeRate: BigInt(randomInt(0, 50)),
        numLocalChallengers: randomInt(1, 6),
        timelockRefund: randomInt(1, 65536),
        vaultKeeperPubkeys: keys.slice(2, randomInt(3, 5)),
        universalChallengerPubkeys: keys.slice(4, randomInt(5, 7)),
      });
      const native = new bindings.WasmPrePeginTx(...args(p, true));
      const guarded = new WasmPrePeginTx(...args(p));
      try {
        assert.equal(guarded.toHex(), native.toHex());
        assert.equal(guarded.getTxid(), native.getTxid());
      } finally {
        native.free();
        guarded.free();
      }
    }
  });
}

test('raw construction rejects lossy amount inputs before typed-array conversion', async () => {
  for (const amounts of [
    new BigUint64Array([1n]),
    [2n ** 64n],
    [-1n],
    [0n],
    [1],
    [],
    new Array(1),
  ]) {
    const p = params(1, { pegInAmounts: amounts });
    assert.throws(() => new WasmPrePeginTx(...args(p)), /pegInAmounts/);
    await assert.rejects(createPrePeginTransaction(p), /pegInAmounts/);
  }
  for (const field of [
    'hashlocks',
    'vaultKeeperPubkeys',
    'universalChallengerPubkeys',
  ]) {
    const p = params(1);
    p[field] = new Set(p[field]);
    assert.throws(() => new WasmPrePeginTx(...args(p)), /must be an array/);
  }
  assert.throws(() => new WasmPrePeginTx(...args(params(4))), /Unsupported/);
  assert.throws(
    () =>
      new WasmPrePeginTx(
        ...args(params(1, { pegInAmounts: [2n ** 64n - 1n] })),
      ),
    /u64/,
  );
  const tx = new WasmPrePeginTx(...args(params(1)));
  for (const timelock of [0, -1, 1.5, 65536, NaN]) {
    assert.throws(() => tx.buildPeginTx(timelock, 0), /timelockPegin/);
  }
  tx[Symbol.dispose]();
  assert.throws(() => tx.toHex());
});
