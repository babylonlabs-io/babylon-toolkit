/**
 * The "forged-stuck" action: a lying mempool API must not turn a healthy Verified vault "stuck".
 *
 * The dashboard calls a Verified vault stuck — its PegIn swept the deposit on Bitcoin but the vault never
 * activated — and then hides Activate and offers only the irreversible activate-and-redeem ("Withdraw").
 * The sweep is reported by the mempool API's `outspend`, and the PegIn txid it has to name is public, so
 * the app checks the PegIn itself: fetched by the on-chain signed PegIn's txid, it must spend
 * the HTLC with a witness Bitcoin would accept — the preimage of the on-chain hashlock and every
 * participant's signature (`verifyPeginHashlockSpend`). This run plays the hostile API against the real app,
 * a real wallet and a real Verified vault. It routes the page's mempool requests for that vault (MetaMask
 * and the harness's own Node reads are untouched):
 *
 *   - `GET /tx/<prePegin>/outspend/<htlcVout>` → spent by the PegIn (unconfirmed);
 *   - `GET /tx/<pegin>/hex` → the depositor-signed PegIn the registry publishes: the right txid and
 *     outpoint, but only the depositor's signature in its witness. (A forger can do more — the other
 *     signatures are public too, so only the preimage would be wrong; the SDK's verifier tests cover that.)
 *
 * Default (sends nothing): forge, open /vaults and watch the deposit's row for two poll cycles. The run
 * fails the moment the row reads "Activation incomplete" / "Withdraw required" or its CTA reads Withdraw.
 * At the end it requires that, while it watched, the app asked for each forged outspend, fetched each
 * forged PegIn and read the real Pre-PegIn with no read failing — the proof ran for every vault, so the
 * run exercised it — and that the CTA still reads Activate. Against a build without the
 * proof, the row turns "Activation incomplete" within one poll and the PegIn is never fetched.
 *
 * `--activate`: then click Activate with the forgery still installed and drive the normal activation to an
 * activated vault — the lie must not stand in the way of the real action. This spends Sepolia gas and
 * consumes the deposit's Verified state. NEVER run it without an explicit go-ahead.
 *
 * The run never clicks Withdraw and never sends a redeem.
 *
 * The target is a Verified, not yet activated deposit of this depositor, either:
 *
 *   - named by its Pre-PegIn txid (`--txid`) — a split forges every Verified vault of the Pre-PegIn; or
 *   - pegged in by the run itself (`--pegin-first`): a single-vault deposit driven through the deposit
 *     flow and stopped at its Activate gate, once it is Verified, then left unactivated. The forgery is
 *     installed and the app reloaded only then, so the deposit flow itself talked to the real API. This
 *     spends signet BTC and Sepolia ETH; NEVER run it without an explicit go-ahead. The run logs the
 *     deposit's txid, and its activation window is long, so it can serve later `--txid` runs.
 *
 * A freshly verified deposit may still be waiting for its activation window, when its row offers no
 * Activate; the run then keeps watching, under the forgery, until Activate appears.
 */
import {
  calculateBtcTxHash,
  ViemVaultRegistryReader,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Locator, Page, Request, Route } from "@playwright/test";
import { gql } from "graphql-request";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Hex } from "viem";

import { fetchActiveVaultCount } from "../borrowParams";
import {
  createEthClient,
  createGraphQLClient,
  resolveNetworkContracts,
} from "../networkContracts";
import {
  FORGED_STUCK_ACTIVATE_WAIT_MS,
  FORGED_STUCK_OBSERVE_MS,
  FORGED_STUCK_POLL_MS,
  MS_PER_SECOND,
  RESUME_ROW_APPEAR_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover } from "./approver";
import {
  forgedOutspendBody,
  forgedVaultFromRecord,
  isTxHexRequest,
  matchForgedRequest,
  rowOffersEscapeHatch,
  rowsOfferActivation,
  type ForgedVault,
  type RowObservation,
} from "./forgedOutspend";
import { goToSection } from "./navigation";
import { fillDepositForm, startSigning } from "./pegin";
import { startRecording } from "./recording";
import { ensureConnected } from "./resume";
import {
  assertActivatedAndOnDashboard,
  assertVaultCountRose,
  walkStepMachine,
} from "./stepMachine";
import type { Action, ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// VaultsLifecycleSections' pending row and its CTA (real-wallet E2E hooks, shared with resume.ts).
const PENDING_ROW_TESTID = '[data-testid="pending-deposit-row"]';
const PENDING_RESUME_CTA_TESTID = '[data-testid="pending-deposit-resume-cta"]';

/** Ponder's max page size and a runaway-cursor backstop, as in peginParams.ts. */
const INDEXER_VAULTS_PAGE_SIZE = 1000;
const INDEXER_MAX_VAULT_PAGES = 50;

const TXID_RX = /^[0-9a-f]{64}$/;

const DEPOSITOR_VAULTS_FIRST = gql`
  query ForgedStuckVaultsFirst($depositor: String!, $limit: Int!) {
    vaults(where: { depositor: $depositor }, limit: $limit) {
      items {
        id
        unsignedPrePeginTx
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const DEPOSITOR_VAULTS_NEXT = gql`
  query ForgedStuckVaultsNext(
    $depositor: String!
    $limit: Int!
    $after: String!
  ) {
    vaults(where: { depositor: $depositor }, limit: $limit, after: $after) {
      items {
        id
        unsignedPrePeginTx
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface IndexerVault {
  id: Hex;
  unsignedPrePeginTx: string | null;
}

interface IndexerVaultPage {
  vaults: {
    items: IndexerVault[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

/** How many times the page asked for each forged answer, per vault. */
type HitCounts = Map<Hex, { outspend: number; hex: number }>;

/** Reads of the real Pre-PegIn's hex, which the proof needs besides the forged PegIn. */
interface PrePeginReads {
  succeeded: number;
  failed: number;
}

/** The forgery installed for one deposit. */
interface Forgery {
  prePeginTxid: string;
  vaults: ForgedVault[];
  hits: HitCounts;
  prePeginReads: () => PrePeginReads;
  /** Zero every count, so only what the app does from here on is judged. */
  resetCounts: () => void;
  dispose: () => Promise<void>;
}

const stripHex = (value: string): string => value.replace(/^0x/i, "");

function normalizeTxid(txid: string | undefined): string {
  const normalized = stripHex(txid?.trim() ?? "").toLowerCase();
  if (!TXID_RX.test(normalized))
    throw new Error(
      `forged-stuck: --txid must be the Pre-PegIn txid of a Verified, unactivated deposit (64 hex characters); got "${txid ?? ""}".`,
    );
  return normalized;
}

/**
 * Every vault of the depositor, across the indexer's pages. Refuses a list that does not fit rather than
 * searching part of it, which would report a deposit as missing when it is not.
 */
async function fetchDepositorVaults(
  graphqlEndpoint: string,
  depositor: string,
): Promise<IndexerVault[]> {
  const client = createGraphQLClient(graphqlEndpoint);
  const vaults: IndexerVault[] = [];
  let after: string | null = null;
  for (let pageIndex = 0; pageIndex < INDEXER_MAX_VAULT_PAGES; pageIndex++) {
    const page: IndexerVaultPage = after
      ? await client.request(DEPOSITOR_VAULTS_NEXT, {
          depositor,
          limit: INDEXER_VAULTS_PAGE_SIZE,
          after,
        })
      : await client.request(DEPOSITOR_VAULTS_FIRST, {
          depositor,
          limit: INDEXER_VAULTS_PAGE_SIZE,
        });
    vaults.push(...page.vaults.items);
    after = page.vaults.pageInfo.hasNextPage
      ? page.vaults.pageInfo.endCursor
      : null;
    if (!after) return vaults;
  }
  throw new Error(
    `forged-stuck: ${depositor} has more vaults than ${INDEXER_MAX_VAULT_PAGES} indexer pages hold; refusing to search a partial list.`,
  );
}

/**
 * The deposit's Verified vaults, forged from their on-chain registry records. The indexer only names the
 * candidates; the outpoint, the PegIn and the status all come from the registry.
 */
async function resolveForgedVaults(
  ctx: ActionContext,
  prePeginTxid: string,
): Promise<ForgedVault[]> {
  const { log, config } = ctx;
  const { registry, graphqlEndpoint, ethRpcUrl } = resolveNetworkContracts(
    config.network,
  );
  const vaults = await fetchDepositorVaults(
    graphqlEndpoint,
    ctx.eth.address.toLowerCase(),
  );
  const candidates = vaults.filter(
    (v) =>
      v.unsignedPrePeginTx !== null &&
      stripHex(calculateBtcTxHash(v.unsignedPrePeginTx)).toLowerCase() ===
        prePeginTxid,
  );
  if (candidates.length === 0)
    throw new Error(
      `forged-stuck: no deposit of ${ctx.eth.address} has Pre-PegIn txid ${prePeginTxid}.`,
    );

  const reader = new ViemVaultRegistryReader(
    createEthClient(ethRpcUrl),
    registry,
  );
  const forged: ForgedVault[] = [];
  for (const candidate of candidates) {
    const { basic, protocol } = await reader.getVaultData(candidate.id);
    if (basic.status !== OnChainBtcVaultStatus.VERIFIED) {
      log(
        `Skipping vault ${candidate.id}: on-chain status ${OnChainBtcVaultStatus[basic.status] ?? basic.status}, not Verified.`,
      );
      continue;
    }
    const vault = forgedVaultFromRecord(candidate.id, protocol);
    if (vault.prePeginTxid !== prePeginTxid)
      throw new Error(
        `forged-stuck: the registry records vault ${candidate.id}'s HTLC on Pre-PegIn ${vault.prePeginTxid}, not ${prePeginTxid}.`,
      );
    forged.push(vault);
  }
  if (forged.length === 0)
    throw new Error(
      `forged-stuck: no vault of Pre-PegIn ${prePeginTxid} is Verified on chain. The run needs a Verified, not yet activated deposit.`,
    );
  return forged;
}

/** Route the page's mempool requests for the forged vaults; everything else reaches the real API. */
async function installForgery(
  page: Page,
  vaults: readonly ForgedVault[],
  log: (m: string) => void,
): Promise<Pick<Forgery, "hits" | "dispose">> {
  const hits: HitCounts = new Map(
    vaults.map((v) => [v.vaultId, { outspend: 0, hex: 0 }]),
  );
  const matches = (url: URL) =>
    matchForgedRequest(vaults, url.href) !== undefined;
  const handler = async (route: Route) => {
    const forged = matchForgedRequest(vaults, route.request().url());
    const count = forged ? hits.get(forged.vault.vaultId) : undefined;
    if (!forged || !count) return route.fallback();
    count[forged.kind] += 1;
    if (count[forged.kind] === 1)
      log(
        `Forged ${forged.kind} served for vault ${forged.vault.vaultId} (PegIn ${forged.vault.peginTxid}).`,
      );
    // The mempool API is cross-origin, so the page reads the answer only with a CORS grant.
    const headers = { "access-control-allow-origin": "*" };
    if (forged.kind === "outspend")
      return route.fulfill({
        status: 200,
        headers,
        json: forgedOutspendBody(forged.vault),
      });
    return route.fulfill({
      status: 200,
      headers,
      contentType: "text/plain",
      body: forged.vault.signedPeginTxHex,
    });
  };
  await page.route(matches, handler);
  return { hits, dispose: () => page.unroute(matches, handler) };
}

/** The deposit's pending rows: every vault of the Pre-PegIn, each linking its txid. */
function depositRows(page: Page, prePeginTxid: string): Locator {
  return page
    .locator(PENDING_ROW_TESTID)
    .filter({ has: page.locator(`a[href*="${prePeginTxid}"]`) });
}

async function readRows(rows: Locator): Promise<RowObservation[]> {
  const observations: RowObservation[] = [];
  for (const row of await rows.all()) {
    const rowText = (await row.innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim();
    const cta = row.locator(PENDING_RESUME_CTA_TESTID);
    const ctaText =
      (await cta.count()) > 0
        ? (
            await cta
              .first()
              .innerText()
              .catch(() => "")
          ).trim()
        : undefined;
    observations.push({ rowText, ctaText });
  }
  return observations;
}

/**
 * Watch the rows, failing the moment one offers the escape hatch. Returns once the window has passed —
 * the stuck probe and its confirmation run on mount and every 60s, so it spans two of their cycles —
 * and the deposit offers Activate: on one row, with any split sibling waiting for the earlier vault. A
 * row still waiting for its activation window offers no Activate yet, so the watch goes on, under the
 * forgery, until it does or the wait runs out.
 */
async function watchRows(
  page: Page,
  rows: Locator,
  log: (m: string) => void,
): Promise<RowObservation[]> {
  await rows
    .first()
    .waitFor({ state: "visible", timeout: RESUME_ROW_APPEAR_TIMEOUT_MS });
  log(
    `Watching the deposit's row under the forgery for ${FORGED_STUCK_OBSERVE_MS / MS_PER_SECOND}s…`,
  );
  const watchUntil = Date.now() + FORGED_STUCK_OBSERVE_MS;
  const giveUpAt = watchUntil + FORGED_STUCK_ACTIVATE_WAIT_MS;
  let lastSummary = "";
  for (;;) {
    const observations = await readRows(rows);
    const summary = observations
      .map((o) => `${o.rowText} [CTA: ${o.ctaText ?? "none"}]`)
      .join(" | ");
    if (summary !== lastSummary) {
      lastSummary = summary;
      log(`Row → ${summary}`);
    }
    const stuck = observations.find((o) =>
      rowOffersEscapeHatch(o.rowText, o.ctaText),
    );
    if (stuck)
      throw new Error(
        `The forged outspend made the app offer activate-and-redeem ("${stuck.rowText}", CTA "${stuck.ctaText ?? "none"}"). A mempool API's spend report alone must never offer it.`,
      );
    if (Date.now() >= watchUntil && rowsOfferActivation(observations))
      return observations;
    if (Date.now() >= giveUpAt)
      throw new Error(
        `Under the forgery the row should offer the normal Activate, but after ${(FORGED_STUCK_OBSERVE_MS + FORGED_STUCK_ACTIVATE_WAIT_MS) / MS_PER_SECOND}s it reads: ${summary}`,
      );
    await page.waitForTimeout(FORGED_STUCK_POLL_MS);
  }
}

/**
 * The run exercised the proof only if the app consumed both forged answers for every vault, and no read
 * of the real Pre-PegIn failed: the proof fetches both transactions, and a failed Pre-PegIn read (a rate
 * limit, or the app's own timeout aborting it) stops it before the verifier ever sees the forged PegIn.
 * The Pre-PegIn is one URL for every vault of the deposit, so a read cannot be tied to its vault, and a
 * count of successes alone could let one vault's reads stand in for another's. A read counts once its
 * body has arrived, and every read that does not complete counts as failed, so with no failed read each
 * vault's proof had both transactions. The per-vault checks come first: a vault the app never probed also
 * has no Pre-PegIn read, and the reason is the probe, not the API.
 */
function assertForgeryConsumed(forgery: Forgery): void {
  const { vaults, hits } = forgery;
  for (const vault of vaults) {
    const count = hits.get(vault.vaultId);
    if (!count || count.outspend === 0)
      throw new Error(
        `The app never asked for vault ${vault.vaultId}'s HTLC outspend, so the forgery was never consumed and this run proves nothing. The probe runs only for vaults of the connected BTC wallet that the dashboard lists as Verified.`,
      );
    if (count.hex === 0)
      throw new Error(
        `The app never fetched vault ${vault.vaultId}'s PegIn, so the forged spend was never proven or refuted.`,
      );
  }
  const reads = forgery.prePeginReads();
  if (reads.failed > 0 || reads.succeeded < vaults.length)
    throw new Error(
      `The app read the real Pre-PegIn ${reads.succeeded} time(s) for ${vaults.length} vault(s), and ${reads.failed} read(s) failed, so the verifier may not have run on every forged PegIn. A rate-limited or failing mempool API makes the run inconclusive; retry.`,
    );
}

/** Resolve the deposit's Verified vaults from chain and install the forgery for them. */
async function forgeDeposit(
  ctx: ActionContext,
  prePeginTxid: string,
): Promise<Forgery> {
  const vaults = await resolveForgedVaults(ctx, prePeginTxid);
  ctx.log(
    `Forging ${vaults.length} Verified vault(s) of Pre-PegIn ${prePeginTxid}: ${vaults
      .map((v) => `${v.vaultId} (HTLC vout ${v.htlcVout})`)
      .join(", ")}`,
  );
  const { hits, dispose } = await installForgery(ctx.page, vaults, ctx.log);
  // The Pre-PegIn reaches the real API: the forgery routes only the outspend and the PegIn. A read is
  // judged when it ends: finished with its body (an HTTP error status still finishes), or failed —
  // which includes the app's own timeout aborting it.
  const prePeginReads: PrePeginReads = { succeeded: 0, failed: 0 };
  const onRequestFinished = async (request: Request) => {
    if (!isTxHexRequest(request.url(), prePeginTxid)) return;
    const response = await request.response();
    if (response?.ok()) prePeginReads.succeeded += 1;
    else prePeginReads.failed += 1;
  };
  const onRequestFailed = (request: Request) => {
    if (isTxHexRequest(request.url(), prePeginTxid)) prePeginReads.failed += 1;
  };
  ctx.page.on("requestfinished", onRequestFinished);
  ctx.page.on("requestfailed", onRequestFailed);
  return {
    prePeginTxid,
    vaults,
    hits,
    prePeginReads: () => ({ ...prePeginReads }),
    resetCounts: () => {
      prePeginReads.succeeded = 0;
      prePeginReads.failed = 0;
      for (const count of hits.values()) {
        count.outspend = 0;
        count.hex = 0;
      }
    },
    dispose: async () => {
      ctx.page.off("requestfinished", onRequestFinished);
      ctx.page.off("requestfailed", onRequestFailed);
      await dispose();
    },
  };
}

/**
 * `--pegin-first`: peg in a fresh single-vault deposit and stop at its Activate gate, where it is
 * Verified and not yet activated. Returns its Pre-PegIn txid.
 */
async function peginUntilVerified(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<string> {
  const { page, context, log, config } = ctx;
  const amountBtc = config.peginAmountBtc?.trim();
  if (!amountBtc)
    throw new Error(
      "forged-stuck --pegin-first: no deposit amount resolved — the minimum-deposit fetch failed and no --amount was given. Re-run with --amount=<btc>.",
    );
  log("Pegging in a fresh deposit, to stop once it is Verified");
  onStep("deposit-form");
  await fillDepositForm(
    page,
    log,
    amountBtc,
    config.peginProvider?.trim() || undefined,
    false,
  );
  onStep("sign-transaction");
  await startSigning(page, log);
  const txid = await walkStepMachine(page, context, log, 1, onStep, {
    stopAtActivationGate: true,
  });
  if (!txid)
    throw new Error(
      "forged-stuck --pegin-first: reached the Activate gate without capturing the deposit's Pre-PegIn txid.",
    );
  log(
    `Deposit ${txid} is Verified and left unactivated — it can serve later runs as --txid=${txid}.`,
  );
  return normalizeTxid(txid);
}

export const forgedStuckAction: Action = {
  id: "forged-stuck",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir, config } = ctx;
    const peginFirst = config.peginFirst === true;
    const activate = config.forgedStuckActivate === true;

    // A named deposit is forged before the app loads, so its first probe is already answered by the
    // forgery. A fresh one can be forged only once it is registered and Verified (below).
    let forgery = peginFirst
      ? undefined
      : await forgeDeposit(ctx, normalizeTxid(config.forgedStuckTxid));
    const handler = installPopupApprover(context, log);
    let currentStep = "connect";
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );
    let finalRows: RowObservation[] = [];
    let activated = false;

    try {
      await connectWallets(ctx);

      if (!forgery) {
        const txid = await peginUntilVerified(ctx, (step) => {
          currentStep = step;
        });
        forgery = await forgeDeposit(ctx, txid);
        // Start the app over under the forgery: the deposit flow's own polls had the real answers.
        currentStep = "reload-under-forgery";
        await page.reload({ waitUntil: "domcontentloaded" });
        await ensureConnected(ctx);
      }

      currentStep = "watch-forged-row";
      // Judge only what the app does while it is watched: a read the reload above aborted belongs to a
      // proof the page discarded, and the watch spans more than one poll of every probe.
      forgery.resetCounts();
      await goToSection(page, "vaults", log);
      const rows = depositRows(page, forgery.prePeginTxid);
      finalRows = await watchRows(page, rows, log);
      assertForgeryConsumed(forgery);
      log(
        "✅ The forged outspend did not make the app offer activate-and-redeem: the PegIn it served is not a valid spend of the HTLC, and the row still offers Activate.",
      );

      if (!activate) return;

      currentStep = "activate-under-forgery";
      const vaultsBefore = await fetchActiveVaultCount(
        config.network,
        ctx.eth.address,
      );
      log("--activate: activating normally with the forgery still installed…");
      // The CTA test id is on enabled actions only, so this is the earliest sibling's Activate; its
      // flow activates the whole batch in construction order.
      await rows
        .locator(PENDING_RESUME_CTA_TESTID)
        .first()
        .click({ timeout: STEP_TIMEOUT_MS });
      await walkStepMachine(
        page,
        context,
        log,
        forgery.vaults.length,
        (step) => {
          currentStep = step;
        },
      );
      await assertActivatedAndOnDashboard(
        page,
        log,
        undefined,
        forgery.prePeginTxid,
      );
      await assertVaultCountRose(ctx, vaultsBefore, forgery.vaults.length);
      activated = true;
      log(
        "✅ Normal activation completed while the mempool API reported the deposit swept.",
      );
    } finally {
      const forged = forgery;
      writeFileSync(
        join(artifactsDir, "forged-stuck.json"),
        `${JSON.stringify(
          {
            network: config.network,
            peginFirst,
            activate,
            prePeginTxid: forged?.prePeginTxid ?? null,
            prePeginReads: forged?.prePeginReads() ?? null,
            vaults: (forged?.vaults ?? []).map(
              ({ vaultId, htlcVout, peginTxid }) => ({
                vaultId,
                htlcVout,
                peginTxid,
                hits: forged?.hits.get(vaultId),
              }),
            ),
            finalRows,
            activated,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      log(`Wrote ${join(artifactsDir, "forged-stuck.json")}`);
      await recorder.stop();
      context.off("page", handler);
      await forged?.dispose();
    }
  },
};
