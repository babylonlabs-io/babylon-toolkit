/**
 * Pending-vault outpoint claims.
 *
 * NOTE: historical filename. This module no longer implements a
 * reservation mechanism; it just answers two questions:
 *
 *   1. Given the depositor's in-flight deposits, which outpoints does
 *      each one claim? (`collectPendingVaultClaims`)
 *   2. Given a deposit's actually-selected UTXOs and the claim set,
 *      which other pending vault(s) would be invalidated?
 *      (`findImpactedVaultIds`)
 *
 * Design note: pending-vault claims are advisory inputs only — never
 * load-bearing safety. Cross-device and brief pre-registration windows
 * are not coordinated here; rare collisions are recovered via the
 * refund flow. The deposit flow runs the SDK's real coin selector
 * (`selectUtxosForPegin`) against the full wallet and just inspects
 * the result against these claims to surface a post-hoc warning.
 */
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { stripHexPrefix } from "../../primitives/utils/bitcoin";
import { ContractStatus } from "../../services/deposit/peginState";

// ============================================================================
// Types
// ============================================================================

/** A txid:vout pair uniquely identifying a UTXO (outpoint). */
export interface UtxoRef {
  txid: string;
  vout: number;
}

/** Narrow structural type for locally-known pending pegin data. */
export interface PendingPeginLike {
  /**
   * Optional vault id. When present, used to skip pending pegins that are
   * already indexed on-chain so the canonical vault copy wins over a
   * tamperable off-chain entry.
   */
  id?: string;
  unsignedTxHex?: string;
}

/** Narrow structural type for on-chain vault data. */
export interface VaultLike {
  /** Vault id (bytes32 hex). */
  id?: string;
  status: number;
  unsignedPrePeginTx: string;
}

/**
 * One pending vault and the outpoints its pre-pegin tx would spend. The
 * `vaultId` carries through to user-facing warnings so the UI can name
 * which deposit(s) would be impacted by reusing their coins.
 */
export interface PendingVaultClaim {
  vaultId: string;
  claimedOutpoints: UtxoRef[];
}

export interface CollectPendingVaultClaimsParams {
  /** On-chain vaults from the indexer. PENDING/VERIFIED ones contribute. */
  vaults?: VaultLike[];
  /**
   * Locally-known pending pegins (browser cache). Contributes only when
   * the id is not already covered by `vaults` — on-chain wins.
   */
  pendingPegins?: PendingPeginLike[];
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Parse a transaction hex and return the UTXO references of all inputs.
 * Parse failures are logged and yield no refs.
 */
function extractInputUtxoRefs(txHex: string): UtxoRef[] {
  try {
    const tx = Transaction.fromHex(stripHexPrefix(txHex));
    return tx.ins.map((input) => {
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      return { txid, vout: input.index };
    });
  } catch (error) {
    console.warn(
      "[reservation] Failed to parse transaction hex; skipping inputs",
      {
        category: "reservation",
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return [];
  }
}

function outpointKey(o: UtxoRef): string {
  return `${o.txid.toLowerCase()}:${o.vout}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Collect per-vault outpoint claims from in-flight deposits.
 *
 * On-chain vault data is canonical: any pending pegin whose `id` matches
 * an indexed vault is ignored — the on-chain `unsignedPrePeginTx` wins.
 * For pegins not yet indexed, refs come from the locally-stored
 * `unsignedTxHex` (bridges indexer lag).
 *
 * Returns one entry per source vault/pegin (NOT a flat list) so callers
 * can attribute impacted UTXOs back to a specific vault for the
 * user-facing warning.
 */
export function collectPendingVaultClaims(
  params: CollectPendingVaultClaimsParams,
): PendingVaultClaim[] {
  const { vaults = [], pendingPegins = [] } = params;
  const claims: PendingVaultClaim[] = [];

  const onChainVaultIds = new Set(
    vaults
      .map((v) => v.id?.toLowerCase())
      .filter((id): id is string => id !== undefined),
  );

  for (const vault of vaults) {
    if (
      vault.status !== ContractStatus.PENDING &&
      vault.status !== ContractStatus.VERIFIED
    ) {
      continue;
    }
    // Defensive: on-chain vaults always carry a bytes32 id; skipping a
    // malformed row here just drops it from the advisory warning set.
    if (!vault.id) continue;
    claims.push({
      vaultId: vault.id,
      claimedOutpoints: extractInputUtxoRefs(vault.unsignedPrePeginTx),
    });
  }

  for (const pending of pendingPegins) {
    if (!pending.id) continue;
    if (onChainVaultIds.has(pending.id.toLowerCase())) continue;
    if (!pending.unsignedTxHex) continue;
    claims.push({
      vaultId: pending.id,
      claimedOutpoints: extractInputUtxoRefs(pending.unsignedTxHex),
    });
  }

  return claims;
}

/**
 * Given a set of just-selected outpoints (the inputs the SDK's real
 * coin selector picked for a new deposit) and the existing pending
 * vault claims, return the set of pending vault ids that share at least
 * one outpoint with the selection.
 *
 * In a multi-vault batched deposit every sibling carries the same
 * pre-pegin tx, so reusing one shared outpoint invalidates ALL siblings;
 * every claimant of a selected outpoint is therefore reported.
 *
 * Pure function — no I/O, no SDK side effects. Intended as a post-hoc
 * advisory check: if it returns a non-empty set, the deposit can still
 * proceed, but the listed vault(s) will no longer be broadcastable and
 * the user should be told.
 */
export function findImpactedVaultIds(
  selectedOutpoints: ReadonlyArray<UtxoRef>,
  claims: ReadonlyArray<PendingVaultClaim>,
): string[] {
  if (selectedOutpoints.length === 0 || claims.length === 0) return [];

  const owners = new Map<string, string[]>();
  for (const claim of claims) {
    for (const op of claim.claimedOutpoints) {
      const key = outpointKey(op);
      const existing = owners.get(key);
      if (existing) {
        if (!existing.includes(claim.vaultId)) existing.push(claim.vaultId);
      } else {
        owners.set(key, [claim.vaultId]);
      }
    }
  }

  const impacted = new Set<string>();
  for (const op of selectedOutpoints) {
    const ids = owners.get(outpointKey(op));
    if (ids) {
      for (const id of ids) impacted.add(id);
    }
  }
  return Array.from(impacted);
}
