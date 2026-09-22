/**
 * Signs a delegated-claim plan with whichever wallet path fits.
 *
 * Software wallets sign the whole plan in one `signPsbts` batch where the
 * wallet supports it; a wallet without `signPsbts` is signed one PSBT at a
 * time by the fallback (the intended behaviour for Utila). Approval-capable
 * wallets (the `DepositTermsApprover` seam) hold a device session that binds
 * some of these signatures to a loaded intent and refuses others while it is
 * loaded, so for them the plan is signed as ordered ceremonies through the
 * {@link DelegatedClaimPsbtSigner} capability, which lets the provider put
 * its own derivation fields on each PSBT; see {@link signWithApprovalWallet}.
 *
 * @module services/delegated-claim/signDelegatedClaimPlan
 */

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../../../../shared/wallets/interfaces";
import type {
  DepositTerms,
  DepositTermsApprover,
} from "../../deposit-terms/depositTerms";
import { supportsDepositApproval } from "../../deposit-terms/depositTerms";
import { signPsbtsWithFallback } from "../../managers/pegin/signPsbtsWithFallback";
import { uint8ArrayToHex } from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptionsForInput } from "../../utils/signing";
import type { VaultContextInput } from "../../vault-secrets";
import { deriveVaultRoot } from "../../vault-secrets";
import { extractTapScriptSig } from "../../wasm";

import type {
  DelegatedClaimSignatures,
  DelegatedClaimSigningKind,
  DelegatedClaimSigningPlan,
  DelegatedClaimSigningRequest,
  DelegatedClaimVaultContext,
} from "./types";
import {
  assertSignatureForRequest,
  psbtBase64ToHex,
  psbtHexToBase64,
} from "./verifySignatureForRequest";
import { assertWalletMatchesDepositor, xOnlyHex } from "./walletIdentity";

/**
 * The claim-ceremony signing capability an approval wallet must add: its
 * device signs some claim PSBTs with no loaded intent and needs its own
 * derivation fields on them, which only the provider can write. Implementers
 * MUST classify each PSBT themselves from the single requested input and
 * refuse anything that is not one of the claim ceremony's shapes — this is
 * not a second `signPsbt`. The SDK cannot enforce that and does not rely on
 * it: the wallet is proved to be the depositor's before any prompt, and every
 * returned signature is verified against the PSBT that requested it. The SDK
 * probes for the method before it prompts.
 *
 * @experimental
 */
export interface DelegatedClaimPsbtSigner {
  signDelegatedClaimPsbt(
    psbtHex: string,
    options?: SignPsbtOptions,
  ): Promise<string>;
}

/** Probes {@link DelegatedClaimPsbtSigner.signDelegatedClaimPsbt}. */
function supportsDelegatedClaimSigning(
  wallet: BitcoinWallet,
): wallet is BitcoinWallet & DelegatedClaimPsbtSigner {
  return (
    typeof (wallet as Partial<DelegatedClaimPsbtSigner>)
      .signDelegatedClaimPsbt === "function"
  );
}

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
  /**
   * Required for approval-capable wallets: the context the vault root derives
   * from; its depositor key must be the vault's registered key, checked before
   * any device I/O.
   */
  vaultContext?: VaultContextInput;
  /**
   * Signatures from an earlier, incomplete run of this same plan. Each is
   * verified against its request before it is reused; only standalone kinds
   * are reused, intent-bound ones are always re-signed. Applies to approval
   * wallets only: a software wallet always re-signs everything and ignores
   * this — one prompt for a wallet with native `signPsbts`, one prompt per
   * PSBT otherwise (the sequential fallback), and a cancel restarts the set.
   */
  resume?: DelegatedClaimSignatures;
  /**
   * Checked before every wallet prompt. The check before either path throws
   * the aborted signal's reason. Inside the approval ceremony, once the map
   * holds a signature — a verified resumed standalone entry counts — a stop is
   * reported as {@link DelegatedClaimSigningIncompleteError} with the reason as
   * `cause`, so the collected signatures survive for `resume`; while the map is
   * still empty the reason is thrown as is.
   */
  signal?: AbortSignal;
}

/**
 * Thrown when an approval-wallet run stops before it reaches the end.
 *
 * Carries what was collected so a retry can pass it as `resume`. A retry
 * drops the intent-bound signatures and re-signs only those, so a stop in the
 * final intent release after every standalone request was resumed re-runs
 * only the intent-bound part of the ceremony — even though the map it carries
 * is complete by then. Never persist the map as artifacts: only the assembler
 * verifies it as a set.
 *
 * @experimental
 */
export class DelegatedClaimSigningIncompleteError extends Error {
  constructor(
    message: string,
    readonly signatures: DelegatedClaimSignatures,
    /**
     * The request the ceremony is to resume from — not necessarily the one
     * that failed: a stop in the intent release or approval is reported
     * against the request it was about to reach. The message says which.
     */
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
const KIND_DEVICE_STATE: Record<DelegatedClaimSigningKind, DeviceSigningState> =
  {
    assert: "intentBound",
    payoutDepositor: "intentBound",
    payoutClaimer: "standalone",
    claim: "standalone",
    wronglyChallenged: "standalone",
  };
/** Which device step a stop happened in, as the incomplete-run message names it. */
type CeremonyPhase =
  | "checking the deposit terms against the wallet's envelope"
  | "clearing any loaded intent"
  | "releasing the loaded intent"
  | "approving the deposit terms"
  | "signing";

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
  // The planner enforces this, but the plan reaching here is a plain object.
  if (xOnlyHex(plan.depositorPublicKey) !== plan.vault.depositorBtcPubkey) {
    throw new Error(
      `Plan depositor key ${xOnlyHex(plan.depositorPublicKey)} is not the vault's registered depositor key ` +
        `${plan.vault.depositorBtcPubkey}; the plan was not built for this vault.`,
    );
  }
  if (supportsDepositApproval(wallet)) {
    if (!supportsDelegatedClaimSigning(wallet)) {
      throw new Error(
        "Approval wallet does not implement signDelegatedClaimPsbt; the claim ceremony needs it because the " +
          "device signs some claim PSBTs with no loaded intent and needs its own derivation fields on them.",
      );
    }
    const ceremony = requireApprovalInputs(opts, plan);
    assertTermsMatchVault(ceremony.depositTerms, plan.vault);
    const partition = partitionByDeviceState(plan);
    const signerAddress = await assertWalletMatchesDepositor(
      wallet,
      plan.depositorPublicKey,
      plan.btcNetwork,
    );
    return signWithApprovalWallet(
      plan,
      wallet,
      signerAddress,
      ceremony,
      partition,
      opts,
    );
  }
  const signerAddress = await assertWalletMatchesDepositor(
    wallet,
    plan.depositorPublicKey,
    plan.btcNetwork,
  );
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

function partitionByDeviceState(
  plan: DelegatedClaimSigningPlan,
): DeviceStatePartition {
  const intentBound = plan.requests.filter(
    (r) => KIND_DEVICE_STATE[r.kind] === "intentBound",
  );
  const standalone = STANDALONE_ORDER.flatMap((kind) =>
    plan.requests.filter((r) => r.kind === kind),
  );
  const classified = intentBound.length + standalone.length;
  if (classified !== plan.requests.length) {
    throw new Error(
      `Delegated-claim plan has ${plan.requests.length} signing requests but only ${classified} are of a kind ` +
        "this signer can place in the device ceremony; the plan and the signer disagree on the request kinds.",
    );
  }
  return { intentBound, standalone };
}

function assertEveryRequestSigned(
  plan: DelegatedClaimSigningPlan,
  signatures: DelegatedClaimSignatures,
): void {
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

function requireApprovalInputs(
  opts: SignDelegatedClaimPlanOptions,
  plan: DelegatedClaimSigningPlan,
): ApprovalCeremonyInputs {
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
  // Both derivation screens would otherwise run for a context built for
  // another depositor than the one this vault is registered to.
  const contextKey = uint8ArrayToHex(opts.vaultContext.depositorBtcPubkey);
  if (contextKey !== plan.vault.depositorBtcPubkey) {
    throw new Error(
      `vaultContext derives from depositor key ${contextKey} but this plan's vault is registered to ` +
        `${plan.vault.depositorBtcPubkey}; the device would derive for another depositor.`,
    );
  }
  return { depositTerms: opts.depositTerms, vaultContext: opts.vaultContext };
}

/**
 * Every field the terms and the vault context both carry must agree: the
 * rosters, the vault core version, the two CSV timelocks, the protocol fee
 * rate, and the vault provider key of each group the terms describe.
 * Otherwise the device binds the Assert to another deposit's intent.
 *
 * Exported so a claim-time terms builder can be checked against the context
 * it will be signed with, before any device session.
 *
 * @experimental
 */
export function assertTermsMatchVault(
  terms: DepositTerms,
  vault: DelegatedClaimVaultContext,
): void {
  const norm = (keys: readonly string[]) =>
    keys
      .map((k) => xOnlyHex(k))
      .sort()
      .join(",");
  if (
    norm(terms.vaultKeeperBtcPubkeys) !== norm(vault.vaultKeeperBtcPubkeys) ||
    norm(terms.universalChallengerBtcPubkeys) !==
      norm(vault.universalChallengerBtcPubkeys)
  ) {
    throw new Error(
      "Deposit terms carry different keeper or challenger rosters than the vault context this claim signs for; " +
        "the device would bind the Assert to the wrong intent.",
    );
  }
  if (terms.vaultCoreVersion !== vault.vaultCoreVersion) {
    throw new Error(
      `Deposit terms describe vault core version ${terms.vaultCoreVersion} but the vault context has ` +
        `version ${vault.vaultCoreVersion}; the device would bind the Assert to the wrong intent.`,
    );
  }
  if (terms.timelockPegin !== vault.timelockPegin) {
    throw new Error(
      `Deposit terms describe timelockPegin ${terms.timelockPegin} but the vault context has ` +
        `${vault.timelockPegin}; the device would bind the Assert to the wrong intent.`,
    );
  }
  if (terms.timelockAssert !== vault.timelockAssert) {
    throw new Error(
      `Deposit terms describe timelockAssert ${terms.timelockAssert} but the vault context has ` +
        `${vault.timelockAssert}; the device would bind the Assert to the wrong intent.`,
    );
  }
  if (terms.protocolFeeRate !== vault.protocolFeeRate) {
    throw new Error(
      `Deposit terms describe protocolFeeRate ${terms.protocolFeeRate} but the vault context has ` +
        `${vault.protocolFeeRate}; the device would bind the Assert to the wrong intent.`,
    );
  }
  if (terms.vaults.length === 0) {
    throw new Error(
      "Deposit terms describe no vault group, so they cannot name the vault context's vault provider; " +
        "the device would bind the Assert to the wrong intent.",
    );
  }
  const vaultProvider = xOnlyHex(vault.vaultProviderBtcPubkey);
  for (const group of terms.vaults) {
    if (xOnlyHex(group.vaultProviderBtcPubkey) !== vaultProvider) {
      throw new Error(
        `Deposit terms group at htlcVout ${group.htlcVout} names a different vault provider than the vault ` +
          "context this claim signs for; the device would bind the Assert to the wrong intent.",
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
 * device lock, so they are sequenced, never nested. The optional
 * `validateDepositTerms` probe runs before all of it, host-side, so terms the
 * device envelope refuses fail before the first derive screen.
 */
async function signWithApprovalWallet(
  plan: DelegatedClaimSigningPlan,
  wallet: BitcoinWallet & DepositTermsApprover & DelegatedClaimPsbtSigner,
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
  // On a resume the map is pre-populated, so the position alone cannot say
  // whether a stop happened in a wallet prompt or in the release/approval
  // around it; this names which. Held in an object so the compiler keeps the
  // value `signOne` writes from its own scope.
  const stop: { phase: CeremonyPhase } = {
    phase: "clearing any loaded intent",
  };

  const signOne = async (
    request: DelegatedClaimSigningRequest,
  ): Promise<void> => {
    stop.phase = "signing";
    opts.signal?.throwIfAborted();
    const signedHex = await wallet.signDelegatedClaimPsbt(
      psbtBase64ToHex(request.psbtBase64),
      createTaprootScriptPathSignOptionsForInput(
        plan.depositorPublicKey,
        request.inputIndex,
        signerAddress,
      ),
    );
    const signatureHex = await extractTapScriptSig(
      psbtHexToBase64(signedHex),
      request.inputIndex,
    );
    assertSignatureForRequest(plan, request, signatureHex);
    signatures.set(request.id, signatureHex);
  };

  // The phase is a parameter because the opening derive runs on a device that
  // may hold no intent at all, which the second one never does.
  const releaseIntent = async (phase: CeremonyPhase): Promise<void> => {
    stop.phase = phase;
    opts.signal?.throwIfAborted();
    // deriveVaultRoot validates the wallet's reply; the root itself is not
    // needed here and is zeroed at once.
    const root = await deriveVaultRoot(wallet, ceremony.vaultContext);
    root.fill(0);
  };

  try {
    // Envelope violations fail here, before the derive costs a physical
    // approval. Validate-only per DepositTermsApprover — no device I/O.
    if (typeof wallet.validateDepositTerms === "function") {
      // Its own phase: on a resume the map is already non-empty, so a refusal
      // here would otherwise be reported as a device step that never ran.
      stop.phase = "checking the deposit terms against the wallet's envelope";
      await wallet.validateDepositTerms(ceremony.depositTerms);
    }
    await releaseIntent("clearing any loaded intent");
    stop.phase = "approving the deposit terms";
    opts.signal?.throwIfAborted();
    await wallet.approveDepositTerms(ceremony.depositTerms);
    for (const request of intentBound) {
      await signOne(request);
      position++;
    }
    // Always run, even with every standalone request resumed: it is the only
    // release of the loaded intent, and it precedes the standalone phase, so
    // the first standalone request is what it unblocks.
    await releaseIntent("releasing the loaded intent");
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
    const where =
      stop.phase === "signing"
        ? `stopped at "${next.id}"`
        : `stopped before "${next.id}" while ${stop.phase}`;
    throw new DelegatedClaimSigningIncompleteError(
      `Delegated-claim signing ${where}; ${signatures.size} of ${plan.requests.length} signatures were collected.`,
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
    if (
      signatureHex === undefined ||
      KIND_DEVICE_STATE[request.kind] === "intentBound"
    )
      continue;
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
  const signedPsbtHexes = await signPsbtsWithFallback(
    wallet,
    requests.map((r) => psbtBase64ToHex(r.psbtBase64)),
    requests.map((r) =>
      createTaprootScriptPathSignOptionsForInput(
        plan.depositorPublicKey,
        r.inputIndex,
        signerAddress,
      ),
    ),
    signal,
  );
  const signatures = new Map<string, string>();
  for (let i = 0; i < requests.length; i++) {
    const signatureHex = await extractTapScriptSig(
      psbtHexToBase64(signedPsbtHexes[i]),
      requests[i].inputIndex,
    );
    assertSignatureForRequest(plan, requests[i], signatureHex);
    signatures.set(requests[i].id, signatureHex);
  }
  assertEveryRequestSigned(plan, signatures);
  return signatures;
}
