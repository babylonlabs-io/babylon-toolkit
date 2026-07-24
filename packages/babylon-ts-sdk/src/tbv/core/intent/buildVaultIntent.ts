import type { BuildVaultIntentInputs, VaultIntent, VaultIntentVaultGroup } from "./vaultIntent";

// SLIP-44 coin types (v22 intent tag 0x21; signet pin: 06-v22-review-findings).
const SLIP44_BITCOIN_MAINNET = 0;
const SLIP44_BITCOIN_TESTNET = 1;
const BPS_DENOMINATOR = 10_000n;
const XONLY_HEX_LENGTH = 64;
const TXID_HEX_LENGTH = 64;

function normalizeXOnly(label: string, key: string): string {
  const stripped = (key.startsWith("0x") ? key.slice(2) : key).toLowerCase();
  if (!/^[0-9a-f]+$/.test(stripped) || stripped.length !== XONLY_HEX_LENGTH) {
    throw new Error(`buildVaultIntent: ${label} is not a 32-byte x-only hex key: ${key}`);
  }
  return stripped;
}

function sortedUnique(label: string, keys: readonly string[]): string[] {
  if (keys.length === 0) throw new Error(`buildVaultIntent: ${label} list is empty`);
  const normalized = keys.map((k) => normalizeXOnly(label, k)).sort();
  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i] === normalized[i - 1]) {
      throw new Error(`buildVaultIntent: duplicate ${label} key ${normalized[i]}`);
    }
  }
  return normalized;
}

// Guards device-contract u64 fields; a fractional/negative input would
// otherwise surface as an opaque BigInt() RangeError or a silently-wrong value.
function requireNonNegative(label: string, value: bigint): void {
  if (value < 0n) throw new Error(`buildVaultIntent: ${label} must be a non-negative bigint, got ${value}`);
}

export function buildVaultIntent(inputs: BuildVaultIntentInputs): VaultIntent {
  const txid = inputs.prepeginTxid.toLowerCase();
  if (!/^[0-9a-f]+$/.test(txid) || txid.length !== TXID_HEX_LENGTH) {
    throw new Error(`buildVaultIntent: prepeginTxid must be 64 hex chars, got "${inputs.prepeginTxid}"`);
  }
  if (inputs.vaultAmounts.length === 0) {
    throw new Error("buildVaultIntent: at least one vault amount is required");
  }
  if (inputs.timelockPegin <= 0 || inputs.timelockRefund <= 0) {
    throw new Error("buildVaultIntent: timelocks must be positive");
  }
  if (!Number.isInteger(inputs.commissionBps) || inputs.commissionBps < 0) {
    throw new Error(`buildVaultIntent: commissionBps must be a non-negative integer, got ${inputs.commissionBps}`);
  }
  inputs.vaultAmounts.forEach((amount, index) => requireNonNegative(`vaultAmounts[${index}]`, amount));
  requireNonNegative("depositorClaimValue", inputs.depositorClaimValue);
  requireNonNegative("prepeginMaxFee", inputs.prepeginMaxFee);
  requireNonNegative("peginMaxFee", inputs.peginMaxFee);
  requireNonNegative("protocolFeeRate", inputs.protocolFeeRate);

  const depositorPk = normalizeXOnly("depositor", inputs.depositorPk);
  const vaultProviderPk = normalizeXOnly("vault provider", inputs.vaultProviderPk);
  const keeperPks = sortedUnique("keeper", inputs.keeperPks);
  const challengerPks = sortedUnique("challenger", inputs.challengerPks);

  // Device rejects cross-role key overlap (v22 L1362-1366).
  const keeperSet = new Set(keeperPks);
  for (const pk of challengerPks) {
    if (keeperSet.has(pk)) throw new Error(`buildVaultIntent: key ${pk} appears in both keeper and challenger lists`);
  }
  if (keeperSet.has(vaultProviderPk) || challengerPks.includes(vaultProviderPk)) {
    throw new Error("buildVaultIntent: vault provider key must not appear in keeper/challenger lists");
  }
  if (depositorPk === vaultProviderPk || keeperSet.has(depositorPk) || challengerPks.includes(depositorPk)) {
    throw new Error("buildVaultIntent: depositor key must be disjoint from all participant keys");
  }

  const commissionBps = BigInt(inputs.commissionBps);
  const vaults: VaultIntentVaultGroup[] = inputs.vaultAmounts.map((vaultAmount, index) => ({
    htlcVout: index,
    vaultProviderPk,
    vaultAmount,
    // floor(V * bps / 10_000) — matches btc-vault transactions/mod.rs commission math.
    commissionFee: (vaultAmount * commissionBps) / BPS_DENOMINATOR,
    depositorClaimValue: inputs.depositorClaimValue,
    peginMaxFee: inputs.peginMaxFee,
  }));

  return {
    version: 1,
    coinType: inputs.network === "bitcoin" ? SLIP44_BITCOIN_MAINNET : SLIP44_BITCOIN_TESTNET,
    baseFeeRate: inputs.protocolFeeRate,
    peginCsvTimelock: inputs.timelockPegin,
    payoutTimelock: inputs.timelockPegin,
    htlcRefundTimelock: inputs.timelockRefund,
    prepeginTxid: txid,
    prepeginMaxFee: inputs.prepeginMaxFee,
    keeperPks,
    challengerPks,
    vaults,
  };
}
