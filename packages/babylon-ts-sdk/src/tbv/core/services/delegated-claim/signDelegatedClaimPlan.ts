/**
 * Signs a delegated-claim plan with whichever wallet path fits.
 *
 * Software wallets sign the whole plan in one `signPsbts` batch where the
 * wallet supports it; a wallet without `signPsbts` is signed one PSBT at a
 * time by the fallback (the intended behaviour for Utila). Approval-capable
 * wallets (the `DepositTermsApprover` seam) hold a device session that binds
 * some of these signatures to a loaded intent and refuses others while it is
 * loaded, so for them the plan is signed as ordered ceremonies; see
 * {@link signWithApprovalWallet}.
 *
 * @module services/delegated-claim/signDelegatedClaimPlan
 */

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import type { DepositTerms, DepositTermsApprover } from "../../deposit-terms/depositTerms";
import { supportsDepositApproval } from "../../deposit-terms/depositTerms";
import { signPsbtsWithFallback } from "../../managers/pegin/signPsbtsWithFallback";
import { createTaprootScriptPathSignOptionsForInput } from "../../utils/signing";
import type { VaultContextInput } from "../../vault-secrets";
import { deriveVaultRoot } from "../../vault-secrets";
import { extractTapScriptSig } from "../../wasm";

import type {
  DelegatedClaimSignatures,
  DelegatedClaimSigningKind,
  DelegatedClaimSigningPlan,
  DelegatedClaimSigningRequest,
} from "./types";
import { assertSignatureForRequest, psbtBase64ToHex, psbtHexToBase64 } from "./verifySignatureForRequest";
import { assertWalletMatchesDepositor, xOnlyHex } from "./walletIdentity";

/**
 * Options for {@link signDelegatedClaimPlan}.
 *
 * @experimental
 */
export interface SignDelegatedClaimPlanOptions {
  /**
   * Required for approval-capable wallets: the terms that load the vault's
   * intent on the device. Resume flows rebuild them from on-chain state.
   */
  depositTerms?: DepositTerms;
  /** Required for approval-capable wallets: the context the vault root derives from. */
  vaultContext?: VaultContextInput;
  /**
   * Signatures from an earlier, incomplete run of this same plan. Each is
   * verified against its request before it is reused; only standalone kinds
   * are reused, intent-bound ones are always re-signed. Applies to approval
   * wallets only: a software wallet signs the whole plan in one prompt, so it
   * always re-signs everything and ignores this.
   */
  resume?: DelegatedClaimSignatures;
  /** Checked before every wallet prompt; an aborted signal throws its reason. */
  signal?: AbortSignal;
}

/**
 * Thrown when an approval-wallet run stops before every request is signed.
 * Carries what was collected so a retry can pass it as `resume`. Never
 * persist these as artifacts: they are not a complete set.
 *
 * @experimental
 */
export class DelegatedClaimSigningIncompleteError extends Error {
  constructor(
    message: string,
    readonly signatures: DelegatedClaimSignatures,
    readonly failedRequestId: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DelegatedClaimSigningIncompleteError";
  }
}

/** Which device state a kind signs in: only under this vault's loaded intent, or only without one. */
type DeviceSigningState = "intentBound" | "standalone";

// Exhaustive over the kind union, so adding a kind without classifying it
// fails to compile instead of silently dropping out of the ceremony.
const KIND_DEVICE_STATE: Record<DelegatedClaimSigningKind, DeviceSigningState> = {
  assert: "intentBound",
  payoutDepositor: "intentBound",
  payoutClaimer: "standalone",
  claim: "standalone",
  wronglyChallenged: "standalone",
};
/** The order the standalone requests are signed once the intent is released. */
const STANDALONE_ORDER: readonly DelegatedClaimSigningKind[] = [
  "payoutClaimer",
  "claim",
  "wronglyChallenged",
];

/**
 * The plan must come from `planDelegatedClaimSigning`: the signer
 * signs it as given and does not rebuild it. A plan altered in between is
 * rejected at assembly by `assembleWatchtowerArtifactsFromSignatures`, which
 * rebuilds every PSBT from the graph, and a hardware wallet displays what it
 * signs.
 *
 * @returns Signatures keyed by request id, one per request in the plan.
 * @experimental
 */
export async function signDelegatedClaimPlan(
  plan: DelegatedClaimSigningPlan,
  wallet: BitcoinWallet,
  opts: SignDelegatedClaimPlanOptions = {},
): Promise<DelegatedClaimSignatures> {
  opts.signal?.throwIfAborted();

  // Pure checks first, so a missing or mismatched input fails before the
  // wallet is asked anything. Then the sign options name the signer by
  // address, so the address must be proved to be this depositor's before any
  // prompt: a wallet on the wrong account would otherwise sign the whole set
  // for the wrong account.
  assertRequestIdsUnique(plan);
  if (supportsDepositApproval(wallet)) {
    const ceremony = requireApprovalInputs(opts);
    assertTermsMatchVault(ceremony.depositTerms, plan);
    const partition = partitionByDeviceState(plan);
    const signerAddress = await assertWalletMatchesDepositor(wallet, plan.depositorPublicKey, plan.btcNetwork);
    return signWithApprovalWallet(plan, wallet, signerAddress, ceremony, partition, opts);
  }
  const signerAddress = await assertWalletMatchesDepositor(wallet, plan.depositorPublicKey, plan.btcNetwork);
  return signWithBatch(plan, wallet, signerAddress, opts.signal);
}

interface DeviceStatePartition {
  intentBound: readonly DelegatedClaimSigningRequest[];
  /** In {@link STANDALONE_ORDER}, then plan order within a kind. */
  standalone: readonly DelegatedClaimSigningRequest[];
}

// Signatures are keyed by id on both wallet paths, so a repeated id would
// silently overwrite one.
function assertRequestIdsUnique(plan: DelegatedClaimSigningPlan): void {
  const seen = new Set<string>();
  for (const request of plan.requests) {
    if (seen.has(request.id)) {
      throw new Error(
        `Delegated-claim plan lists request "${request.id}" more than once; ` +
          "its signatures could not be keyed, so nothing is signed.",
      );
    }
    seen.add(request.id);
  }
}

function partitionByDeviceState(plan: DelegatedClaimSigningPlan): DeviceStatePartition {
  const intentBound = plan.requests.filter((r) => KIND_DEVICE_STATE[r.kind] === "intentBound");
  const standalone = STANDALONE_ORDER.flatMap((kind) => plan.requests.filter((r) => r.kind === kind));
  const classified = intentBound.length + standalone.length;
  if (classified !== plan.requests.length) {
    throw new Error(
      `Delegated-claim plan has ${plan.requests.length} signing requests but only ${classified} are of a kind ` +
        "this signer can place in the device ceremony; the plan and the signer disagree on the request kinds.",
    );
  }
  return { intentBound, standalone };
}

function assertEveryRequestSigned(plan: DelegatedClaimSigningPlan, signatures: DelegatedClaimSignatures): void {
  if (signatures.size !== plan.requests.length) {
    throw new Error(
      `Delegated-claim signing ended with ${signatures.size} signatures for ${plan.requests.length} requests; ` +
        "the set is incomplete and must not be treated as signed.",
    );
  }
}

interface ApprovalCeremonyInputs {
  depositTerms: DepositTerms;
  vaultContext: VaultContextInput;
}

function requireApprovalInputs(opts: SignDelegatedClaimPlanOptions): ApprovalCeremonyInputs {
  if (opts.depositTerms === undefined) {
    throw new Error(
      "An approval wallet signs Assert and the depositor Payout only under this vault's " +
        "loaded intent; pass depositTerms (rebuilt from on-chain state) so it can be approved.",
    );
  }
  if (opts.vaultContext === undefined) {
    throw new Error(
      "An approval wallet releases a loaded intent only through the vault-root derivation; " +
        "pass vaultContext so that derivation can run before and after the intent-bound signatures.",
    );
  }
  return { depositTerms: opts.depositTerms, vaultContext: opts.vaultContext };
}

/**
 * Every field the terms and the plan's vault both carry must agree: the
 * rosters, the vault core version, and the vault provider key of each group
 * the terms describe. Otherwise the device binds the Assert to another
 * deposit's intent.
 */
function assertTermsMatchVault(terms: DepositTerms, plan: DelegatedClaimSigningPlan): void {
  const norm = (keys: readonly string[]) => keys.map((k) => xOnlyHex(k)).sort().join(",");
  if (
    norm(terms.vaultKeeperBtcPubkeys) !== norm(plan.vault.vaultKeeperBtcPubkeys) ||
    norm(terms.universalChallengerBtcPubkeys) !== norm(plan.vault.universalChallengerBtcPubkeys)
  ) {
    throw new Error(
      "Deposit terms carry different keeper or challenger rosters than the vault this plan was built for; " +
        "the device would bind the Assert to the wrong intent.",
    );
  }
  if (terms.vaultCoreVersion !== plan.vault.vaultCoreVersion) {
    throw new Error(
      `Deposit terms describe vault core version ${terms.vaultCoreVersion} but this plan's vault is ` +
        `version ${plan.vault.vaultCoreVersion}; the device would bind the Assert to the wrong intent.`,
    );
  }
  if (terms.vaults.length === 0) {
    throw new Error(
      "Deposit terms describe no vault group, so they cannot name this plan's vault provider; " +
        "the device would bind the Assert to the wrong intent.",
    );
  }
  const vaultProvider = xOnlyHex(plan.vault.vaultProviderBtcPubkey);
  for (const group of terms.vaults) {
    if (xOnlyHex(group.vaultProviderBtcPubkey) !== vaultProvider) {
      throw new Error(
        `Deposit terms group at htlcVout ${group.htlcVout} names a different vault provider than the vault ` +
          "this plan was built for; the device would bind the Assert to the wrong intent.",
      );
    }
  }
}

/**
 * The device sequence, set by two rules. Firmware: Assert signs only under
 * INTENT_LOADED, and while this vault's intent is loaded a Payout whose input
 * 0 spends its PegIn is routed to the intent-bound validator, which signs
 * the depositor's input 0 only, so the claimer's input 1 is unreachable in
 * that state; Claim and WronglyChallenged sign in any state (app-babylon-vault
 * `sign_psbt_validate.c` dispatcher and routing @ b0c0ac4d). Provider (P3):
 * `LedgerVaultProvider` refuses the claimer Payout while its mirror is
 * intent-loaded, with a typed error saying to derive first. A context
 * derivation is the only release, so the order is derive → approve →
 * intent-bound → derive → standalone. Each public wallet call takes its own
 * device lock, so they are sequenced, never nested.
 */
async function signWithApprovalWallet(
  plan: DelegatedClaimSigningPlan,
  wallet: BitcoinWallet & DepositTermsApprover,
  signerAddress: string,
  ceremony: ApprovalCeremonyInputs,
  { intentBound, standalone }: DeviceStatePartition,
  opts: SignDelegatedClaimPlanOptions,
): Promise<DelegatedClaimSignatures> {
  // Seeded with the verified resumed standalone signatures, so a stop at any
  // point hands them back along with whatever this run adds.
  const signatures = verifiedResumable(plan, opts.resume);
  // The full ceremony order; `queue[position]` is the request the ceremony is
  // at, resumed or not, which is what a stop is reported against.
  const queue = [...intentBound, ...standalone];
  let position = 0;

  const signOne = async (request: DelegatedClaimSigningRequest): Promise<void> => {
    opts.signal?.throwIfAborted();
    const signedHex = await wallet.signPsbt(
      psbtBase64ToHex(request.psbtBase64),
      createTaprootScriptPathSignOptionsForInput(plan.depositorPublicKey, request.inputIndex, signerAddress),
    );
    const signatureHex = await extractTapScriptSig(psbtHexToBase64(signedHex), request.inputIndex);
    assertSignatureForRequest(plan, request, signatureHex);
    signatures.set(request.id, signatureHex);
  };

  const releaseIntent = async (): Promise<void> => {
    opts.signal?.throwIfAborted();
    // deriveVaultRoot validates the wallet's reply; the root itself is not
    // needed here and is zeroed at once.
    const root = await deriveVaultRoot(wallet, ceremony.vaultContext);
    root.fill(0);
  };

  try {
    await releaseIntent();
    opts.signal?.throwIfAborted();
    await wallet.approveDepositTerms(ceremony.depositTerms);
    for (const request of intentBound) {
      await signOne(request);
      position++;
    }
    // Always run, even with every standalone request resumed: it is the only
    // release of the loaded intent, and it precedes the standalone phase, so
    // the first standalone request is what it unblocks.
    await releaseIntent();
    for (const request of standalone) {
      if (!signatures.has(request.id)) await signOne(request);
      position++;
    }
  } catch (cause) {
    // "Collected" means the map is non-empty, resumed entries included. An
    // abort or failure before that surfaces as is; after it, every stop is
    // reported with the map, so the caller keeps what it has. A plan with no
    // standalone phase has nothing to report a release failure against.
    const next = queue[position];
    if (signatures.size === 0 || next === undefined) throw cause;
    throw new DelegatedClaimSigningIncompleteError(
      `Delegated-claim signing stopped at "${next.id}"; ${signatures.size} of ${plan.requests.length} signatures were collected.`,
      signatures,
      next.id,
      { cause },
    );
  }
  assertEveryRequestSigned(plan, signatures);
  return signatures;
}

/**
 * Resumable signatures that verify against their request. Intent-bound kinds
 * are dropped (the device re-signs them under the fresh intent), and so is
 * any signature that fails verification: it is re-signed, not reported.
 */
function verifiedResumable(
  plan: DelegatedClaimSigningPlan,
  resume: DelegatedClaimSignatures | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!resume) return out;
  for (const request of plan.requests) {
    const signatureHex = resume.get(request.id);
    if (signatureHex === undefined || KIND_DEVICE_STATE[request.kind] === "intentBound") continue;
    try {
      assertSignatureForRequest(plan, request, signatureHex);
    } catch {
      // Swallowed on purpose: a resumed entry that does not verify is re-signed
      // rather than reported; a malformed PSBT re-raises at fresh-sign time.
      continue;
    }
    out.set(request.id, signatureHex);
  }
  return out;
}

async function signWithBatch(
  plan: DelegatedClaimSigningPlan,
  wallet: BitcoinWallet,
  signerAddress: string,
  signal: AbortSignal | undefined,
): Promise<DelegatedClaimSignatures> {
  const requests = plan.requests;
  signal?.throwIfAborted();
  const signedPsbtHexes = await signPsbtsWithFallback(
    wallet,
    requests.map((r) => psbtBase64ToHex(r.psbtBase64)),
    requests.map((r) =>
      createTaprootScriptPathSignOptionsForInput(plan.depositorPublicKey, r.inputIndex, signerAddress),
    ),
  );
  const signatures = new Map<string, string>();
  for (let i = 0; i < requests.length; i++) {
    const signatureHex = await extractTapScriptSig(psbtHexToBase64(signedPsbtHexes[i]), requests[i].inputIndex);
    assertSignatureForRequest(plan, requests[i], signatureHex);
    signatures.set(requests[i].id, signatureHex);
  }
  assertEveryRequestSigned(plan, signatures);
  return signatures;
}
