const U64_MAX = (1n << 64n) - 1n;

// btc-vault crates/vault/src/lib.rs at 2c1177ec, 27c0062b and e1e50f66:
// DUST_AMOUNT = 546 and P2TR_DUST_THRESHOLD = 330. The estimators below
// reproduce the pinned tx_graph/config.rs arithmetic, so these two have to
// hold the same values it uses.
export const DUST_AMOUNT = 546n;
export const P2TR_DUST_THRESHOLD = 330n;

// Transaction sizing terms, in bytes.
// An outpoint (36) plus its sequence (4).
const OUTPOINT_AND_SEQUENCE_BYTES = 40n;
// A P2TR output: value (8), script length (1) and the 34-byte scriptPubKey.
const P2TR_OUTPUT_BYTES = 43n;
// One 32-byte x-only key push plus its length byte, per signer.
const PER_KEY_PUSH_BYTES = 34n;
// The two WOTS blocks contribute 11,414 bytes; prefix, depth and suffix add 42.
const WOTS_SCRIPT_BYTES = 11456n;
// The P2A anchor output value for tx-graph v2 and v3.
export const P2A_ANCHOR_VALUE = 240n;

function u64(value: bigint, label: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) {
    throw new Error(`${label} must be a bigint in the u64 range.`);
  }
  return value;
}

function count(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('Participant counts must be integers in the u32 range.');
  }
  return BigInt(value);
}

function hasAnchor(version: number): boolean {
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error(`Unsupported transaction graph version: ${version}.`);
  }
  return version !== 1;
}

function compactSize(value: bigint): bigint {
  return value < 253n
    ? 1n
    : value <= 0xffffn
      ? 3n
      : value <= 0xffff_ffffn
        ? 5n
        : 9n;
}

function integerPushSize(value: bigint): bigint {
  if (value <= 16n) return 1n;
  let bytes = 1n;
  while (value > 127n) {
    bytes++;
    value >>= 8n;
  }
  return bytes + 1n;
}

function ceilDiv4(value: bigint): bigint {
  return (value + 3n) / 4n;
}

// One input with a witness. Include CompactSize lengths and the marker/flag.
function vsize(
  inputScript: bigint,
  witnessCount: bigint,
  witnessBytes: bigint,
  p2trOutputs: bigint,
  extraOutputBytes = 0n,
): bigint {
  const outputCount = p2trOutputs + (extraOutputBytes === 0n ? 0n : 1n);
  const base =
    8n +
    1n +
    compactSize(outputCount) +
    OUTPOINT_AND_SEQUENCE_BYTES +
    compactSize(inputScript) +
    inputScript +
    P2TR_OUTPUT_BYTES * p2trOutputs +
    extraOutputBytes;
  return ceilDiv4(4n * base + 2n + compactSize(witnessCount) + witnessBytes);
}

/** Match btc-vault 2c1177ec / 27c0062b / e1e50f66 without calling WASM. */
export function computeMinClaimValue(
  version: number,
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): bigint {
  const marker = hasAnchor(version);
  const local = count(numLocalChallengers);
  const universal = count(numUniversalChallengers);
  const quorum = count(councilQuorum);
  const council = count(councilSize);
  const rate = u64(feeRate, 'feeRate');
  const challengers = local + universal;
  // The pinned Assert estimator promotes each empty signer group to one.
  const assertLocal = local || 1n;
  const assertUniversal = universal || 1n;
  const signatures = 1n + assertLocal + assertUniversal;
  // Each block has 64 message digits, two checksum digits and two padding checks.
  const script =
    WOTS_SCRIPT_BYTES +
    PER_KEY_PUSH_BYTES * (assertLocal + assertUniversal) +
    integerPushSize(assertLocal) +
    integerPushSize(assertUniversal);
  const assertVsize = vsize(
    0n,
    signatures + 264n + 2n,
    signatures * 65n +
      132n * (21n + 2n) +
      compactSize(script) +
      script +
      PER_KEY_PUSH_BYTES,
    2n + 2n * challengers,
    marker ? 56n : 0n,
  );
  let depth = 0n;
  for (let leaves = challengers + 1n; leaves > 0n; leaves >>= 1n) depth++;
  // Preserve the pinned council estimate, including its omitted witness prefixes.
  const councilVsize = ceilDiv4(
    94n * 4n +
      quorum * 64n +
      council * PER_KEY_PUSH_BYTES +
      2n +
      33n +
      32n * depth,
  );
  const wronglyVsize = vsize(0n, 4n, 65n + 33n + 74n + 162n, 1n);
  // The pinned Claim estimator counts script + control block as scriptSig bytes.
  const claimVsize = vsize(67n, 1n, 65n, 2n);
  const challengerOutput = u64(
    wronglyVsize * rate + P2TR_DUST_THRESHOLD + DUST_AMOUNT,
    'challenger output',
  );
  return u64(
    DUST_AMOUNT +
      councilVsize * rate +
      2n * challengers * challengerOutput +
      DUST_AMOUNT +
      assertVsize * rate +
      DUST_AMOUNT +
      claimVsize * rate,
    'minimum claim value',
  );
}

/** Match the raw constructor's reserve, without the public fee RPC's 99-signer cap. */
export function computeMinPeginFee(
  version: number,
  numVaultKeepers: number,
  numUniversalChallengers: number,
  minPeginFeeRate: bigint,
): bigint {
  const anchor = hasAnchor(version);
  const keepers = count(numVaultKeepers);
  if (keepers === 0n) throw new Error('Vault keepers must not be empty.');
  const universal = count(numUniversalChallengers);
  const rate = u64(minPeginFeeRate, 'minPeginFeeRate');
  const signatures = 2n + keepers + universal;
  const script =
    107n +
    PER_KEY_PUSH_BYTES * (keepers + universal) +
    integerPushSize(keepers) +
    1n +
    (universal === 0n ? 0n : integerPushSize(universal) + 1n);
  return u64(
    vsize(
      0n,
      signatures + 3n,
      33n + signatures * 65n + compactSize(script) + script + 66n,
      2n,
      anchor ? 13n : 0n,
    ) * rate,
    'minimum PegIn fee',
  );
}

/** Fund every PegIn output and its fee without wrapping a u64 amount. */
export function computeMinHtlcValue(
  version: number,
  amount: bigint,
  claimValue: bigint,
  numVaultKeepers: number,
  numUniversalChallengers: number,
  minPeginFeeRate: bigint,
): bigint {
  const anchor = hasAnchor(version) ? P2A_ANCHOR_VALUE : 0n;
  const fee = computeMinPeginFee(
    version,
    numVaultKeepers,
    numUniversalChallengers,
    minPeginFeeRate,
  );
  return u64(
    u64(amount, 'amount') + u64(claimValue, 'claimValue') + anchor + fee,
    'minimum HTLC value',
  );
}
