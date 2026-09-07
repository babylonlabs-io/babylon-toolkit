/**
 * Reclaim pre-flight and post-broadcast verification.
 *
 * The browser flow can only tell us the button worked. What we actually need to know is whether the
 * transaction it produced has the right shape, because every fix in this area is invisible from the
 * UI: a sweep of the wrong vault's reserve, or a key-path witness instead of a script-path one, both
 * look identical on screen right up until the money is gone or the broadcast is rejected.
 *
 * So the checks here read the broadcast transaction back off the chain and assert against it. They
 * use the esplora REST shape (`/tx/:txid`), which returns the witness stack per input, so nothing here
 * needs bitcoinjs or the SDK — it is an independent view of what actually landed.
 *
 * Every assertion below corresponds to a specific thing that can silently go wrong:
 *   - one input, at `(peginTxid, 1)` — the sweep hit the reserve of the vault it was offered for
 *   - a 3-element witness — the script path was taken; a key-path spend against the NUMS internal key
 *     would be 1 element and would never confirm
 *   - a 34-byte `<32-byte pubkey> OP_CHECKSIG` leaf and a 33-byte control block with no merkle path —
 *     the single-leaf claim connector, not some other taptree
 *   - one output, and `in - out == fee` — nothing was skimmed
 *   - 513 weight units — the exact size model the fee is computed from
 */

/** esplora `/tx/:txid` — only the fields these checks read. */
interface EsploraTx {
  txid: string;
  version: number;
  locktime: number;
  vin: {
    txid: string;
    vout: number;
    witness?: string[];
    sequence: number;
    prevout?: { value: number; scriptpubkey: string };
  }[];
  vout: {
    value: number;
    scriptpubkey: string;
    scriptpubkey_address?: string;
  }[];
  fee: number;
  weight: number;
  status?: { confirmed: boolean; block_height?: number };
}

/** The depositor-claim reserve is always PegIn output 1 (`PEGIN_DEPOSITOR_CLAIM_VOUT`). */
const RECLAIM_INPUT_VOUT = 1;
/** BIP-340 signature, SIGHASH_DEFAULT — 64 bytes, no trailing sighash byte. */
const SCHNORR_SIG_HEX_LEN = 128;
/** `OP_PUSHBYTES_32 <32-byte x-only pubkey> OP_CHECKSIG` — 34 bytes. */
const CLAIM_LEAF_HEX_LEN = 68;
/** Leaf-version/parity byte + 32-byte internal key. No merkle path: the taptree has one leaf. */
const CONTROL_BLOCK_HEX_LEN = 66;
/** `[signature, leafScript, controlBlock]`. */
const SCRIPT_PATH_WITNESS_ITEMS = 3;
/** `reclaimVsize`: 214 WU skeleton + 299 WU for the single script-path input. */
const EXPECTED_WEIGHT_UNITS = 513;
const WEIGHT_UNITS_PER_VBYTE = 4;
/** A single-leaf claim script is `20 <32 bytes> ac`. */
const CLAIM_LEAF_RX = /^20([0-9a-f]{64})ac$/;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Spend status of one outpoint, as esplora reports it. */
export interface OutspendState {
  spent: boolean;
  confirmed: boolean;
  blockHeight?: number;
  spendingTxid?: string;
}

export async function fetchOutspend(
  mempoolApiBase: string,
  txid: string,
  vout: number,
): Promise<OutspendState> {
  const res = await getJson<{
    spent?: boolean;
    txid?: string;
    status?: { confirmed?: boolean; block_height?: number };
  }>(`${mempoolApiBase}/tx/${txid}/outspend/${vout}`);
  return {
    spent: res.spent === true,
    confirmed: res.spent === true && res.status?.confirmed === true,
    blockHeight: res.status?.block_height,
    spendingTxid: res.txid,
  };
}

/**
 * The digit check alone is not enough: a long enough run of digits passes it
 * and then parses to `Infinity` or to a finite-but-unsafe integer, either of
 * which makes the recorded confirmation depth meaningless. Same bound as the
 * SDK's `getTipHeight`, kept in step so this copy cannot drift back.
 */
export async function fetchTipHeight(mempoolApiBase: string): Promise<number> {
  const res = await fetch(`${mempoolApiBase}/blocks/tip/height`);
  const raw = (await res.text()).trim();
  const height = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error(`Unexpected tip height response: "${raw}"`);
  }
  return height;
}

/** What the gate saw at the moment the sweep was authorised. Recorded, not asserted. */
export interface ReclaimGateSnapshot {
  peginTxid: string;
  tipHeight: number;
  payoutSpend: OutspendState;
  payoutConfirmations: number | null;
  reserveSpend: OutspendState;
  reserveValueSats: number | null;
  /**
   * Why `reserveValueSats` is null, when it is. Without this the artifact cannot tell a PegIn with
   * no output at vout 1 apart from an API call that failed — very different diagnoses.
   */
  reserveValueError: string | null;
}

/**
 * Read the two outpoints the eligibility gate depends on, plus the reserve's value.
 *
 * Called before confirming so the artifact records the state the decision was made against — a run
 * that later fails is then diagnosable without re-deriving what the chain looked like at the time.
 */
export async function snapshotGate(
  mempoolApiBase: string,
  peginTxid: string,
): Promise<ReclaimGateSnapshot> {
  const [tipHeight, payoutSpend, reserveSpend] = await Promise.all([
    fetchTipHeight(mempoolApiBase),
    fetchOutspend(mempoolApiBase, peginTxid, 0),
    fetchOutspend(mempoolApiBase, peginTxid, RECLAIM_INPUT_VOUT),
  ]);

  // Best-effort: the value is also on the row and in the review screen, so a failure here must not
  // stop the run — but it is recorded rather than swallowed.
  let reserveValueSats: number | null = null;
  let reserveValueError: string | null = null;
  try {
    const peginTx = await getJson<EsploraTx>(
      `${mempoolApiBase}/tx/${peginTxid}`,
    );
    reserveValueSats = peginTx.vout[RECLAIM_INPUT_VOUT]?.value ?? null;
    if (reserveValueSats === null) {
      reserveValueError = `PegIn ${peginTxid} has no output at vout ${RECLAIM_INPUT_VOUT}`;
    }
  } catch (error) {
    reserveValueError = error instanceof Error ? error.message : String(error);
  }

  const payoutConfirmations =
    payoutSpend.blockHeight !== undefined
      ? tipHeight - payoutSpend.blockHeight + 1
      : null;

  return {
    peginTxid,
    tipHeight,
    payoutSpend,
    payoutConfirmations,
    reserveSpend,
    reserveValueSats,
    reserveValueError,
  };
}

export interface ReclaimCheck {
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
}

export interface ReclaimVerification {
  txid: string;
  spentOutpoint: string;
  witnessItemLengths: number[];
  depositorXOnlyPubkey: string | null;
  destinationAddress: string | null;
  inputValueSats: number | null;
  outputValueSats: number;
  feeSats: number;
  weightUnits: number;
  vsize: number;
  feeRateSatsVb: number | null;
  confirmed: boolean;
  blockHeight?: number;
  checks: ReclaimCheck[];
  allPassed: boolean;
}

/**
 * Read the broadcast sweep back off the chain and check its shape.
 *
 * Both expected identities are REQUIRED, and an unavailable one becomes a failed check rather than an
 * absent one. The structural checks below — witness shape, weight, value conservation — hold for any
 * reclaim of any of this depositor's vaults, so on their own they cannot show that *this* sweep took
 * *this* vault's reserve to *this* wallet. Letting either identity be skipped would let `allPassed`
 * report a verification stronger than the one actually performed.
 */
export async function verifyReclaimTx(
  mempoolApiBase: string,
  txid: string,
  expected: { peginTxid: string; depositorAddress: string },
): Promise<ReclaimVerification> {
  const tx = await getJson<EsploraTx>(`${mempoolApiBase}/tx/${txid}`);
  const checks: ReclaimCheck[] = [];
  const check = (name: string, ok: boolean, exp: string, act: string) =>
    checks.push({ name, ok, expected: exp, actual: act });

  check(
    "spends exactly one input",
    tx.vin.length === 1,
    "1",
    String(tx.vin.length),
  );

  const vin = tx.vin[0];
  const witness = vin?.witness ?? [];
  const spentOutpoint = vin ? `${vin.txid}:${vin.vout}` : "(none)";

  check(
    "spends the depositor-claim reserve at vout 1",
    vin?.vout === RECLAIM_INPUT_VOUT,
    `vout ${RECLAIM_INPUT_VOUT}`,
    `vout ${vin?.vout}`,
  );

  check(
    "spends the reserve of the expected PegIn",
    Boolean(expected.peginTxid) && vin?.txid === expected.peginTxid,
    expected.peginTxid || "(no expected PegIn supplied)",
    vin?.txid ?? "(none)",
  );

  // The one that matters most: a wallet-supplied key-path signature would finalize to a single
  // witness item against the NUMS internal key, which cannot be spent.
  check(
    "witness is a 3-item script-path stack",
    witness.length === SCRIPT_PATH_WITNESS_ITEMS,
    `${SCRIPT_PATH_WITNESS_ITEMS} items [signature, leafScript, controlBlock]`,
    `${witness.length} items`,
  );

  check(
    "witness item 0 is a 64-byte Schnorr signature",
    witness[0]?.length === SCHNORR_SIG_HEX_LEN,
    `${SCHNORR_SIG_HEX_LEN} hex chars`,
    `${witness[0]?.length ?? 0} hex chars`,
  );

  const leaf = witness[1] ?? "";
  const leafMatch = CLAIM_LEAF_RX.exec(leaf);
  check(
    "witness item 1 is the <depositor> OP_CHECKSIG claim leaf",
    leaf.length === CLAIM_LEAF_HEX_LEN && leafMatch !== null,
    "20<32-byte x-only pubkey>ac",
    leaf || "(none)",
  );

  check(
    "witness item 2 is a 33-byte control block (single leaf, no merkle path)",
    witness[2]?.length === CONTROL_BLOCK_HEX_LEN,
    `${CONTROL_BLOCK_HEX_LEN} hex chars`,
    `${witness[2]?.length ?? 0} hex chars`,
  );

  check(
    "pays exactly one output",
    tx.vout.length === 1,
    "1",
    String(tx.vout.length),
  );

  const inputValueSats = vin?.prevout?.value ?? null;
  const outputValueSats = tx.vout[0]?.value ?? 0;
  if (inputValueSats !== null) {
    check(
      "conserves value (input - fee == output)",
      inputValueSats - tx.fee === outputValueSats,
      String(inputValueSats - tx.fee),
      String(outputValueSats),
    );
  }

  // Pins the vsize model the fee is derived from: 214 WU skeleton + 299 WU per script-path input.
  check(
    "weighs the modelled 513 weight units",
    tx.weight === EXPECTED_WEIGHT_UNITS,
    `${EXPECTED_WEIGHT_UNITS} WU`,
    `${tx.weight} WU`,
  );

  // esplora omits `scriptpubkey_address` for shapes it cannot render, so an absent address is an
  // unproven destination, not a passing one.
  const destinationAddress = tx.vout[0]?.scriptpubkey_address ?? null;
  check(
    "pays the connected wallet's own address",
    Boolean(expected.depositorAddress) &&
      destinationAddress === expected.depositorAddress,
    expected.depositorAddress || "(no expected address supplied)",
    destinationAddress ?? "(address not reported by esplora)",
  );

  const vsize = Math.ceil(tx.weight / WEIGHT_UNITS_PER_VBYTE);

  return {
    txid: tx.txid,
    spentOutpoint,
    witnessItemLengths: witness.map((w) => w.length / 2),
    depositorXOnlyPubkey: leafMatch?.[1] ?? null,
    destinationAddress,
    inputValueSats,
    outputValueSats,
    feeSats: tx.fee,
    weightUnits: tx.weight,
    vsize,
    feeRateSatsVb: vsize > 0 ? Number((tx.fee / vsize).toFixed(2)) : null,
    confirmed: tx.status?.confirmed === true,
    blockHeight: tx.status?.block_height,
    checks,
    allPassed: checks.every((c) => c.ok),
  };
}
