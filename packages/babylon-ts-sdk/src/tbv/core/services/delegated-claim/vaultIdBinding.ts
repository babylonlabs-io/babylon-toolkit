/**
 * Binding between a delegated-claim graph and the vault it is claimed for.
 *
 * Neither the vault provider's graph JSON nor an artifacts file is bound to a
 * vault id by construction: the Rust side only hex-normalizes the `vault_id`
 * field it is handed, so a graph for vault B carrying `vault_id` A passes
 * every other check. The binding that does exist is on chain — the vault id
 * is `keccak256(peginTxid, depositorEthAddress)` — and the Claim transaction
 * spends that PegIn output with its first input.
 *
 * Re-deriving the id from that input is therefore the only check that ties a
 * served graph, or a file the SDK did not write, to the vault the depositor
 * means to claim.
 *
 * @module services/delegated-claim/vaultIdBinding
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { derivePeginVaultId } from "../../clients/eth/pegin-transaction";

/**
 * Input of the Claim transaction that spends the PegIn vault UTXO. Fixed by
 * the Rust graph in `btc-vault crates/vault`, not free to choose here.
 */
export const CLAIM_PEGIN_INPUT = 0;

/**
 * Thrown when a graph does not belong to the vault it is presented for.
 *
 * @experimental
 */
export class VaultIdBindingError extends Error {
  constructor(
    readonly expectedVaultId: string,
    readonly derivedVaultId: string,
    readonly peginTxid: string,
  ) {
    super(
      `Transaction graph does not belong to vault ${expectedVaultId}: its ` +
        `Claim spends PegIn ${peginTxid}, which derives vault ` +
        `${derivedVaultId}. Refusing to sign for a graph served for another ` +
        `vault.`,
    );
    this.name = "VaultIdBindingError";
  }
}

/** Display-order txid of the PegIn output the Claim PSBT spends. */
export function peginTxidFromClaimPsbt(claimPsbtBase64: string): string {
  let psbt: Psbt;
  try {
    psbt = Psbt.fromBase64(claimPsbtBase64);
  } catch (cause) {
    throw new Error("Claim PSBT cannot be parsed.", { cause });
  }
  const input = psbt.txInputs[CLAIM_PEGIN_INPUT];
  if (!input) {
    throw new Error("Claim PSBT carries no PegIn input to bind the vault to.");
  }
  return displayTxid(input.hash);
}

/**
 * Display-order txid of the PegIn output a signed Claim transaction spends.
 */
export function peginTxidFromClaimTx(claimTx: Transaction): string {
  const input = claimTx.ins[CLAIM_PEGIN_INPUT];
  if (!input) {
    throw new Error(
      "Artifacts file's claim_tx carries no PegIn input to bind the vault to.",
    );
  }
  return displayTxid(input.hash);
}

/**
 * The three values the on-chain vault id is derived from and compared with.
 *
 * @experimental
 */
export interface AssertClaimSpendsVaultParams {
  /** Display-order PegIn txid, from the Claim's first input. */
  peginTxid: string;
  /** Depositor's Ethereum address, the second half of the on-chain id. */
  depositorEthAddress: string;
  /** Vault id the graph or file claims to be for. */
  expectedVaultId: string;
}

/**
 * Throws unless the Claim's PegIn input derives the expected vault id.
 *
 * Experimental: this API can change in a minor release. Pin the SDK
 * version if you build on it.
 *
 * @throws {@link VaultIdBindingError} when the graph belongs to another vault.
 * @experimental
 */
export function assertClaimSpendsVault(
  params: AssertClaimSpendsVaultParams,
): void {
  const derived = normalizeVaultId(
    derivePeginVaultId(params.peginTxid, params.depositorEthAddress),
  );
  const expected = normalizeVaultId(params.expectedVaultId);
  if (derived !== expected) {
    throw new VaultIdBindingError(expected, derived, params.peginTxid);
  }
}

/** Lowercase, `0x`-prefixed form of a 32-byte vault id. */
export function normalizeVaultId(vaultId: string): string {
  const bare = vaultId.startsWith("0x") ? vaultId.slice(2) : vaultId;
  return `0x${bare.toLowerCase()}`;
}

// Bitcoin stores a prevout hash in internal byte order; a txid is the same
// bytes reversed. Copy before reversing — the buffer belongs to the parsed
// transaction.
function displayTxid(internalHash: Uint8Array): string {
  return Buffer.from(internalHash).reverse().toString("hex");
}
