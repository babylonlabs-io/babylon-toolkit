import type { BitcoinWallet } from "../../../shared/wallets/interfaces";
import type { Network } from "../primitives";

export interface VaultIntentVaultGroup {
  htlcVout: number; // u8; == array index (htlcVout === i invariant)
  vaultProviderPk: string; // x-only lowercase hex (64 chars)
  vaultAmount: bigint; // u64 sats (V)
  commissionFee: bigint; // u64 sats (Fc) = floor(V * bps / 10_000n) — Rust tx mod.rs:128
  depositorClaimValue: bigint; // u64 sats (Dcv) — single WASM scalar fanned out per vault
  peginMaxFee: bigint; // u64 sats = computeMinPeginFee(...) for this graph version
}

export interface VaultIntent {
  version: 1; // intent TLV tag 0x02, MUST == 0x01 (v22 L898-900)
  coinType: number; // u32 SLIP-44 (tag 0x21): "bitcoin"->0, else->1 (signet pin: 06-findings)
  baseFeeRate: bigint; // u64 sat/vB (tag 0x0100) = protocolFeeRate — the graph-build
  // rate fed to WASM (PeginManager.ts:878), NOT mempoolFeeRate
  peginCsvTimelock: number; // u32 TLV (tag 0x0101); P. Source == uint16(timelockAssert)
  payoutTimelock: number; // u32 (tag 0x0102); t2 == timelockAssert. Derived from the same
  // param as P — provably equal (protocol-params-reader.ts:104-111
  // throws >65535), builder sets both from one input
  htlcRefundTimelock: number; // u32 (tag 0x0103); T_refund, 72..4320 in v22
  prepeginTxid: string; // 64-char DISPLAY-order hex; TLV wire is little-endian u256
  // (v22 L1290) — the #2109 adapter MUST byte-reverse on encode
  prepeginMaxFee: bigint; // u64 (tag 0x010F) = funded sizing.fee (exact)
  keeperPks: string[]; // tag 0x0107; ascending byte-lex, builder-sorted + asserted
  challengerPks: string[]; // tag 0x0108; ascending byte-lex, sorted independently
  vaults: VaultIntentVaultGroup[]; // tags 0x0109-0x010E; ascending htlcVout
  // structure_type (0x01): ABSENT — constant unassigned in v22 (TYPE_???). Add when pinned.
  // depositor_derivation_path (0x69): ABSENT — provider-injected at TLV-encode time from its
  //   own account state (encoding contract still an open Ledger pin). [R: field deleted]
  // council fields: NOT included — no assigned tags exist; the Assert:0 fee fix is
  //   Ledger-side and any v23 tags are speculative. Re-add = two-line change when a real
  //   v23 draft assigns them. [R: dropped, reverses rev-1 Option A]
}

/**
 * Implemented only by intent-based signers (Ledger vault app provider, #2109).
 * Contract (provider obligations):
 * - MUST retain the intent for the connection lifetime; MUST autonomously silent
 *   re-derive (P2=0x01) + re-approve after any nullification (disconnect, signing
 *   error, cap breach) — including before the Pre-PegIn signPsbt that happens AFTER
 *   ETH registration (same-device app switch wipes the session, v22 L2311-2313).
 * - MUST be idempotent for a byte-equal intent on a live session (no device
 *   round-trip if already loaded) — the per-vault payout loop re-calls it. [R]
 * - A second call with a DIFFERENT intent replaces the loaded one (spec-normal).
 * - MUST reject (throw) on user refusal — dApp treats as cancel, like signPsbt.
 * - MUST be defined as a class FIELD, not prototype method — deposit-flow wallet
 *   wrappers spread the object ({...wallet}) and would strip prototype methods. [R]
 * - Mid-batch re-approval has no UI event channel yet — #2110 scope, named gap.
 */
export interface VaultIntentSigner {
  approveVaultIntent(intent: VaultIntent): Promise<void>;
}

/**
 * Seam invariant [R]: no `deriveContextHash` call between an `approveVaultIntent`
 * and the last intent-bound signature of that connection (DERIVE-while-loaded
 * nullifies, v22 L2150-2151). Current flow satisfies it; the sites that would
 * violate it if reordered: VP auth (ensureAuthenticatedVpClient.ts:81),
 * WOTS/activation re-derives (useDepositFlow.ts:862, :984 — both after all
 * intent-bound signing today).
 */
export function supportsVaultIntent(
  wallet: BitcoinWallet,
): wallet is BitcoinWallet & VaultIntentSigner {
  return typeof (wallet as Partial<VaultIntentSigner>).approveVaultIntent === "function";
}

export interface BuildVaultIntentInputs {
  network: Network;
  protocolFeeRate: bigint;
  timelockPegin: number;
  timelockRefund: number;
  prepeginTxid: string;
  prepeginMaxFee: bigint;
  depositorPk: string;
  vaultProviderPk: string;
  keeperPks: readonly string[];
  challengerPks: readonly string[];
  commissionBps: number;
  vaultAmounts: readonly bigint[];
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
}
