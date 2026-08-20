/**
 * The Pre-PegIn approval ceremony for intent-based signing wallets.
 *
 * A shared helper because there are two Pre-PegIn broadcast paths — the SDK's
 * {@link PeginManager.signAndBroadcast} and the vault app's own
 * `broadcastPrePeginTransaction` (a near-duplicate). Both must run the exact
 * same derive → approve sequence immediately before `signPsbt`, or the two
 * copies drift on a signing-critical path.
 *
 * The device signs a Pre-PegIn only from `INTENT_LOADED`, and only if the
 * approved intent's `prepegin_txid` matches this tx and its fee is within the
 * approved `prepegin_max_fee`. So an approval-capable wallet must be shown the
 * terms (and derive the context root that gates the intent) before it signs.
 *
 * @module deposit-terms/prePeginApproval
 */

import { Transaction } from "bitcoinjs-lib";

import { normalizeXOnlyPubkey } from "../managers/pegin/normalizeWalletInputs";
import { hexToUint8Array } from "../primitives/utils/bitcoin";
import { deriveVaultRoot, parseFundingOutpointsFromTx } from "../vault-secrets";
import type { DepositTerms } from "./depositTerms";

/**
 * Minimal structural wallet for the Pre-PegIn ceremony. Mirrors
 * `DeriveContextHashCapableWallet` so an app-side wrapper object qualifies
 * without implementing all of `BitcoinWallet`. Both methods are optional so
 * the capability probe below can run on any wallet.
 */
export interface PrePeginApprovalWallet {
  deriveContextHash?(appName: string, context: string): Promise<string>;
  approveDepositTerms?(terms: DepositTerms): Promise<void>;
  holdsApprovedDepositTerms?(terms: DepositTerms): Promise<boolean>;
}

export interface EnsurePrePeginTermsApprovalParams {
  wallet: PrePeginApprovalWallet;
  /** The approved terms — required for approval-capable wallets, ignored (but still txid-checked) otherwise. */
  depositTerms: DepositTerms | undefined;
  /** Funded Pre-PegIn tx hex (0x optional): the funding outpoints AND the txid the terms must match. */
  fundedPrePeginTxHex: string;
  /** x-only depositor pubkey (64 hex, 0x optional) — the identity the PSBT is signed with. */
  depositorBtcPubkey: string;
}

/**
 * Run the derive → approve ceremony (or a no-op) before a Pre-PegIn signature.
 *
 * - Non-approval wallets: no-op, after asserting the terms (if any) match the tx.
 * - Approval-capable wallets: require terms, assert they match this tx's txid,
 *   derive the vault root over the tx's funding outpoints, then approve.
 *
 * Skip fast-path: when the wallet reports (via `holdsApprovedDepositTerms`, a
 * host-side mirror read) that these byte-equal terms are still approved on the
 * live connection, the ceremony is skipped entirely — the intent approved at
 * `preparePegin` survives everything the flow does in between (PoP signing is
 * state-independent and no base-app APDU touches the vault context;
 * app-babylon-vault `sign_psbt_validate.c` PoP dispatch comment @ 73a57c50).
 * A stale "true" fails closed: the device rejects the signature with a state
 * error, the provider drops its mirror, and the retry runs the full ceremony.
 *
 * Otherwise always derives first: the host cannot read device state, and the
 * one-shot Pre-PegIn cap means every retry needs the full ceremony — so this
 * path never approves-only.
 *
 * @throws If approval-capable but no terms are provided, or the provided terms
 *   are for a different transaction.
 */
export async function ensurePrePeginTermsApproval(
  params: EnsurePrePeginTermsApprovalParams,
): Promise<void> {
  const { wallet, depositTerms, fundedPrePeginTxHex, depositorBtcPubkey } =
    params;
  // Gate on typeof (the seam's supportsDepositApproval convention) so a spread
  // non-function value is treated as absent rather than reaching the approve
  // call and throwing a raw TypeError. Also narrows it to a function below.
  const approveDepositTerms =
    typeof wallet.approveDepositTerms === "function"
      ? wallet.approveDepositTerms
      : undefined;

  // Nothing to do — not an approval wallet and no terms to validate — so skip
  // parsing the tx entirely.
  if (!approveDepositTerms && !depositTerms) {
    return;
  }

  const cleanHex = fundedPrePeginTxHex.startsWith("0x")
    ? fundedPrePeginTxHex.slice(2)
    : fundedPrePeginTxHex;
  const tx = Transaction.fromHex(cleanHex);
  const txid = tx.getId();

  // Whatever the wallet, if terms were supplied they must be for THIS tx.
  // Complements runDepositorPresignFlow's assertDepositTermsMatchSigningContext,
  // which checks the graph scalars and rosters but never the txid.
  if (
    depositTerms &&
    depositTerms.prepeginTxid.replace(/^0x/, "").toLowerCase() !== txid
  ) {
    throw new Error(
      `Deposit terms do not match the transaction being broadcast: terms are for ` +
        `prepeginTxid ${depositTerms.prepeginTxid}, but this transaction is ${txid}.`,
    );
  }

  if (!approveDepositTerms) {
    return;
  }

  if (!depositTerms) {
    throw new Error(
      "This wallet requires approved deposit terms before signing the Pre-PegIn transaction, " +
        "but none were provided. Pass PreparePeginResult.depositTerms (fresh flows) or a resume rebuild.",
    );
  }

  if (typeof wallet.deriveContextHash !== "function") {
    throw new Error(
      "A deposit-approval wallet must also implement deriveContextHash, but this one does not.",
    );
  }

  // Fast path: the intent approved at preparePegin is still live on this
  // connection, so re-deriving (which would wipe it) buys nothing but a second
  // device ceremony. A stale answer fails closed at the signature (see module
  // doc), so a mirror read is sufficient here.
  if (
    typeof wallet.holdsApprovedDepositTerms === "function" &&
    (await wallet.holdsApprovedDepositTerms(depositTerms))
  ) {
    return;
  }

  // Same funding outpoints preparePegin derived over, via the shared
  // golden-tested parser (display order; also rejects an input-less tx).
  const fundingOutpoints = parseFundingOutpointsFromTx(fundedPrePeginTxHex);

  const root = await deriveVaultRoot(
    { deriveContextHash: wallet.deriveContextHash.bind(wallet) },
    {
      depositorBtcPubkey: hexToUint8Array(
        normalizeXOnlyPubkey(depositorBtcPubkey),
      ),
      fundingOutpoints,
    },
  );
  // The derive gates the intent on-device; the broadcast path needs no
  // secrets, so wipe the returned root immediately.
  root.fill(0);

  await approveDepositTerms(depositTerms);
}
