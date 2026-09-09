import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { test } from 'node:test';
import { secp256k1 } from '@noble/curves/secp256k1.js';

import {
  computeMinClaimValue,
  computeMinHtlcValue,
  computeMinPeginFee,
} from '../dist/peginFees.js';
import { getWasmBindings } from '../dist/wasm-loader-node.js';

const wasm = await getWasmBindings();
const U64_MAX = (1n << 64n) - 1n;
// Use the scalar-key pattern and request values from prepegin-transactions.test.mjs.
const keys = Array.from({ length: 514 }, (_, index) =>
  Buffer.from(
    secp256k1.getPublicKey(BigInt(index + 1), true).subarray(1),
  ).toString('hex'),
);
const hashlock = createHash('sha256')
  .update(Buffer.from(keys[0], 'hex'))
  .digest('hex');

for (const version of [1, 2, 3]) {
  test(`v${version} matches the existing deposit golden values`, () => {
    // SDK rebuildDepositTermsCore.test.ts: two keepers, one UC, council 2-of-3.
    const claim = computeMinClaimValue(version, 2, 1, 2, 3, 3n);
    const fee = computeMinPeginFee(version, 2, 1, 7n);
    assert.equal(claim, version === 1 ? 23694n : 23862n);
    assert.equal(fee, version === 1 ? 2086n : 2177n);
    assert.equal(claim, wasm.computeMinClaimValue(version, 2, 1, 2, 3, 3n));
    assert.equal(fee, wasm.computeMinPeginFee(version, 2, 1, 7n));
  });

  test(`v${version} matches real WASM at script and CompactSize boundaries`, () => {
    for (const [local, universal] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 2],
      [2, 3], // HTLC witness script crosses 252 bytes.
      [16, 1],
      [17, 1],
      [1, 16],
      [1, 17], // OP_16 becomes a byte push.
      [62, 63],
      [63, 63],
      [63, 64], // Assert output count crosses 252.
      [99, 99],
      [100, 1],
      [1, 100], // Public PegIn estimator limit.
      [127, 1],
      [128, 1],
      [1, 127],
      [1, 128], // ScriptNum sign byte.
    ]) {
      for (const rate of [0n, 3n, 7n]) {
        assert.equal(
          computeMinClaimValue(version, local, universal, 2, 3, rate),
          wasm.computeMinClaimValue(version, local, universal, 2, 3, rate),
          `claim: ${local}/${universal}, rate ${rate}`,
        );
        if (local === 0) {
          assert.throws(() =>
            computeMinPeginFee(version, local, universal, rate),
          );
        }
        if (local === 0 || local > 99 || universal > 99) {
          assert.throws(() =>
            wasm.computeMinPeginFee(version, local, universal, rate),
          );
        } else {
          assert.equal(
            computeMinPeginFee(version, local, universal, rate),
            wasm.computeMinPeginFee(version, local, universal, rate),
            `PegIn: ${local}/${universal}, rate ${rate}`,
          );
        }
      }
    }
  });

  test(`v${version} matches raw constructor rosters beyond the public fee RPC cap`, () => {
    for (const [keepers, universal] of [
      [100, 1],
      [1, 100],
      [100, 100],
      [127, 1],
      [128, 1],
      [1, 127],
      [1, 128], // ScriptNum sign byte.
      [124, 123],
      [124, 124], // PegIn witness count crosses 252.
      [256, 1],
      [1, 256],
      [256, 256], // Full unique dummy-seed range.
    ]) {
      for (const minRate of [0n, 7n]) {
        const tx = new wasm.WasmPrePeginTx(
          version,
          keys[0],
          keys[1],
          keys.slice(2, 2 + keepers),
          keys.slice(2 + keepers, 2 + keepers + universal),
          [hashlock],
          new BigUint64Array([90_000n]),
          50,
          3n,
          minRate,
          2,
          2,
          3,
          'signet',
        );
        try {
          const claim = computeMinClaimValue(version, 2, universal, 2, 3, 3n);
          const anchor = version === 1 ? 0n : 240n;
          assert.equal(claim, tx.getDepositorClaimValue());
          assert.equal(
            computeMinHtlcValue(
              version,
              90_000n,
              claim,
              keepers,
              universal,
              minRate,
            ),
            tx.getHtlcValue(0),
          );
          assert.equal(
            computeMinPeginFee(version, keepers, universal, minRate),
            tx.getHtlcValue(0) - 90_000n - claim - anchor,
          );
        } finally {
          tx.free();
        }
      }
    }
  });

  test(`v${version} matches real WASM for random valid graph parameters`, () => {
    for (let run = 0; run < 100; run++) {
      const local = randomInt(1, 100);
      const universal = randomInt(1, 100);
      const council = randomInt(1, 33);
      const quorum = randomInt(1, council + 1);
      const rate = BigInt(randomInt(1, 100001));
      const minRate = BigInt(randomInt(1, 100001));
      const context = `${version}/${local}/${universal}/${quorum}/${council}/${rate}/${minRate}`;
      assert.equal(
        computeMinClaimValue(version, local, universal, quorum, council, rate),
        wasm.computeMinClaimValue(
          version,
          local,
          universal,
          quorum,
          council,
          rate,
        ),
        context,
      );
      assert.equal(
        computeMinPeginFee(version, local, universal, minRate),
        wasm.computeMinPeginFee(version, local, universal, minRate),
        context,
      );
    }
  });

  test(`v${version} checks the exact u64 fee and claim overflow boundary`, () => {
    const vbytes = computeMinPeginFee(version, 2, 1, 1n);
    const lastFeeRate = U64_MAX / vbytes;
    assert(lastFeeRate > BigInt(Number.MAX_SAFE_INTEGER));
    assert.equal(
      computeMinPeginFee(version, 2, 1, lastFeeRate),
      wasm.computeMinPeginFee(version, 2, 1, lastFeeRate),
    );
    for (const calculate of [computeMinPeginFee, wasm.computeMinPeginFee]) {
      assert.throws(() => calculate(version, 2, 1, lastFeeRate + 1n));
    }
    const dust = computeMinClaimValue(version, 2, 1, 2, 3, 0n);
    const slope = computeMinClaimValue(version, 2, 1, 2, 3, 1n) - dust;
    const lastClaimRate = (U64_MAX - dust) / slope;
    assert.equal(
      computeMinClaimValue(version, 2, 1, 2, 3, lastClaimRate),
      wasm.computeMinClaimValue(version, 2, 1, 2, 3, lastClaimRate),
    );
    for (const calculate of [computeMinClaimValue, wasm.computeMinClaimValue]) {
      assert.throws(() => calculate(version, 2, 1, 2, 3, lastClaimRate + 1n));
    }
  });

  test(`v${version} funds the canonical anchor and checks the HTLC sum`, () => {
    const anchor = version === 1 ? 0n : 240n;
    const claim = wasm.computeMinClaimValue(version, 2, 1, 2, 3, 3n);
    const fee = wasm.computeMinPeginFee(version, 2, 1, 7n);
    const amount = U64_MAX - claim - fee - anchor;
    assert.equal(
      computeMinHtlcValue(version, amount, claim, 2, 1, 7n),
      U64_MAX,
    );
    assert.throws(
      () => computeMinHtlcValue(version, amount + 1n, claim, 2, 1, 7n),
      /u64/,
    );
    assert.equal(computeMinHtlcValue(version, 0n, 0n, 2, 1, 0n), anchor);
  });
}

test('rejects original values before u64 conversion', () => {
  for (const value of [-1n, U64_MAX + 1n, 3, '3', NaN, undefined]) {
    assert.throws(() => computeMinClaimValue(1, 2, 1, 2, 3, value), /u64/);
    assert.throws(() => computeMinPeginFee(1, 2, 1, value), /u64/);
    assert.throws(() => computeMinHtlcValue(1, value, 0n, 2, 1, 0n), /u64/);
    assert.throws(() => computeMinHtlcValue(1, 0n, value, 2, 1, 0n), /u64/);
  }
});

test('rejects original counts before u32 conversion', () => {
  for (const value of [-1, 0.5, NaN, Infinity, 2 ** 32, 1n, '1', undefined]) {
    for (const index of [1, 2, 3, 4]) {
      const args = [1, 2, 1, 2, 3, 3n];
      args[index] = value;
      assert.throws(() => computeMinClaimValue(...args), /u32/);
    }
    assert.throws(() => computeMinPeginFee(1, value, 1, 7n), /u32/);
    assert.throws(() => computeMinPeginFee(1, 2, value, 7n), /u32/);
  }
  // Do not allocate a roster to calculate a valid u32 count.
  assert(
    computeMinClaimValue(
      3,
      0xffff_ffff,
      0xffff_ffff,
      0xffff_ffff,
      0xffff_ffff,
      1n,
    ) > 0n,
  );
  assert(computeMinPeginFee(3, 0xffff_ffff, 0xffff_ffff, 1n) > 0n);
});

test('rejects unknown or coerced graph versions', () => {
  for (const version of [0, 4, -1, 1.5, '1', 1n, NaN]) {
    assert.throws(
      () => computeMinClaimValue(version, 2, 1, 2, 3, 3n),
      /version/,
    );
    assert.throws(() => computeMinPeginFee(version, 2, 1, 7n), /version/);
    assert.throws(
      () => computeMinHtlcValue(version, 0n, 0n, 2, 1, 0n),
      /version/,
    );
  }
});
