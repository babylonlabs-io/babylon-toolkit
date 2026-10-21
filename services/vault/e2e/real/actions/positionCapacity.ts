/**
 * Position-capacity coverage for the `pegin` action.
 *
 * Before a deposit is registered, and again before its Pre-PegIn is broadcast, the app asks the
 * application `allowedToDeposit` for the deposit plus the depositor's other registered, unactivated
 * vaults, which it reads from chain first (the registry's `getDepositorVaultIds`). Every pegin run watches
 * those reads on the app's own RPC (positionCapacityRpc.ts) and requires both, each asking what the CLI's
 * own chain reads say it should (positionCapacityParams.ts). On `--target=website` without an injection
 * the watch only logs what it saw: the deployed build can predate the check.
 *
 * `--inject-position-full` turns the run into the unhappy path:
 *   - `before-registration`: the watch answers "no room" from the Sign click. The deposit must stop on
 *     "Not enough room in your position" with a Close button (nothing to resume) before any signing
 *     prompt, and on chain the account sends nothing and registers no vault. Spends nothing. With UniSat
 *     unlocked no wallet window may open at all (the app's liveness probe, which runs before the check,
 *     would otherwise ask to unlock). The pop-up approver is removed before Sign, so a prompt that did
 *     open could not be approved either.
 *   - `before-broadcast`: the watch answers truthfully until the registration is mined, then "no room".
 *     The deposit must stop with Retry before its Pre-PegIn is broadcast, its vaults registered and still
 *     Pending, and the Bitcoin network must not know the Pre-PegIn. Then the injection releases, Retry
 *     resumes the deposit, which must ask again before broadcasting, and it is walked to activation.
 *     Spends a full peg-in. Once the registration is mined the command that resumes the deposit is
 *     logged, and a failed check is recorded while the deposit is still walked to activation, so no BTC
 *     is left behind unnoticed.
 *
 * Run on `--target=localhost` from the branch under test: `--target=website` drives the deployed build.
 */
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseUnits, type Hex } from "viem";

import { fetchActiveVaultCount } from "../borrowParams";
import { type PositionFullInjection } from "../config";
import { resolveNetworkContracts } from "../networkContracts";
import { BTC_DECIMALS } from "../peginParams";
import {
  isTxKnownToMempool,
  readBlockNumber,
  readCapacitySnapshot,
  readDepositorVaultIds,
  readInFlight,
  readPendingNonce,
  readRegisteredVaults,
  type CapacityMirror,
  type CapacitySnapshot,
} from "../positionCapacityParams";
import {
  FORM_SETTLE_MS,
  PEGIN_POLL_INTERVAL_MS,
  POSITION_REFUSAL_BEFORE_BROADCAST_TIMEOUT_MS,
  POSITION_REFUSAL_BEFORE_REGISTRATION_TIMEOUT_MS,
  POSITION_REFUSAL_HOLD_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { sweepApprovals } from "./approver";
import {
  watchPositionCapacity,
  type PositionCapacityWatch,
} from "./positionCapacityRpc";
import {
  assertCheckedBeforeBroadcast,
  assertCheckedBeforeRegistration,
  assertRefusedBeforeRegistration,
  describeExpected,
  describeRead,
  expectedCapacityArgs,
  matchesAny,
  type CapacityArgs,
} from "./positionCapacityRpcAnswers";
import {
  closeCtaButton,
  POSITION_CAPACITY_EXCEEDED_TITLE,
  POSITION_CAPACITY_UNAVAILABLE_TITLE,
  retryButton,
} from "./selectors";
import {
  assertActivatedAndOnDashboard,
  assertNotReturnedAtActivation,
  assertVaultCountRose,
  readPrePeginTxid,
  walkStepMachine,
} from "./stepMachine";
import { type ActionContext } from "./types";

/** The capacity artifact written beside the run's other artifacts. */
const CAPACITY_ARTIFACT = "position-capacity.json";

/** A deposit's batch, as the capacity check sizes it. */
interface Batch {
  count: number;
  sats: bigint;
}

/** The deposit a run makes, as the pegin action resolved it. */
export interface CapacityDeposit {
  amountBtc: string;
  /** 1, or 2 for a split. */
  expectedVaults: number;
  split: boolean;
}

/** The pegin action's own form steps, so this module drives the same form without importing it. */
export interface DepositFormDriver {
  /** Fill and submit the deposit form, up to the "Sign Transaction" entry. */
  fill(): Promise<void>;
  /** Click "Sign Transaction", calling `beforeClick` right before the click. */
  sign(beforeClick: () => void): Promise<void>;
}

/** A watch over one deposit, with the chain's view of the position taken just before Sign. */
export interface CapacityProbe {
  watch: PositionCapacityWatch;
  batch: Batch;
  before: CapacitySnapshot;
  /** What the app should ask, from `before`. */
  expected: CapacityArgs;
  /**
   * Whether a missing or wrong check fails the run. Off only on `--target=website` without an
   * injection: the deployed build can predate the check, and the run is then about something else.
   */
  enforce: boolean;
}

/**
 * Read the position from chain and start watching the deposit's capacity checks. Call after the form is
 * filled and right before Sign. Refuses a run whose position the chain already says is full: such a run
 * could only test a real refusal, which neither scenario is.
 */
export async function startCapacityProbe(
  ctx: ActionContext,
  deposit: CapacityDeposit,
  injection: PositionFullInjection | undefined,
): Promise<CapacityProbe> {
  const { network, target } = ctx.config;
  const batch: Batch = {
    count: deposit.expectedVaults,
    sats: parseUnits(deposit.amountBtc, BTC_DECIMALS),
  };
  const before = await readCapacitySnapshot(network, ctx.eth.address, batch);
  const expected = expectedCapacityArgs(batch, before.inFlight);
  ctx.log(
    `Position capacity before Sign: ${before.inFlight.count} other unactivated vault(s) (${before.inFlight.sats} sats); the app should ask ${describeRead(expected)}, which the chain answers ${before.allowed}.`,
  );
  if (!before.allowed)
    throw new Error(
      `The chain already says the position has no room for this deposit (${describeRead(expected)} → false). Withdraw a vault, wait for unactivated deposits to activate or expire, or use another ETH account.`,
    );

  const enforce = target === "localhost" || injection !== undefined;
  if (!enforce)
    ctx.log(
      "Position-capacity checks are watched but not enforced: --target=website drives the deployed build.",
    );
  const { registry, appController } = resolveNetworkContracts(network);
  const watch = await watchPositionCapacity(ctx.page, ctx.context, {
    depositor: ctx.eth.address,
    adapter: appController,
    registry,
    injection,
    enforce,
    startBlock: await readBlockNumber(network),
    log: ctx.log,
  });
  return { watch, batch, before, expected, enforce };
}

/**
 * The fast-fail the walk runs every tick: the watch refused a registration that skipped the check. A
 * probe that does not enforce never fails the walk.
 */
export function capacityViolationCheck(
  probe: CapacityProbe,
): () => Promise<void> {
  return async () => {
    const { violation } = probe.watch.state();
    if (violation && probe.enforce) throw new Error(violation);
  };
}

/** Write what the watch saw, for a failed run's post-mortem. Never throws. */
export function writeCapacityArtifact(
  ctx: ActionContext,
  probe: CapacityProbe,
): void {
  try {
    writeFileSync(
      join(ctx.artifactsDir, CAPACITY_ARTIFACT),
      JSON.stringify(
        {
          injection: probe.watch.state().injection ?? null,
          enforce: probe.enforce,
          depositor: ctx.eth.address,
          batch: probe.batch,
          before: probe.before,
          expected: probe.expected,
          watched: probe.watch.state(),
        },
        (_key, value: unknown) =>
          typeof value === "bigint" ? value.toString() : value,
        2,
      ),
    );
  } catch (error) {
    ctx.log(
      `⚠️ Could not write ${CAPACITY_ARTIFACT}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/** The deposit's own registered vaults: the ids the registry lists now that it did not before Sign. */
async function readOwnVaultIds(
  ctx: ActionContext,
  probe: CapacityProbe,
): Promise<{ listed: Hex[]; own: Hex[] }> {
  const listed = await readDepositorVaultIds(
    ctx.config.network,
    ctx.eth.address,
  );
  const known = new Set(probe.before.depositorVaultIds);
  return { listed, own: listed.filter((id) => !known.has(id)) };
}

/**
 * What the app may have asked at `stage`: the question from before Sign, or the one the chain gives now,
 * with the deposit's own vaults counted once. Another of the account's vaults can expire or activate
 * during the run and the app reads at its own moment, so either is right.
 */
async function expectedAt(
  ctx: ActionContext,
  probe: CapacityProbe,
  stage: CapacityMirror["stage"],
): Promise<CapacityArgs[]> {
  const { listed, own } = await readOwnVaultIds(ctx, probe);
  const inFlight = await readInFlight(ctx.config.network, listed, {
    stage,
    ownVaultIds: own,
  });
  return [probe.expected, expectedCapacityArgs(probe.batch, inFlight)];
}

/**
 * The happy-path verdict, once the walk is through: the app asked before registering and again before
 * broadcasting, each time about this deposit plus the depositor's other unactivated vaults (its own
 * registered vaults are counted once, as the deposit), after reading the depositor's vault list. A probe
 * that does not enforce logs the verdict instead of failing the run.
 */
export async function judgeCapacityChecks(
  ctx: ActionContext,
  probe: CapacityProbe,
): Promise<void> {
  try {
    const state = probe.watch.state();
    const registration = assertCheckedBeforeRegistration(
      state,
      await expectedAt(ctx, probe, "registration"),
    );
    const mined = state.registrationMined;
    if (!mined)
      throw new Error(
        "The watch never saw the registration receipt on the app's RPC, so the check before the broadcast cannot be placed.",
      );
    const broadcast = assertCheckedBeforeBroadcast(
      state,
      "Before the Pre-PegIn broadcast",
      mined.seq,
      await expectedAt(ctx, probe, "broadcast"),
    );
    ctx.log(
      `✅ Position capacity checked from chain before registration (${describeRead(registration)}) and before the broadcast (${describeRead(broadcast)}).`,
    );
  } catch (error) {
    if (probe.enforce) throw error;
    ctx.log(
      `⚠️ Position-capacity checks not as expected (not enforced on the deployed build): ${error instanceof Error ? error.message : error}`,
    );
  }
}

/** Whether `title` is on screen right now. */
async function shows(ctx: ActionContext, title: string): Promise<boolean> {
  return ctx.page
    .getByText(title, { exact: true })
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Log the command that resumes the deposit, from the Pre-PegIn its registered vaults name on chain.
 * Never throws. Returns whether it was logged; a read that failed (the chain view can trail the
 * receipt) is reported only when `reportFailure` is set.
 */
async function logResumeCommand(
  ctx: ActionContext,
  deposit: CapacityDeposit,
  probe: CapacityProbe,
  reportFailure: boolean,
): Promise<boolean> {
  const { config, log } = ctx;
  try {
    const { own } = await readOwnVaultIds(ctx, probe);
    const [vault] = await readRegisteredVaults(config.network, own);
    if (!vault) throw new Error("the registry lists no new vault yet");
    log(
      `The deposit is registered (Pre-PegIn ${vault.prePeginTxHash}). If the run stops before activation, resume it with: pnpm --filter vault run e2e:cli --yes --target=localhost --network=${config.network} --btc=${config.btcWallet} --eth=${config.ethWallet} --action=resume --txid=${vault.prePeginTxHash.replace(/^0x/, "")}${deposit.split ? " --split" : ""}`,
    );
    return true;
  } catch (error) {
    if (reportFailure)
      log(
        `⚠️ Could not read the registered deposit to print its resume command: ${error instanceof Error ? error.message : error}`,
      );
    return false;
  }
}

/**
 * `--inject-position-full=before-registration`: the deposit must stop before any signing prompt, with
 * nothing registered and nothing to resume, and with UniSat unlocked no wallet window may open at all.
 * `removeApprover` stops auto-approving wallet windows.
 */
export async function runPeginRefusedBeforeRegistration(
  ctx: ActionContext,
  deposit: CapacityDeposit,
  form: DepositFormDriver,
  onStep: (step: string) => void,
  removeApprover: () => void,
): Promise<void> {
  const { page, log, config } = ctx;

  onStep("deposit-form");
  await form.fill();
  const probe = await startCapacityProbe(ctx, deposit, "before-registration");
  try {
    const nonceBefore = await readPendingNonce(config.network, ctx.eth.address);
    removeApprover();

    onStep("sign-transaction");
    await form.sign(probe.watch.markSignClick);

    onStep("refusal");
    const deadline =
      Date.now() + POSITION_REFUSAL_BEFORE_REGISTRATION_TIMEOUT_MS;
    for (;;) {
      const state = probe.watch.state();
      const signClickSeq = state.signClickSeq ?? 0;
      const prompt = state.popups.find((popup) => popup.seq > signClickSeq);
      if (prompt) {
        const checkedFirst = state.capacityReads.some(
          (read) => read.seq > signClickSeq && read.seq < prompt.seq,
        );
        // The app's BTC wallet liveness probe runs before the check and can ask a locked wallet to
        // unlock, so a window before any capacity read is ambiguous; one after it is not.
        throw new Error(
          checkedFirst
            ? `A wallet window opened after the app's capacity check (${prompt.url}) although the position has no room: the deposit was not refused before its first signing prompt.`
            : `A wallet window opened after Sign (${prompt.url}) before the app asked allowedToDeposit: either UniSat asked to unlock for the app's liveness probe, which runs before the check, or the app prompted without checking. Unlock UniSat and re-run; if a window opens again, the check before registration is missing.`,
        );
      }
      if (await shows(ctx, POSITION_CAPACITY_UNAVAILABLE_TITLE))
        throw new Error(
          `The deposit stopped on "${POSITION_CAPACITY_UNAVAILABLE_TITLE}": a real chain read failed, or one of the depositor's vaults is in a status the app does not model (which a healthy RPC will not clear), so the run is inconclusive. Re-run once the RPC is healthy.`,
        );
      if (await shows(ctx, POSITION_CAPACITY_EXCEEDED_TITLE)) break;
      if (Date.now() > deadline)
        throw new Error(
          `The deposit did not stop on "${POSITION_CAPACITY_EXCEEDED_TITLE}" within ${POSITION_REFUSAL_BEFORE_REGISTRATION_TIMEOUT_MS} ms of Sign, though the position was answered "no room".`,
        );
      await page.waitForTimeout(FORM_SETTLE_MS);
    }

    await expect(
      closeCtaButton(page),
      "A refusal before registration leaves nothing to resume, so the deposit must end with Close.",
    ).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(retryButton(page)).toHaveCount(0);
    const refusal = assertRefusedBeforeRegistration(probe.watch.state(), [
      probe.expected,
    ]);
    log(
      `Refused before registration on ${describeRead(refusal)} — holding ${POSITION_REFUSAL_HOLD_MS} ms to make sure nothing follows.`,
    );

    await page.waitForTimeout(POSITION_REFUSAL_HOLD_MS);
    assertRefusedBeforeRegistration(probe.watch.state(), [probe.expected]);
    expect(
      await shows(ctx, POSITION_CAPACITY_EXCEEDED_TITLE),
      "The refusal must still be on screen after the hold.",
    ).toBe(true);
    expect(
      await readPrePeginTxid(page),
      "A refused deposit must not link a Pre-PegIn.",
    ).toBeUndefined();

    const nonceAfter = await readPendingNonce(config.network, ctx.eth.address);
    if (nonceAfter !== nonceBefore)
      throw new Error(
        `The account's transaction count moved from ${nonceBefore} to ${nonceAfter} during a deposit refused before registration.`,
      );
    const listedAfter = await readDepositorVaultIds(
      config.network,
      ctx.eth.address,
    );
    if (listedAfter.length !== probe.before.depositorVaultIds.length)
      throw new Error(
        `The registry lists ${listedAfter.length} vault(s) for the depositor after the refusal, ${probe.before.depositorVaultIds.length} before: a vault was registered.`,
      );
    log(
      "✅ Refused before registration: the refusal and Close showed, no wallet window opened, nothing was sent or registered.",
    );
  } finally {
    await probe.watch.dispose();
    writeCapacityArtifact(ctx, probe);
  }
}

/**
 * The deposit's registered vaults, as the chain now lists them beyond `before`: exactly `count` of
 * them, all Pending, the depositor's, in the deposit's application, on one Pre-PegIn, summing to the
 * deposit. Returns that Pre-PegIn's txid.
 */
async function assertRegisteredAndPending(
  ctx: ActionContext,
  probe: CapacityProbe,
): Promise<Hex> {
  const { network } = ctx.config;
  const { appController } = resolveNetworkContracts(network);
  const { own: added } = await readOwnVaultIds(ctx, probe);
  if (added.length !== probe.batch.count)
    throw new Error(
      `The registry lists ${added.length} new vault(s) for the depositor, expected the deposit's ${probe.batch.count}.`,
    );
  const vaults = await readRegisteredVaults(network, added);
  const prePeginTxHashes = new Set(
    vaults.map((vault) => vault.prePeginTxHash.toLowerCase()),
  );
  const total = vaults.reduce((sum, vault) => sum + vault.amount, 0n);
  for (const vault of vaults) {
    if (vault.status !== OnChainBtcVaultStatus.PENDING)
      throw new Error(
        `Vault ${vault.vaultId} reads ${OnChainBtcVaultStatus[vault.status] ?? vault.status} on chain, expected PENDING: the refused deposit moved on.`,
      );
    if (
      vault.depositor.toLowerCase() !== ctx.eth.address.toLowerCase() ||
      vault.applicationEntryPoint.toLowerCase() !== appController.toLowerCase()
    )
      throw new Error(
        `Vault ${vault.vaultId} is registered to ${vault.depositor} in ${vault.applicationEntryPoint}, not to this depositor in ${appController}.`,
      );
  }
  if (prePeginTxHashes.size !== 1 || total !== probe.batch.sats)
    throw new Error(
      `The new vaults sit on ${prePeginTxHashes.size} Pre-PegIn(s) and total ${total} sats, expected one Pre-PegIn and ${probe.batch.sats} sats.`,
    );
  return vaults[0].prePeginTxHash;
}

/** How the wait for the refusal before the broadcast ended. */
type BroadcastRefusalOutcome =
  /** "Not enough room" with Retry, as injected. */
  | "refused"
  /** "Couldn't check your position": a real read failed, or a vault is in a status the app does not model. */
  | "unchecked"
  /** The Pre-PegIn went out despite the injected "no room". */
  | "broadcast";

/**
 * `--inject-position-full=before-broadcast`: the deposit must register, then stop before its Pre-PegIn
 * broadcast with the vaults still resumable; Retry must resume it once the position has room again.
 */
export async function runPeginRefusedBeforeBroadcast(
  ctx: ActionContext,
  deposit: CapacityDeposit,
  form: DepositFormDriver,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log, config } = ctx;
  const vaultsBefore = await fetchActiveVaultCount(
    config.network,
    ctx.eth.address,
  );

  onStep("deposit-form");
  await form.fill();
  const probe = await startCapacityProbe(ctx, deposit, "before-broadcast");
  const failures: Error[] = [];
  const recordFailure = (error: unknown) => {
    failures.push(error instanceof Error ? error : new Error(String(error)));
    log(`❌ ${failures.at(-1)?.message}`);
  };
  const check = async (what: () => Promise<void> | void) => {
    try {
      await what();
    } catch (error) {
      recordFailure(error);
    }
  };
  try {
    onStep("sign-transaction");
    await form.sign(probe.watch.markSignClick);

    onStep("until-refusal");
    const deadline = Date.now() + POSITION_REFUSAL_BEFORE_BROADCAST_TIMEOUT_MS;
    let resumeCommandLogged = false;
    let outcome: BroadcastRefusalOutcome;
    for (;;) {
      await sweepApprovals(context, page, log);
      const state = probe.watch.state();
      if (state.violation) throw new Error(state.violation);
      if (state.registrationMined && !resumeCommandLogged)
        resumeCommandLogged = await logResumeCommand(
          ctx,
          deposit,
          probe,
          false,
        );
      if (state.broadcastSeqs.length > 0 || (await readPrePeginTxid(page))) {
        if (!state.registrationMined) {
          await logResumeCommand(ctx, deposit, probe, true);
          throw new Error(
            "The Pre-PegIn was broadcast before the watch saw the registration receipt on the app's RPC, so the injection never answered 'no room' and the refusal was not tested. The deposit is registered and broadcast: resume it to activation with the resume command logged above (if the registry could be read).",
          );
        }
        recordFailure(
          new Error(
            "The Pre-PegIn was broadcast although the position was answered 'no room' once the registration was mined.",
          ),
        );
        outcome = "broadcast";
        break;
      }
      if (await shows(ctx, POSITION_CAPACITY_EXCEEDED_TITLE)) {
        const retryOffered = await retryButton(page)
          .isVisible()
          .catch(() => false);
        if (!state.registrationMined) {
          // Retry is offered only after the registration: then the watch missed its receipt.
          if (!retryOffered)
            throw new Error(
              "The deposit was refused before its registration, though the injection answered truthfully until then: the chain itself refused it.",
            );
          await logResumeCommand(ctx, deposit, probe, true);
          throw new Error(
            "The deposit was refused after its registration but before the watch saw the registration receipt on the app's RPC, so the injection never answered 'no room' and the chain itself refused it. Resume the deposit with the resume command logged above (if the registry could be read) once the position has room.",
          );
        }
        if (retryOffered) {
          outcome = "refused";
          break;
        }
      }
      if (await shows(ctx, POSITION_CAPACITY_UNAVAILABLE_TITLE)) {
        // Without Retry the flow ended before the registration: nothing to resume.
        if (
          !(await retryButton(page)
            .isVisible()
            .catch(() => false))
        )
          throw new Error(
            `The deposit stopped on "${POSITION_CAPACITY_UNAVAILABLE_TITLE}" with no Retry: before the registration a real chain read failed, or one of the depositor's vaults is in a status the app does not model (which a healthy RPC will not clear), so nothing was registered and the run is inconclusive. Re-run once the RPC is healthy.`,
          );
        if (state.registrationMined) {
          recordFailure(
            new Error(
              `The deposit stopped on "${POSITION_CAPACITY_UNAVAILABLE_TITLE}" after registration: a real chain or mempool read failed, or a vault is in a status the app does not model, so the refusal is inconclusive.`,
            ),
          );
          outcome = "unchecked";
          break;
        }
      }
      if (Date.now() > deadline) {
        // Read from chain, so it holds even when the watch missed the registration receipt.
        if (!resumeCommandLogged)
          await logResumeCommand(ctx, deposit, probe, true);
        throw new Error(
          `The deposit did not stop on "${POSITION_CAPACITY_EXCEEDED_TITLE}" with Retry within ${POSITION_REFUSAL_BEFORE_BROADCAST_TIMEOUT_MS} ms of Sign.`,
        );
      }
      await page.waitForTimeout(PEGIN_POLL_INTERVAL_MS);
    }
    if (!resumeCommandLogged) await logResumeCommand(ctx, deposit, probe, true);

    // From here the registration is mined: every check below records its failure instead of throwing,
    // so the deposit is walked to activation before the run fails.
    const state = probe.watch.state();
    const mined = state.registrationMined;
    if (!mined)
      throw new Error("The watch lost the registration receipt it stopped on.");
    await check(async () => {
      assertCheckedBeforeRegistration(
        state,
        await expectedAt(ctx, probe, "registration"),
      );
    });
    await check(() => {
      const early = state.capacityReads.find(
        (read) => read.seq < mined.seq && read.servedAnswer !== read.realAnswer,
      );
      if (early)
        throw new Error(
          `The injection refused ${describeRead(early)} before the registration was mined.`,
        );
    });
    // The read the app refused on: the first after the registration was mined.
    const refusal = state.capacityReads.find((read) => read.seq > mined.seq);
    if (outcome === "refused")
      await check(async () => {
        if (!refusal)
          throw new Error(
            "The app showed the refusal without an allowedToDeposit read after the registration was mined.",
          );
        if (refusal.realAnswer !== true)
          throw new Error(
            `The chain itself answered ${describeRead(refusal)} with ${refusal.realAnswer}, so the refusal did not come from the injection.`,
          );
        const expected = await expectedAt(ctx, probe, "broadcast");
        if (!matchesAny(refusal, expected))
          throw new Error(
            `Before the broadcast the app asked ${describeRead(refusal)}, expected ${describeExpected(expected)}: the deposit's own registered vaults must be counted once, as the deposit.`,
          );
      });

    if (outcome === "broadcast") {
      probe.watch.release();
    } else {
      await check(async () => {
        const prePeginTxHash = await assertRegisteredAndPending(ctx, probe);
        if (await isTxKnownToMempool(config.network, prePeginTxHash))
          throw new Error(
            `The Bitcoin network knows Pre-PegIn ${prePeginTxHash} although the deposit was refused before broadcasting it.`,
          );
      });

      log(
        `Holding the refusal ${POSITION_REFUSAL_HOLD_MS} ms to make sure nothing follows.`,
      );
      await page.waitForTimeout(POSITION_REFUSAL_HOLD_MS);
      await check(async () => {
        const held = probe.watch.state();
        const refusedSeq = refusal?.seq ?? mined.seq;
        const prompt = held.popups.find((popup) => popup.seq > refusedSeq);
        if (prompt)
          throw new Error(
            `A wallet window opened after the refusal (${prompt.url}).`,
          );
        if (held.broadcastSeqs.length > 0 || (await readPrePeginTxid(page)))
          throw new Error("The Pre-PegIn was broadcast during the refusal.");
      });

      onStep("resume");
      probe.watch.release();
      probe.watch.markRetryClick();
      await retryButton(page).click({ timeout: STEP_TIMEOUT_MS });
      await expect(
        page.getByText(POSITION_CAPACITY_EXCEEDED_TITLE, { exact: true }),
      ).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    }

    onStep("step-machine");
    const prePeginTxid = await walkStepMachine(
      page,
      context,
      log,
      deposit.expectedVaults,
      onStep,
      { onTick: capacityViolationCheck(probe) },
    );
    if (outcome !== "broadcast")
      await check(async () => {
        const retryClickSeq = probe.watch.state().retryClickSeq;
        if (retryClickSeq === null)
          throw new Error("The watch never saw the Retry click.");
        const resumed = assertCheckedBeforeBroadcast(
          probe.watch.state(),
          "Before the resumed broadcast",
          retryClickSeq,
          await expectedAt(ctx, probe, "broadcast"),
        );
        log(
          `✅ The resumed deposit asked again before broadcasting (${describeRead(resumed)}).`,
        );
      });

    onStep("finish");
    await assertNotReturnedAtActivation(page);
    await assertActivatedAndOnDashboard(
      page,
      log,
      deposit.amountBtc,
      prePeginTxid,
    );
    onStep("verify");
    await assertVaultCountRose(ctx, vaultsBefore, deposit.expectedVaults);
  } finally {
    await probe.watch.dispose();
    writeCapacityArtifact(ctx, probe);
  }
  if (failures.length > 0)
    throw new Error(
      `The deposit was walked to activation, but the refusal before its broadcast was wrong:\n- ${failures.map((failure) => failure.message).join("\n- ")}`,
    );
  log(
    "✅ Refused before the broadcast with the deposit registered and resumable, then resumed and activated once the position had room.",
  );
}
