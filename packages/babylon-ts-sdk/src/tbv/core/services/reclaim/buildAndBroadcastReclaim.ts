/**
 * Reclaim orchestration — sweep the depositor-claim reserve (PegIn vout 1)
 * back to the depositor after their vault has terminally settled.
 *
 * The SDK owns the sequence: read → fee caps → PSBT build → sign → verify →
 * finalize → broadcast. Interactive transports (`signPsbt`, `broadcastTx`) and
 * the data read stay as injected callbacks, so the caller keeps its transport
 * choice and error decoding. Mirrors `services/refund/buildAndBroadcastRefund`.
 *
 * > **Eligibility is the caller's job, and it is a safety control.** The claim
 * > leaf carries no timelock, so this service will sweep a reserve whose vault
 * > is still live. Doing that permanently voids the depositor's pre-signed
 * > recourse graph: their `claim_tx` hard-codes `OutPoint(peginTxid, 1)` as its
 * > only input, and every downstream Assert / Payout / NoPayout signature
 * > commits to that tx's txid. There is no re-funding path. The caller must
 * > confirm the vault's Payout has landed — PegIn vout 0 spent and deeply
 * > confirmed — before calling this.
 *
 * @module services/reclaim
 */

import { Psbt } from "bitcoinjs-lib";
import type { Hex } from "viem";

import type { SignPsbtOptions } from "../../../../shared/wallets/interfaces/BitcoinWallet";
import { assertPsbtUnsignedTxMatches } from "../../primitives/psbt/assertPsbtUnsignedTxMatches";
import { extractPayoutSignature } from "../../primitives/psbt/payout";
import {
  buildReclaimPsbt,
  estimateReclaimFeeSats,
  type ReclaimReserve,
} from "../../primitives/psbt/reclaim";
import { assertScriptPathSchnorrSignature } from "../../primitives/psbt/verifyScriptPathSchnorrSignature";
import { processPublicKeyToXOnly } from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptions } from "../../utils/signing";
// The BTC broadcast transport types are shared with the refund service rather
// than redeclared — `services/index.ts` re-exports both modules flat, so a
// second declaration would collide on the barrel.
import type {
  BtcBroadcastResult,
  BtcBroadcaster,
} from "../refund/buildAndBroadcastRefund";

import { ReclaimUneconomicalError } from "./errors";

/**
 * Hard upper bound on the per-vbyte fee rate the SDK will sign a reclaim at.
 * Same reasoning and value as the refund's cap: a compromised mempool endpoint
 * can legally return up to 10,000 sat/vB, and 2000 leaves margin over the
 * worst historical `halfHourFee` while still blocking that by 5×.
 */
export const RECLAIM_MAX_FEE_RATE_SATS_VB = 2000;

/**
 * Hard upper bound on the absolute fee as a fraction of the **swept total**.
 *
 * > ⚠️ The basis here is deliberately different from the refund's. There the
 * > basis is `vault.amount` and the swept amount is far larger, so a 10% cap is
 * > generous. Here the basis *is* the swept amount — roughly 33k sats — and a
 * > 10% cap would block every reclaim above about 25 sat/vB. Do not "fix" this
 * > into symmetry with `REFUND_MAX_FEE_FRACTION_*`; it would silently change
 * > behaviour. The matching comment lives at the UI cap site.
 */
export const RECLAIM_MAX_FEE_FRACTION_NUMERATOR = 25n;
export const RECLAIM_MAX_FEE_FRACTION_DENOMINATOR = 100n;

/**
 * Fraction of the swept total above which the UI warns but still allows the
 * reclaim. Exported so the review screen derives its threshold from the same
 * constant the SDK enforces against, rather than restating it.
 */
export const RECLAIM_WARN_FEE_FRACTION_NUMERATOR = 10n;

export type ReclaimPsbtSigner = (
  psbtHex: string,
  opts: SignPsbtOptions,
) => Promise<string>;

/** One reserve to sweep, as the caller resolves it. */
export interface ReclaimVaultData {
  /**
   * The contract's own copy of the depositor-signed PegIn transaction
   * (`VaultProtocolInfo.depositorSignedPeginTx`). Must come from the chain —
   * never the indexer. Its `outs[1]` is one leg of the three-way bind.
   */
  depositorSignedPeginTxHex: string;
  /** Independent chain observation of `peginTxid:1`. */
  observed: { scriptPubKey: string; value: bigint };
  /** This vault's reserve value, recomputed via `computeMinClaimValue`. */
  expectedClaimValue: bigint;
}

export interface ReclaimInput<
  R extends BtcBroadcastResult = BtcBroadcastResult,
> {
  vaultIds: Hex[];
  /**
   * The **connected wallet's live** BTC pubkey — compressed sec1 or x-only.
   * Never the indexer's `depositorBtcPubkey`: re-deriving the claim script
   * from the live key is what proves the wallet about to sign is the wallet
   * that can spend.
   */
  depositorBtcPubkey: string;
  /**
   * Resolve the reserves to sweep, in the same order as `vaultIds`. The SDK
   * passes no arguments — the caller closes over whatever context it needs.
   */
  readVaults: () => Promise<ReclaimVaultData[]>;
  /** Mempool-derived sat/vB fee rate. Caller fetches it before invoking. */
  feeRate: number;
  /** BTC wallet signer; receives a PSBT hex + taproot script-path options. */
  signPsbt: ReclaimPsbtSigner;
  /** Broadcast callback — returns whatever shape the caller needs. */
  broadcastTx: BtcBroadcaster<R>;
  /** Checked at every async boundary. */
  signal?: AbortSignal;
}

function finalizeAndExtract(signedPsbtHex: string): string {
  const psbt = Psbt.fromHex(signedPsbtHex);
  try {
    psbt.finalizeAllInputs();
  } catch (e: unknown) {
    // Some wallets (e.g. Keystone) finalize during signPsbt; bitcoinjs then
    // throws "Input is already finalized". Treat that case as a no-op.
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("already finalized")) {
      throw new Error(`Failed to finalize reclaim PSBT: ${message}`);
    }
  }
  return psbt.extractTransaction().toHex();
}

/**
 * Build, sign, and broadcast a reclaim transaction sweeping one or more
 * depositor-claim reserves back to the depositor's BIP-86 address.
 *
 * @returns whatever the injected `broadcastTx` returns (generic pass-through)
 * @throws {@link ReclaimUneconomicalError} if the fee breaches either cap
 * @throws `Error` if any validation or script/value bind fails
 * @throws anything `readVaults`, `signPsbt`, or `broadcastTx` throws
 */
export async function buildAndBroadcastReclaim<
  R extends BtcBroadcastResult = BtcBroadcastResult,
>(input: ReclaimInput<R>): Promise<R> {
  const {
    vaultIds,
    depositorBtcPubkey,
    readVaults,
    feeRate,
    signPsbt,
    broadcastTx,
    signal,
  } = input;

  signal?.throwIfAborted();

  if (vaultIds.length === 0) {
    throw new Error("Reclaim requires at least one vault id; got none.");
  }
  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error(`feeRate must be a positive number, got ${feeRate}`);
  }
  // Rate cap first: fail closed before any PSBT construction or wallet prompt.
  if (feeRate > RECLAIM_MAX_FEE_RATE_SATS_VB) {
    throw new ReclaimUneconomicalError(
      `Fee rate ${feeRate} sat/vB exceeds the reclaim safety cap of ` +
        `${RECLAIM_MAX_FEE_RATE_SATS_VB} sat/vB; refusing to sign.`,
      0n,
      0n,
    );
  }

  const vaults = await readVaults();
  signal?.throwIfAborted();

  if (vaults.length !== vaultIds.length) {
    throw new Error(
      `readVaults returned ${vaults.length} reserves for ${vaultIds.length} ` +
        `vault id(s); refusing to sweep a set that does not match the request.`,
    );
  }

  // x-only for script derivation and signature verification; the raw form is
  // kept for the wallet's own sign call below.
  const xOnlyDepositorPubkey = processPublicKeyToXOnly(depositorBtcPubkey);

  const reserves: ReclaimReserve[] = vaults.map((vault) => ({
    depositorSignedPeginTxHex: vault.depositorSignedPeginTxHex,
    observed: vault.observed,
    expectedValue: vault.expectedClaimValue,
  }));

  const feeSats = estimateReclaimFeeSats(feeRate, reserves.length);

  // Fraction cap: bound the burn against the swept total. See the constant's
  // note on why this basis differs from the refund's.
  const sweptTotal = reserves.reduce((sum, r) => sum + r.expectedValue, 0n);
  const maxFeeByFraction =
    (sweptTotal * RECLAIM_MAX_FEE_FRACTION_NUMERATOR) /
    RECLAIM_MAX_FEE_FRACTION_DENOMINATOR;
  if (feeSats > maxFeeByFraction) {
    throw new ReclaimUneconomicalError(
      `Reclaim fee ${feeSats} sats exceeds ` +
        `${RECLAIM_MAX_FEE_FRACTION_NUMERATOR}/${RECLAIM_MAX_FEE_FRACTION_DENOMINATOR} ` +
        `of the swept total (${sweptTotal} sats, cap ${maxFeeByFraction} sats). ` +
        `The reserve is not at risk — it stays where it is until fee rates fall.`,
      feeSats,
      sweptTotal,
    );
  }
  signal?.throwIfAborted();

  // Builds the three-way bind: contract PegIn bytes × chain observation × JS
  // re-derivation from the live wallet key. Throws on any disagreement.
  const { psbtHex } = buildReclaimPsbt({
    depositorPubkey: xOnlyDepositorPubkey,
    inputs: reserves,
    feeSats,
  });
  signal?.throwIfAborted();

  const signOptions = createTaprootScriptPathSignOptions(
    depositorBtcPubkey,
    reserves.length,
  );
  const signedPsbtHex = await signPsbt(psbtHex, signOptions);

  assertPsbtUnsignedTxMatches({
    requestedPsbtHex: psbtHex,
    returnedPsbtHex: signedPsbtHex,
  });

  // CLAUDE.md critical path #8: `useTweakedSigner: false` / `autoFinalized:
  // false` means wallet success is not evidence of a valid signature. Verify
  // every input against a sighash recomputed from the PSBT we built, before
  // finalizing — not just input 0, or a batch could broadcast with one good
  // signature and the rest garbage.
  reserves.forEach((_reserve, inputIndex) => {
    const signature = extractPayoutSignature(
      signedPsbtHex,
      xOnlyDepositorPubkey,
      inputIndex,
    );
    assertScriptPathSchnorrSignature({
      requestedPsbtHex: psbtHex,
      signatureHex: signature,
      signerXOnlyPubkeyHex: xOnlyDepositorPubkey,
      inputIndex,
    });
  });

  const signedTxHex = finalizeAndExtract(signedPsbtHex);
  signal?.throwIfAborted();

  return broadcastTx(signedTxHex);
}
