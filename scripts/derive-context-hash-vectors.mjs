import { createHmac, hkdfSync, pbkdf2Sync } from 'node:crypto';

const CURVE_ORDER = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);
const HARDENED = 0x80000000;

function hex(buffer) {
  return Buffer.from(buffer).toString('hex');
}

function u32be(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value, 0);
  return out;
}

function parse256(buffer) {
  return BigInt(`0x${hex(buffer)}`);
}

function ser256(value) {
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}

function hmacSha512(key, data) {
  return createHmac('sha512', key).update(data).digest();
}

function ckdPriv(parentKey, parentChainCode, index) {
  if ((index & HARDENED) === 0) {
    throw new Error('This script only supports hardened derivation for this vector.');
  }

  const data = Buffer.concat([Buffer.from([0]), parentKey, u32be(index)]);
  const i = hmacSha512(parentChainCode, data);
  const il = i.subarray(0, 32);
  const ir = i.subarray(32);

  const childScalar = (parse256(il) + parse256(parentKey)) % CURVE_ORDER;
  if (childScalar === 0n || parse256(il) >= CURVE_ORDER) {
    throw new Error('Invalid BIP-32 child scalar encountered.');
  }

  return {
    key: ser256(childScalar),
    chainCode: ir,
    il,
  };
}

function hkdf256(ikm, info) {
  return Buffer.from(
    hkdfSync(
      'sha256',
      ikm,
      Buffer.from('derive-context-hash-v1', 'utf8'),
      info,
      32,
    ),
  );
}

const mnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = pbkdf2Sync(
  Buffer.from(mnemonic, 'utf8'),
  Buffer.from('mnemonic', 'utf8'),
  2048,
  64,
  'sha512',
);

const master = hmacSha512(Buffer.from('Bitcoin seed', 'utf8'), seed);
let node = {
  key: master.subarray(0, 32),
  chainCode: master.subarray(32),
};

const path = [44, 0, 0, 60888];
const derivation = [];

for (const index of path) {
  node = ckdPriv(node.key, node.chainCode, index + HARDENED);
  derivation.push({
    index,
    key: hex(node.key),
    chainCode: hex(node.chainCode),
    il: hex(node.il),
  });
}

const vectors = [
  { name: 'vector1', info: Buffer.from('deadbeef', 'hex') },
  { name: 'vector2', info: Buffer.from('00', 'hex') },
  { name: 'vector3', info: Buffer.alloc(64, 0) },
];

const output = {
  mnemonic,
  seed: hex(seed),
  masterKey: hex(master.subarray(0, 32)),
  masterChainCode: hex(master.subarray(32)),
  path: "m/44'/0'/0'/60888'",
  derivation,
  finalPrivateKey: hex(node.key),
  hkdf: Object.fromEntries(
    vectors.map(({ name, info }) => [name, hex(hkdf256(node.key, info))]),
  ),
};

console.log(JSON.stringify(output, null, 2));
