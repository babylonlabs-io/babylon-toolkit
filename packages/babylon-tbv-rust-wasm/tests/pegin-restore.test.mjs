import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schnorr } from '@noble/curves/secp256k1.js';
import { Transaction } from '@scure/btc-signer';
import { RawOldTx } from '@scure/btc-signer/script';
import { crypto } from 'bitcoinjs-lib';
import { parse, parseNumberAndBigInt, stringify } from 'lossless-json';
import { getWasmBindings } from '../dist/wasm-loader-node.js';
import { GuardedPeginTx } from '../dist/rawPeginTx.js';
import { deriveExpectedPrePeginHtlc } from '../dist/prePeginHtlc.js';

const wasm = await getWasmBindings();
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const read = (json) => parse(json, undefined, parseNumberAndBigInt);
// Use the existing SDK PSBT test keys (private scalars 1 through 6).
const secrets = [1, 2, 3, 4, 5, 6].map((n) =>
  Buffer.from(n.toString(16).padStart(64, '0'), 'hex'),
);
const keys = secrets.map((key) => hex(schnorr.getPublicKey(key)));
const preimage = secrets[0];

function fixture(version, overrides = {}) {
  const params = {
    txGraphVersion: version,
    depositorPubkey: keys[0],
    vaultProviderPubkey: keys[1],
    vaultKeeperPubkeys: keys.slice(2, 4).sort(),
    universalChallengerPubkeys: keys.slice(4).sort(),
    hashlocks: [hex(crypto.sha256(preimage))],
    pegInAmounts: [90000n],
    timelockRefund: 50,
    feeRate: 3n,
    minPeginFeeRate: 7n,
    numLocalChallengers: 2,
    councilQuorum: 2,
    councilSize: 3,
    network: 'signet',
    ...overrides,
  };
  const raw = new wasm.WasmPrePeginTx(
    version,
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    params.hashlocks,
    new BigUint64Array(params.pegInAmounts),
    params.timelockRefund,
    params.feeRate,
    params.minPeginFeeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
  );
  try {
    const encoded = Buffer.from(raw.toHex(), 'hex');
    const template = RawOldTx.decode(
      Buffer.concat([encoded.subarray(0, 4), encoded.subarray(6)]),
    );
    template.inputs = [
      {
        txid: crypto.sha256(preimage),
        index: 0,
        sequence: 0xfffffffe,
        finalScriptSig: new Uint8Array(),
      },
    ];
    const fundedPrePeginTxHex = hex(RawOldTx.encode(template));
    const funded = raw.fromFundedTransaction(fundedPrePeginTxHex);
    try {
      const pegin = funded.buildPeginTx(100, 0);
      try {
        return {
          json: pegin.toJson(),
          txHex: pegin.toHex(),
          trusted: {
            prePeginParams: params,
            fundedPrePeginTxHex,
            htlcVout: 0,
            timelockPegin: 100,
          },
        };
      } finally {
        pegin.free();
      }
    } finally {
      funded.free();
    }
  } finally {
    raw.free();
  }
}

function restore(version, json, trusted) {
  return GuardedPeginTx.fromJson(version, json, trusted);
}

function sign(version, source, mode = 'final') {
  const data = read(source.json);
  const params = source.trusted.prePeginParams;
  const htlc = deriveExpectedPrePeginHtlc(params, params.hashlocks[0]);
  const tx = Transaction.fromRaw(Buffer.from(source.txHex, 'hex'), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
  });
  const spender = data.pegin_input_spender;
  let count = 0;
  function signature(pubkey) {
    const hashType = count++ % 2;
    const digest = tx.preimageWitnessV1(
      0,
      [htlc.scriptPubKey],
      hashType,
      [data.prepegin_htlc_prevout.value],
      undefined,
      htlc.hashlockScript,
    );
    const signature = hex(
      schnorr.sign(digest, secrets[keys.indexOf(pubkey)], preimage),
    );
    return {
      signature,
      sighash_type: hashType ? 'SIGHASH_ALL' : 'SIGHASH_DEFAULT',
    };
  }
  spender.depositor_sig = signature(params.depositorPubkey);
  spender.vault_provider_sig = signature(params.vaultProviderPubkey);
  spender.vault_keeper_sigs = Object.fromEntries(
    params.vaultKeeperPubkeys.map((key) => [key, signature(key)]),
  );
  spender.universal_challenger_sigs = Object.fromEntries(
    params.universalChallengerPubkeys.map((key) => [key, signature(key)]),
  );
  const encode = (sig) =>
    sig.signature + (sig.sighash_type === 'SIGHASH_ALL' ? '01' : '');
  const signatures =
    mode === 'partial'
      ? [spender.depositor_sig]
      : [
          ...params.universalChallengerPubkeys
            .slice()
            .sort()
            .reverse()
            .map((key) => spender.universal_challenger_sigs[key]),
          ...params.vaultKeeperPubkeys
            .slice()
            .sort()
            .reverse()
            .map((key) => spender.vault_keeper_sigs[key]),
          spender.vault_provider_sig,
          spender.depositor_sig,
        ];
  data.tx.input[0].witness =
    mode === 'stored'
      ? []
      : [
          ...signatures.map(encode),
          ...(mode === 'final' ? [hex(preimage)] : []),
          hex(htlc.hashlockScript),
          hex(htlc.hashlockControlBlock),
        ];
  return data;
}

for (const version of [1, 2, 3]) {
  test(`v${version} restores real WASM bytes and exact amounts above Number.MAX_SAFE_INTEGER`, () => {
    for (const amount of [90000n, BigInt(Number.MAX_SAFE_INTEGER) + 2n]) {
      const source = fixture(version, { pegInAmounts: [amount] });
      const saved = restore(version, source.json, source.trusted);
      try {
        assert.equal(saved.toHex(), source.txHex);
        assert.equal(saved.getVaultValue(), amount);
        assert.equal(saved.getTxGraphVersion(), version);
        source.trusted.prePeginParams.pegInAmounts[0] = 1n;
        source.trusted.prePeginParams.vaultKeeperPubkeys.reverse();
        assert.equal(saved.getVaultValue(), amount);
        assert.equal(saved.toJson(), source.json);
      } finally {
        saved.free();
      }
    }
  });

  test(`v${version} verifies stored, depositor-only, and final signatures`, () => {
    for (const overrides of [
      {},
      {
        vaultProviderPubkey: keys[0],
        vaultKeeperPubkeys: [keys[0]],
        universalChallengerPubkeys: [keys[0]],
      },
    ]) {
      const source = fixture(version, overrides);
      for (const mode of ['stored', 'partial', 'final']) {
        const json = stringify(sign(version, source, mode));
        const saved = restore(version, json, source.trusted);
        try {
          assert.deepEqual(read(saved.toJson()), read(json));
        } finally {
          saved.free();
        }
      }
    }
  });

  test(`v${version} rejects changed fields that raw JSON deserialization accepts`, () => {
    const source = fixture(version);
    const changes = [
      (d) => {
        d.tx.lock_time = 1n;
      },
      (d) => {
        d.tx.input[0].sequence = 1n;
      },
      (d) => {
        d.tx.input[0].previous_output = `${keys[0]}:0`;
      },
      (d) => {
        d.tx.input[0].script_sig = '51';
      },
      (d) => {
        d.tx.output[0].value += 1n;
      },
      (d) => {
        d.tx.output[1].value += 1n;
      },
      (d) => {
        d.tx.output[0].script_pubkey = d.tx.output[1].script_pubkey;
      },
      (d) => {
        d.pegin_payout_connector.timelock_pegin += 1n;
      },
      (d) => {
        d.depositor_claim_connector.pubkey = keys[1];
      },
      (d) => {
        d.pegin_input_spender.htlc_connector.timelock_refund += 1n;
      },
      (d) => {
        d.pegin_input_spender.htlc_connector.hashlock = keys[0];
      },
      (d) => {
        d.prepegin_htlc_prevout.value += 1n;
      },
      (d) => {
        d.prepegin_htlc_prevout.script_pubkey = d.tx.output[0].script_pubkey;
      },
    ];
    for (const change of changes) {
      const data = read(source.json);
      change(data);
      const json = stringify(data);
      wasm.WasmPeginTx.fromJson(version, json).free();
      assert.throws(() => restore(version, json, source.trusted));
    }
    assert.throws(() => restore(version, source.json));
    assert.throws(() =>
      restore(version === 1 ? 2 : 1, source.json, source.trusted),
    );
    assert.throws(() =>
      restore(version, source.json, { ...source.trusted, htlcVout: 256 }),
    );
    const wrongShape = read(source.json);
    wrongShape.tx.output.push(wrongShape.tx.output[0]);
    assert.throws(() =>
      restore(version, stringify(wrongShape), source.trusted),
    );
  });

  test(`v${version} rejects changed signature and witness data`, () => {
    const source = fixture(version);
    const changes = [
      (d) => {
        d.pegin_input_spender.depositor_sig.signature = '00'.repeat(64);
      },
      (d) => {
        d.pegin_input_spender.depositor_sig.sighash_type = 'SIGHASH_NONE';
      },
      (d) => {
        d.pegin_input_spender.vault_keeper_sigs[keys[0]] =
          d.pegin_input_spender.depositor_sig;
      },
      (d) => {
        d.tx.input[0].witness[0] = '00'.repeat(64);
      },
      (d) => {
        d.tx.input[0].witness[d.tx.input[0].witness.length - 3] = keys[0];
      },
      (d) => {
        d.tx.input[0].witness[d.tx.input[0].witness.length - 2] += '51';
      },
      (d) => {
        d.tx.input[0].witness[d.tx.input[0].witness.length - 1] = '00'.repeat(
          65,
        );
      },
      (d) => {
        d.tx.input[0].witness.push('50');
      },
      (d) => {
        d.pegin_payout_connector.extra = true;
      },
    ];
    for (const change of changes) {
      const data = sign(version, source);
      change(data);
      assert.throws(() => restore(version, stringify(data), source.trusted));
    }
  });

  test(`v${version} preserves older omitted or null prevout metadata`, () => {
    const source = fixture(version);
    for (const absent of [false, true]) {
      const data = read(source.json);
      if (absent) delete data.prepegin_htlc_prevout;
      else data.prepegin_htlc_prevout = null;
      const saved = restore(version, stringify(data), source.trusted);
      try {
        assert.equal(saved.toHex(), source.txHex);
      } finally {
        saved.free();
      }
    }
  });
}
