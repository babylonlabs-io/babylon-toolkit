/**
 * Delegated-claim harness entry (dev server only; see vite.config.ts).
 *
 * One vault id in; every other fact from chain, the VP or the wallet. Each
 * button runs one step, records the outcome in the step state, and prints
 * errors verbatim. Signatures, keypairs and artifacts live in `session`
 * for the life of the tab and nowhere else.
 */

// Must come first — env validation initializes the network config runtime
// (`@/config/network`) at module load, exactly as src/main.tsx does.
import "@/config/env";

import type {
  DelegatedClaimSignatures,
  DelegatedClaimSigningPlan,
  DepositTerms,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { supportsDepositApproval } from "@babylonlabs-io/ts-sdk/tbv/core";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import type { Hex } from "viem";

import { openArtifactSaveTarget } from "@/services/artifacts";

import {
  downloadClaimerArtifacts,
  saveTextFile,
  type ClaimerSource,
} from "./artifacts";
import {
  assertWalletIsDepositor,
  readClaimChainContext,
  readClaimDepositTerms,
  type ClaimChainContext,
} from "./chainReads";
import {
  assemble,
  attachAssert,
  broadcast,
  buildPayout,
  buildPlan,
  buildWronglyChallenged,
  claimTxHexOf,
  deriveWots,
  pinProof,
  signPlan,
  verifyArtifacts,
} from "./claimSteps";
import { appendLog, byId, errorText, renderStep } from "./dom";
import {
  canRun,
  clearSessionFrom,
  HARNESS_STEPS,
  initialHarnessState,
  reduceHarness,
  type HarnessAction,
  type HarnessState,
  type HarnessStep,
} from "./harnessState";
import {
  connectHarnessWallet,
  type ConnectedWallet,
  type HarnessWalletKind,
} from "./wallets";

initEccLib(ecc);

const WOTS_KEYPAIR_FILENAME = "wots_keypair.json";
const ARTIFACTS_FILENAME = "artifacts.json";
const PINNED_ARTIFACTS_FILENAME = "artifacts.pinned.json";
const ASSERTED_ARTIFACTS_FILENAME = "artifacts.asserted.json";
const VAULT_ID_HEX_LENGTH = 66;
const MEGABYTE = 1_000_000;

/** Everything the flow accumulates; in memory only. */
interface HarnessSession {
  wallet?: ConnectedWallet;
  chain?: ClaimChainContext;
  source?: ClaimerSource;
  wotsKeypairJson?: string;
  plan?: DelegatedClaimSigningPlan;
  depositTerms?: DepositTerms;
  partialSignatures?: DelegatedClaimSignatures;
  signatures?: DelegatedClaimSignatures;
  artifactsJson?: string;
  claimTxHex?: string;
  pinnedArtifactsJson?: string;
  assertedArtifactsJson?: string;
  assertTxHex?: string;
  /** Set by a successful save of the asserted file; the Assert broadcast is gated on it. */
  assertedArtifactsSaved?: true;
  payoutTxHex?: string;
  wronglyChallengedTxHex?: string;
}

const session: HarnessSession = {};
let state: HarnessState = initialHarnessState();

function dispatch(action: HarnessAction): void {
  state = reduceHarness(state, action);
  for (const step of HARNESS_STEPS) renderStep(step, state[step]);
  syncButtons();
}

/**
 * A step re-ran: drop its and every later step's session values, then reset
 * their step states. Handlers compute, call this, then store — so a wallet or
 * vault change leaves nothing from before it saveable or broadcastable.
 */
function invalidateFrom(step: HarnessStep): void {
  clearSessionFrom(session, step);
  dispatch({ type: "invalidateAfter", step });
}

const STEP_BUTTONS: Record<HarnessStep, string[]> = {
  connect: ["connect-unisat", "connect-ledger"],
  context: ["read-context"],
  artifacts: ["download-artifacts"],
  wots: ["derive-wots"],
  plan: ["build-plan"],
  sign: ["sign-plan"],
  assemble: ["assemble"],
  claim: ["verify-artifacts"],
  proof: ["pin-proof"],
  assert: ["attach-assert"],
  payout: ["finalize-payout"],
};

function syncButtons(): void {
  for (const step of HARNESS_STEPS) {
    const enabled = canRun(state, step) && state[step].status !== "running";
    for (const id of STEP_BUTTONS[step])
      byId<HTMLButtonElement>(id).disabled = !enabled;
  }
  // Aux buttons need the producing step done AND its value present, so a
  // re-run upstream (wallet, vault) disables them even before it completes.
  const done = (step: HarnessStep) => state[step].status === "done";
  byId<HTMLButtonElement>("save-wots").disabled = !(
    done("wots") && session.wotsKeypairJson !== undefined
  );
  byId<HTMLButtonElement>("resume-sign").disabled =
    session.partialSignatures === undefined || state.sign.status === "running";
  byId<HTMLButtonElement>("save-artifacts").disabled = !(
    done("assemble") && session.artifactsJson !== undefined
  );
  byId<HTMLButtonElement>("broadcast-claim").disabled = !(
    done("claim") && session.claimTxHex !== undefined
  );
  byId<HTMLButtonElement>("save-pinned").disabled = !(
    done("proof") && session.pinnedArtifactsJson !== undefined
  );
  byId<HTMLButtonElement>("save-asserted").disabled = !(
    done("assert") && session.assertedArtifactsJson !== undefined
  );
  // One-time WOTS (SDK delegated-claim index.ts:129-131; btc-vault delegated_claim.rs
  // pin contract): the Assert goes out only after the asserted file is on disk.
  byId<HTMLButtonElement>("broadcast-assert").disabled = !(
    done("assert") &&
    session.assertTxHex !== undefined &&
    session.assertedArtifactsSaved === true
  );
  byId<HTMLButtonElement>("finalize-wc").disabled = !(
    done("assert") && session.assertedArtifactsJson !== undefined
  );
  byId<HTMLButtonElement>("broadcast-payout").disabled = !(
    done("payout") && session.payoutTxHex !== undefined
  );
  byId<HTMLButtonElement>("broadcast-wc").disabled =
    session.wronglyChallengedTxHex === undefined;
}

/** Runs one step: marks it running, records done/error, logs the error verbatim. */
async function runStep(
  step: HarnessStep,
  work: () => Promise<string>,
): Promise<void> {
  dispatch({ type: "start", step });
  try {
    dispatch({ type: "done", step, detail: await work() });
  } catch (error) {
    const text = errorText(error);
    appendLog(`${step}: ${text}`, "err");
    dispatch({ type: "fail", step, detail: text });
  }
}

function requireSession<K extends keyof HarnessSession>(
  key: K,
): NonNullable<HarnessSession[K]> {
  const value = session[key];
  if (value === undefined)
    throw new Error(`Step out of order: "${key}" is not available yet.`);
  return value;
}

function connect(kind: HarnessWalletKind): void {
  void runStep("connect", async () => {
    const wallet = await connectHarnessWallet(kind);
    invalidateFrom("connect");
    session.wallet = wallet;
    appendLog(`${kind} connected: ${wallet.address}`, "ok");
    return `${kind}: ${wallet.address}`;
  });
}

byId<HTMLButtonElement>("connect-unisat").onclick = () => connect("unisat");
byId<HTMLButtonElement>("connect-ledger").onclick = () => connect("ledger");

byId<HTMLButtonElement>("read-context").onclick = () => {
  void runStep("context", async () => {
    const vaultId = byId<HTMLInputElement>("vault-id").value.trim();
    if (vaultId.length !== VAULT_ID_HEX_LENGTH || !vaultId.startsWith("0x")) {
      throw new Error("Vault id must be 0x followed by 64 hex characters.");
    }
    const chain = await readClaimChainContext(vaultId as Hex);
    // Before any VP auth or device prompt: the wallet must be this vault's depositor.
    assertWalletIsDepositor(chain, requireSession("wallet").publicKeyHex);
    invalidateFrom("context");
    session.chain = chain;
    appendLog(
      `vault provider ${chain.providerAddress}, pegin ${chain.peginTxid}`,
      "ok",
    );
    return [
      `depositor ETH ${chain.vault.depositorEthAddress}`,
      `depositor BTC pk ${chain.depositorBtcPubkey}`,
      `pre-pegin ${chain.prePeginTxHash} htlcVout ${chain.htlcVout}`,
      `keepers ${chain.vault.vaultKeeperBtcPubkeys.length}, universal ${chain.vault.universalChallengerBtcPubkeys.length}`,
      `claimable block ${chain.vault.claimableEventBlockNumber}, core v${chain.vault.vaultCoreVersion}, circuit v${chain.vault.proverCircuitVersion}`,
    ].join("\n");
  });
};

byId<HTMLButtonElement>("download-artifacts").onclick = () => {
  const chain = requireSession("chain");
  // Opened before any await: the save dialog needs the click's activation.
  const targetPromise = openArtifactSaveTarget(chain.peginTxid);
  void runStep("artifacts", async () => {
    const target = await targetPromise;
    const wallet = requireSession("wallet").wallet;
    const status = byId<HTMLDivElement>("status-artifacts");
    const { outcome, source } = await downloadClaimerArtifacts({
      wallet,
      chain,
      target,
      onProgress: (received, total) => {
        status.textContent = `${(received / MEGABYTE).toFixed(0)} / ~${(total / MEGABYTE).toFixed(0)} MB`;
      },
    });
    invalidateFrom("artifacts");
    session.source = source;
    return `${outcome.filename}: ${outcome.byteLength} bytes, sha256 ${outcome.sha256}\ngraph ${source.txGraphJson.length} chars, vk ${source.verifyingKeyHex.length} chars`;
  });
};

byId<HTMLButtonElement>("derive-wots").onclick = () => {
  void runStep("wots", async () => {
    const keypair = await deriveWots(
      requireSession("wallet").wallet,
      requireSession("chain"),
      requireSession("source"),
    );
    invalidateFrom("wots");
    session.wotsKeypairJson = keypair.wotsKeypairJson;
    return `pkHash ${keypair.pkHash} matches chain; save the keypair before signing`;
  });
};

byId<HTMLButtonElement>("build-plan").onclick = () => {
  void runStep("plan", async () => {
    const plan = await buildPlan(
      requireSession("chain"),
      requireSession("source"),
    );
    invalidateFrom("plan");
    session.plan = plan;
    const kinds = plan.requests.map((r) => r.kind);
    return `${plan.requests.length} requests: ${kinds.join(", ")}`;
  });
};

async function sign(
  resume: DelegatedClaimSignatures | undefined,
): Promise<string> {
  const connected = requireSession("wallet");
  const { wallet } = connected;
  const plan = requireSession("plan");
  const chain = requireSession("chain");
  // Re-signing supersedes any earlier full set; a resume keeps its partial map (plan bucket).
  invalidateFrom("sign");
  if (supportsDepositApproval(wallet)) {
    // Ledger: the intent-bound signatures need this vault's terms loaded on
    // the device. Rebuilt once per vault and wallet (cleared with the
    // context); the SDK checks rosters and version.
    session.depositTerms ??= await readClaimDepositTerms(
      chain,
      connected.publicKeyHex,
    );
    appendLog(
      "Ledger: derive → approve → Assert → depositor Payout → derive → claimer Payout → Claim → WronglyChallenged…",
    );
  }
  const outcome = await signPlan(plan, wallet, {
    depositTerms: session.depositTerms,
    vaultContext: chain.vaultContextInput,
    resume,
  });
  if (!outcome.ok) {
    session.partialSignatures = outcome.partial;
    throw new Error(
      `${outcome.partial.size} of ${plan.requests.length} collected; stopped at "${outcome.failedRequestId}". Fix the cause and press Resume.\n${errorText(outcome.error)}`,
    );
  }
  session.signatures = outcome.signatures;
  session.partialSignatures = undefined;
  return `${outcome.signatures.size} signatures verified against the plan`;
}

byId<HTMLButtonElement>("sign-plan").onclick = () => {
  void runStep("sign", () => sign(undefined));
};
byId<HTMLButtonElement>("resume-sign").onclick = () => {
  void runStep("sign", () => sign(requireSession("partialSignatures")));
};

byId<HTMLButtonElement>("assemble").onclick = () => {
  void runStep("assemble", async () => {
    const artifactsJson = await assemble(
      requireSession("plan"),
      requireSession("signatures"),
    );
    invalidateFrom("assemble");
    session.artifactsJson = artifactsJson;
    return `${artifactsJson.length} chars (placeholder babe_sessions — join the real ones with the Node script before any CLI use)`;
  });
};

byId<HTMLButtonElement>("verify-artifacts").onclick = () => {
  void runStep("claim", async () => {
    const artifactsJson = requireSession("artifactsJson");
    const summary = await verifyArtifacts(
      artifactsJson,
      requireSession("chain"),
    );
    invalidateFrom("claim");
    session.claimTxHex = claimTxHexOf(artifactsJson);
    return `verified: claim txid ${summary.claimTxid}, pegin ${summary.peginTxid}, block ${summary.claimableEventBlockNumber}`;
  });
};

/** A save button: user activation is consumed by the picker, so no awaits before it. */
function saveButton(
  id: string,
  filename: string,
  key: keyof HarnessSession,
  onSaved?: () => void,
): void {
  byId<HTMLButtonElement>(id).onclick = () => {
    const value = session[key];
    if (typeof value !== "string")
      throw new Error(`Nothing to save for "${String(key)}" yet.`);
    // saveTextFile resolves only after the stream committed; a cancelled or failed save never reaches onSaved.
    void saveTextFile(filename, value).then(
      (name) => {
        appendLog(`saved ${name}`, "ok");
        onSaved?.();
      },
      (error: unknown) => appendLog(`save: ${errorText(error)}`, "err"),
    );
  };
}

/** A broadcast button: the mempool reply, success or error text, verbatim. */
function broadcastButton(
  id: string,
  label: string,
  key: keyof HarnessSession,
): void {
  byId<HTMLButtonElement>(id).onclick = () => {
    const hex = session[key];
    if (typeof hex !== "string")
      throw new Error(`No ${label} transaction to broadcast yet.`);
    void broadcast(hex).then(
      (txid) => appendLog(`${label} broadcast: ${txid}`, "ok"),
      (error: unknown) =>
        appendLog(`${label} broadcast: ${errorText(error)}`, "err"),
    );
  };
}

saveButton("save-wots", WOTS_KEYPAIR_FILENAME, "wotsKeypairJson");
saveButton("save-artifacts", ARTIFACTS_FILENAME, "artifactsJson");
broadcastButton("broadcast-claim", "Claim", "claimTxHex");

byId<HTMLButtonElement>("pin-proof").onclick = () => {
  void runStep("proof", async () => {
    const proofHex = byId<HTMLInputElement>("proof-hex").value;
    if (proofHex.trim().length === 0)
      throw new Error("Paste the Groth16 proof hex first.");
    const pinned = await pinProof(requireSession("artifactsJson"), proofHex);
    invalidateFrom("proof");
    session.pinnedArtifactsJson = pinned;
    return "proof verified against the file's verifying key and pinned; attach the Assert next, then save artifacts.asserted.json — the Assert broadcast unlocks once it is on disk";
  });
};
saveButton("save-pinned", PINNED_ARTIFACTS_FILENAME, "pinnedArtifactsJson");

byId<HTMLButtonElement>("attach-assert").onclick = () => {
  void runStep("assert", async () => {
    const { artifactsJson, assertTxHex } = await attachAssert(
      requireSession("pinnedArtifactsJson"),
      requireSession("wotsKeypairJson"),
    );
    invalidateFrom("assert");
    session.assertedArtifactsJson = artifactsJson;
    session.assertTxHex = assertTxHex;
    return `Assert finalized: ${assertTxHex.length / 2} bytes. Save artifacts.asserted.json (one-time WOTS: never finalize from another copy) — that unlocks the broadcast; then wait out timelock_assert before the Payout.`;
  });
};
broadcastButton("broadcast-assert", "Assert", "assertTxHex");
saveButton(
  "save-asserted",
  ASSERTED_ARTIFACTS_FILENAME,
  "assertedArtifactsJson",
  () => {
    session.assertedArtifactsSaved = true;
    syncButtons();
  },
);

byId<HTMLButtonElement>("finalize-payout").onclick = () => {
  void runStep("payout", async () => {
    const payoutTxHex = await buildPayout(
      requireSession("assertedArtifactsJson"),
    );
    invalidateFrom("payout");
    session.payoutTxHex = payoutTxHex;
    return `Payout finalized: ${payoutTxHex.length / 2} bytes (mempool rejects it with non-BIP68-final until the Assert timelock expires)`;
  });
};
broadcastButton("broadcast-payout", "Payout", "payoutTxHex");

byId<HTMLButtonElement>("finalize-wc").onclick = () => {
  const status = byId<HTMLDivElement>("status-wc");
  const gcIndexText = byId<HTMLInputElement>("wc-gc-index").value.trim();
  const gcIndex = Number(gcIndexText);
  // Number("") is 0, so an emptied field is refused explicitly.
  if (gcIndexText === "" || !Number.isInteger(gcIndex) || gcIndex < 0) {
    status.textContent = "GC index must be a non-negative integer.";
    return;
  }
  // Reported in the pane like every other WC failure, not thrown from the click handler.
  const assertedArtifactsJson = session.assertedArtifactsJson;
  if (assertedArtifactsJson === undefined) {
    status.textContent = "Attach the Assert first.";
    return;
  }
  void buildWronglyChallenged(
    assertedArtifactsJson,
    byId<HTMLInputElement>("wc-challenger").value,
    gcIndex,
    byId<HTMLInputElement>("wc-preimage").value,
  ).then(
    (hex) => {
      session.wronglyChallengedTxHex = hex;
      status.textContent = `WronglyChallenged finalized: ${hex.length / 2} bytes`;
      syncButtons();
    },
    (error: unknown) => {
      status.textContent = errorText(error);
      appendLog(`wronglyChallenged: ${errorText(error)}`, "err");
    },
  );
};
broadcastButton("broadcast-wc", "WronglyChallenged", "wronglyChallengedTxHex");

dispatch({ type: "invalidateAfter", step: "connect" });
appendLog("claim harness loaded");
