/**
 * TLV encoder for APPROVE_VAULT_INTENT: `TAG (2B BE) ‖ LENGTH (1B) ‖ VALUE`,
 * packed, ending exactly at Lc. Matched byte-for-byte against Ledger's own
 * reference encoder (`tests/vault_client.py`), not inferred from firmware C.
 *
 * @module ledger-vault-signer/intentTlv
 */

/** `vault_constants.h:24,30` — both pinned at 1 for the v22 protocol. */
const VAULT_STRUCTURE_TYPE = 0x01;
const VAULT_PROTOCOL_VERSION = 0x01;

/** P1=0x00 scalar tags (`vault_intent_tags.h:29-54`). All 13 are mandatory. */
const TAG_STRUCTURE_TYPE = 0x0001;
const TAG_VERSION = 0x0002;
const TAG_COIN_TYPE = 0x0021;
const TAG_BASE_FEE_RATE = 0x0100;
const TAG_PEGIN_CSV_TIMELOCK = 0x0101;
const TAG_PAYOUT_TIMELOCK = 0x0102;
const TAG_PREPEGIN_TXID = 0x0027;
const TAG_HTLC_REFUND_TIMELOCK = 0x0103;
const TAG_DEPOSITOR_DERIVATION_PATH = 0x0069;
const TAG_KEEPER_COUNT = 0x0104;
const TAG_CHALLENGER_COUNT = 0x0105;
const TAG_VAULT_COUNT = 0x0106;
const TAG_PREPEGIN_MAX_FEE = 0x010f;

/** P1=0x01 per-vault group tags. All 6 mandatory, one group per APDU. */
const TAG_GRP_HTLC_VOUT = 0x0109;
const TAG_GRP_VAULT_PROVIDER_PK = 0x010a;
const TAG_GRP_VAULT_AMOUNT = 0x010b;
const TAG_GRP_COMMISSION_FEE = 0x010c;
const TAG_GRP_DEPOSITOR_CLAIM_VALUE = 0x010d;
const TAG_GRP_PEGIN_MAX_FEE = 0x010e;

/** P1=0x02 key tags. */
const TAG_KEEPER_PK = 0x0107;
const TAG_CHALLENGER_PK = 0x0108;

const XONLY_PUBKEY_BYTES = 32;
const TXID_BYTES = 32;

/** APDU data field is `uint8_t lc`, so 255 bytes is a hard ceiling. */
export const MAX_APDU_DATA_BYTES = 255;

/** 2-byte tag + 1-byte length + 32-byte key. */
const KEY_RECORD_BYTES = 3 + XONLY_PUBKEY_BYTES;

/** Ledger's client packs 7 (245 B); the ceiling is 7 for a 255-byte field. */
export const KEYS_PER_BATCH = Math.floor(MAX_APDU_DATA_BYTES / KEY_RECORD_BYTES);

function tlv(tag: number, value: Uint8Array): Uint8Array {
  if (value.length > MAX_APDU_DATA_BYTES) {
    throw new Error(`TLV value for tag 0x${tag.toString(16)} exceeds 255 bytes`);
  }
  const out = new Uint8Array(3 + value.length);
  out[0] = (tag >> 8) & 0xff;
  out[1] = tag & 0xff;
  out[2] = value.length;
  out.set(value, 3);
  return out;
}

function uintBE(value: bigint, byteLength: number, label: string): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(8 * byteLength)) {
    throw new Error(`${label} ${value} does not fit in ${byteLength} bytes`);
  }
  const out = new Uint8Array(byteLength);
  let rest = value;
  for (let i = byteLength - 1; i >= 0; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function tlvU8(tag: number, value: number, label: string): Uint8Array {
  return tlv(tag, uintBE(BigInt(value), 1, label));
}

function tlvU32(tag: number, value: number, label: string): Uint8Array {
  return tlv(tag, uintBE(BigInt(value), 4, label));
}

function tlvU64(tag: number, value: bigint, label: string): Uint8Array {
  return tlv(tag, uintBE(value, 8, label));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function requireBytes(value: Uint8Array, length: number, label: string): Uint8Array {
  if (value.length !== length) {
    throw new Error(`${label} must be ${length} bytes, got ${value.length}`);
  }
  return value;
}

/** Scalar fields for the P1=0x00 phase. */
export interface IntentScalars {
  /** BIP-44 coin type; must match `depositorPath[1]` or the device rejects. */
  coinType: number;
  baseFeeRate: bigint;
  peginCsvTimelock: number;
  payoutTimelock: number;
  /**
   * PegIn prevout txid in INTERNAL byte order — the reverse of what an
   * explorer displays. The device compares it against the PSBT's prevout,
   * which is also internal order (`vault_script.c:711-713`, "LE as stored").
   */
  prepeginTxidInternal: Uint8Array;
  htlcRefundTimelock: number;
  /** Exactly 5 levels; the device rejects any other depth. */
  depositorPath: readonly number[];
  keeperCount: number;
  challengerCount: number;
  vaultCount: number;
  prepeginMaxFee: bigint;
}

/** One vault group for the P1=0x01 phase. */
export interface IntentVaultGroup {
  htlcVout: number;
  vaultProviderPubkey: Uint8Array;
  vaultAmount: bigint;
  commissionFee: bigint;
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
}

const DEPOSITOR_PATH_LEVELS = 5;

/**
 * Encode the 13 scalar fields. Emitted in the reference client's order —
 * the parser accepts any order, but matching it keeps a byte diff against
 * their fixtures readable.
 */
export function encodeIntentScalars(scalars: IntentScalars): Uint8Array {
  if (scalars.depositorPath.length !== DEPOSITOR_PATH_LEVELS) {
    throw new Error(
      `depositorPath must have exactly ${DEPOSITOR_PATH_LEVELS} levels, got ${scalars.depositorPath.length}`,
    );
  }
  const path = concat(scalars.depositorPath.map((level) => uintBE(BigInt(level >>> 0), 4, "path level")));

  return concat([
    tlvU8(TAG_STRUCTURE_TYPE, VAULT_STRUCTURE_TYPE, "structureType"),
    tlvU8(TAG_VERSION, VAULT_PROTOCOL_VERSION, "version"),
    tlvU32(TAG_COIN_TYPE, scalars.coinType, "coinType"),
    tlvU64(TAG_BASE_FEE_RATE, scalars.baseFeeRate, "baseFeeRate"),
    tlvU32(TAG_PEGIN_CSV_TIMELOCK, scalars.peginCsvTimelock, "peginCsvTimelock"),
    tlvU32(TAG_PAYOUT_TIMELOCK, scalars.payoutTimelock, "payoutTimelock"),
    tlv(TAG_PREPEGIN_TXID, requireBytes(scalars.prepeginTxidInternal, TXID_BYTES, "prepeginTxid")),
    tlvU32(TAG_HTLC_REFUND_TIMELOCK, scalars.htlcRefundTimelock, "htlcRefundTimelock"),
    tlv(TAG_DEPOSITOR_DERIVATION_PATH, path),
    tlvU8(TAG_KEEPER_COUNT, scalars.keeperCount, "keeperCount"),
    tlvU8(TAG_CHALLENGER_COUNT, scalars.challengerCount, "challengerCount"),
    tlvU8(TAG_VAULT_COUNT, scalars.vaultCount, "vaultCount"),
    tlvU64(TAG_PREPEGIN_MAX_FEE, scalars.prepeginMaxFee, "prepeginMaxFee"),
  ]);
}

/** Encode one vault group. The device parses exactly one group per APDU. */
export function encodeIntentGroup(group: IntentVaultGroup): Uint8Array {
  return concat([
    tlvU8(TAG_GRP_HTLC_VOUT, group.htlcVout, "htlcVout"),
    tlv(TAG_GRP_VAULT_PROVIDER_PK, requireBytes(group.vaultProviderPubkey, XONLY_PUBKEY_BYTES, "vaultProviderPubkey")),
    tlvU64(TAG_GRP_VAULT_AMOUNT, group.vaultAmount, "vaultAmount"),
    tlvU64(TAG_GRP_COMMISSION_FEE, group.commissionFee, "commissionFee"),
    tlvU64(TAG_GRP_DEPOSITOR_CLAIM_VALUE, group.depositorClaimValue, "depositorClaimValue"),
    tlvU64(TAG_GRP_PEGIN_MAX_FEE, group.peginMaxFee, "peginMaxFee"),
  ]);
}

/**
 * Encode the key phase into APDU-sized batches: every keeper, then every
 * challenger, each set in strictly ascending byte order.
 *
 * The device enforces both the role ordering and the ascending sort
 * positionally (`approve_vault_intent.c:204-215`), so we sort here rather than
 * trusting the caller — an unsorted roster is rejected mid-ceremony.
 */
export function encodeKeyBatches(
  keeperPubkeys: readonly Uint8Array[],
  challengerPubkeys: readonly Uint8Array[],
): Uint8Array[] {
  const sortAscending = (keys: readonly Uint8Array[], label: string) =>
    keys
      .map((k, i) => requireBytes(k, XONLY_PUBKEY_BYTES, `${label}[${i}]`))
      .sort((a, b) => {
        for (let i = 0; i < XONLY_PUBKEY_BYTES; i++) {
          if (a[i] !== b[i]) return a[i] - b[i];
        }
        return 0;
      });

  const records = [
    ...sortAscending(keeperPubkeys, "keeper").map((k) => tlv(TAG_KEEPER_PK, k)),
    ...sortAscending(challengerPubkeys, "challenger").map((k) => tlv(TAG_CHALLENGER_PK, k)),
  ];

  const batches: Uint8Array[] = [];
  for (let i = 0; i < records.length; i += KEYS_PER_BATCH) {
    batches.push(concat(records.slice(i, i + KEYS_PER_BATCH)));
  }
  return batches;
}
