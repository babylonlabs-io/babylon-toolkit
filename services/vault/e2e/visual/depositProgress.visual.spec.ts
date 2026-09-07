/**
 * Photographs the deposit progress view.
 *
 * Everything past the pre-sign entry sits behind a signature or a wait the
 * capture cannot supply: the injected wallets never sign, and the recorded
 * depositor has no pending deposit to resume. So the stepper's mid-flow
 * states, and `SplitGroupedProgress` - the per-vault lanes of a two-vault
 * deposit - had no visual coverage at all, and a change that restacked those
 * lanes reported "no visual changes" the same way an untouched file would.
 *
 * The god-mode demo gallery (`src/dev/demoDeposit.ts`) is the way in. Its
 * deposits are built by the real state machine, listed by the real pending
 * rows and opened in the real stepper; only the polling result behind each
 * one is simulated, and none of them is ever polled. One deposit is seeded
 * per flow step, plus the activated terminal and a two-vault batch, so the
 * whole walk a depositor can be parked on is photographed. The walk seeds
 * it the way QA does - through the panel's own controls, by their names -
 * because that chrome carries no testids, and a testid added in `src/` would
 * not exist on the merge-base side. A renamed control fails the walk at the
 * click, loudly, which is the right failure.
 *
 * Like the other captures this asserts nothing about how the screens look.
 * It guarantees each stop is reached, populated, and photographed identically
 * on both sides of the comparison.
 */

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import {
  connectInjectedWallets,
  injectPageWallets,
} from "../fixtures/pageWallets";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  recordedPageWallets,
  type StagedShot,
  STEP_MARKER,
  writeCaptures,
} from "./capture";
import {
  DEPOSIT_FLOW_STEP_COUNT,
  DEPOSIT_FLOW_STEPS,
  DEPOSIT_PROGRESS_STOPS,
  depositProgressStepStop,
  flowScreenshotFileName,
  VISUAL_VIEWPORTS,
} from "./targets";

/**
 * The god-mode panel's controls, by the accessible names the panel gives them
 * (`src/dev/GodModePanel.tsx`, `src/dev/panels/DepositVaults.tsx`).
 */
const PANEL = {
  launcher: "God mode",
  depositsTab: "Deposit & Vaults",
  injectDemo: "Inject demo",
  batched: "Batched (group with other batched deposits)",
  addMock: "+ Add mock",
  /** Per-deposit slider over the flow's scenarios, one position per step. */
  step: (position: number) => `Mock ${position} step`,
  /** Per-deposit readout: `Step <n>: <label>`, or the terminal's own label. */
  state: (position: number) => `Mock ${position} state`,
  hide: "Hide",
} as const;

/**
 * The slider position of the activated terminal: the panel lists the flow's
 * steps first, one position per step, and the terminal right after them
 * (`DEPOSIT_FLOW_SCENARIOS` in `src/dev/demoDeposit.ts`).
 */
const ACTIVATED_SLIDER_POSITION = DEPOSIT_FLOW_STEP_COUNT;

/** What the panel's readout says once the slider sits on the terminal. */
const ACTIVATED_READOUT = /^Activated/;

/**
 * The control the activation gate exists to hold back
 * (`src/components/simple/ActivateConfirmationModal.tsx`), the same testid
 * the real-wallet step machine drives.
 */
const ACTIVATE_BUTTON_TESTID = "activate-vault-button";

/**
 * The success view's only control (`COPY.deposit.vaultActivatedSuccess.
 * goToDashboard`), the finish line the real-wallet step machine waits on
 * (`e2e/real/actions/stepMachine.ts`).
 */
const GO_TO_DASHBOARD = /go to dashboard/i;

/**
 * What opening a seeded deposit's row shows, and so what proves it rendered:
 * the stepper (its step markers), the activation gate that opens ahead of
 * the stepper at step 13 (its Activate button), or the success view that
 * replaces the stepper once the vault counts as activated (its dashboard
 * button).
 */
type Opens = "stepper" | "activation-gate" | "activated";

/** The one flow step whose row opens onto the activation gate. */
const ACTIVATION_GATE_STEP = 13;

/**
 * The step whose row opens onto the success view: the activation submitted,
 * which the app already treats as activated. The terminal after it renders
 * the same view, so it is seeded for its pending row and not photographed.
 */
const ACTIVATED_VIEW_STEP = 15;

function opensAt(step: number): Opens {
  if (step === ACTIVATION_GATE_STEP) return "activation-gate";
  if (step === ACTIVATED_VIEW_STEP) return "activated";
  return "stepper";
}

interface SeededDeposit {
  /** The panel slider position: `step - 1` for a flow step, the terminal after. */
  readonly slider: number;
  /** What the panel's readout must say once seeded - the pin against drift. */
  readonly readout: RegExp;
  readonly batched: boolean;
  readonly opens: Opens;
  /**
   * The screen this row's stop is written to. None for the split pair, which
   * is photographed as one batch, and for the terminal.
   */
  readonly stop: string | null;
}

function flowStep(step: number, batched: boolean): SeededDeposit {
  return {
    slider: step - 1,
    readout: new RegExp(`^Step ${step}:`),
    batched,
    opens: opensAt(step),
    stop: batched ? null : depositProgressStepStop(step),
  };
}

/**
 * The deposits seeded into the gallery, in the order the pending list shows
 * them. Steps are the stepper's own 1-based visual numbering
 * (`src/components/simple/DepositProgressView/steps.ts`).
 *
 * The two batched deposits share a Pre-PegIn, so they open as one two-lane
 * batch. Their steps DIFFER on purpose: one lane waits on the vault provider
 * (8) while the other still awaits its WOTS key (7), so the shared trunk and
 * both diverged lanes render, and the provider-wait detail panel renders
 * under exactly one of them. Then one standalone deposit per flow step, so
 * the stepper is photographed at every step a depositor can be parked on,
 * and one at the activated terminal for its row alone.
 */
const SEEDED_DEPOSITS: readonly SeededDeposit[] = [
  flowStep(8, true),
  flowStep(7, true),
  ...DEPOSIT_FLOW_STEPS.map((step) => flowStep(step, false)),
  {
    slider: ACTIVATED_SLIDER_POSITION,
    readout: ACTIVATED_READOUT,
    batched: false,
    opens: "activated",
    stop: null,
  },
];

/** Pending-list row of the split pair; any batched row opens the whole batch. */
const SPLIT_ROW = SEEDED_DEPOSITS.findIndex((deposit) => deposit.batched);
const SPLIT_LANE_COUNT = SEEDED_DEPOSITS.filter(
  (deposit) => deposit.batched,
).length;

/**
 * The stepper's active-step markers only. A two-lane batch on diverged steps
 * shows exactly one per lane, which is what proves the lanes rendered rather
 * than the single-vault stepper.
 */
const ACTIVE_STEP_MARKER = `${STEP_MARKER}[aria-label$=" active"]`;

/**
 * Seed the gallery through the panel, then hide the panel again.
 *
 * "Inject demo" is what publishes the deposits to the real sections, and it
 * keeps doing so after "Hide": the panel's publish effect has no cleanup, so
 * collapsing it leaves the last published set in place. The launcher that
 * remains is hidden by `stabilize.ts` before the first photograph.
 */
async function seedDemoDeposits(page: Page): Promise<void> {
  await page.getByRole("button", { name: PANEL.launcher, exact: true }).click();
  await page.getByRole("button", { name: PANEL.depositsTab }).click();
  await page.getByLabel(PANEL.injectDemo).check();

  for (const [index, deposit] of SEEDED_DEPOSITS.entries()) {
    // The panel opens with one deposit already listed; every further one is
    // added, and each addition appends a row of controls after the others.
    if (index > 0) {
      await page.getByRole("button", { name: PANEL.addMock }).click();
    }
    const position = index + 1;
    await page.getByLabel(PANEL.step(position)).fill(String(deposit.slider));
    // The readout names the state the slider landed on. Pinned because the
    // slider position assumes the gallery lists the flow's steps in order,
    // one per step; a reordered gallery would otherwise seed a different,
    // equally stable state and photograph it on both sides.
    await expect(page.getByLabel(PANEL.state(position))).toHaveText(
      deposit.readout,
    );
    if (deposit.batched) {
      await page.getByLabel(PANEL.batched).nth(index).check();
    }
  }

  await page.getByRole("button", { name: PANEL.hide, exact: true }).click();
}

/**
 * Open a pending row's deposit and wait for what it shows.
 *
 * The row's action slot is its last control - "View details" for a deposit
 * that is waiting, the step's own CTA otherwise - and either opens the
 * continuation for a demo deposit. The only other control in the row copies
 * the transaction hash.
 *
 * Returns the modal it opens in, so every claim about the deposit is confined
 * to it rather than to whatever the page behind it renders.
 */
async function openDeposit(
  page: Page,
  row: number,
  opens: Opens,
): Promise<Locator> {
  await page
    .getByTestId("pending-deposit-row")
    .nth(row)
    .getByRole("button")
    .last()
    .click();
  const modal = page.locator(".portal-root");
  const shown =
    opens === "stepper"
      ? modal.locator(STEP_MARKER).first()
      : opens === "activation-gate"
        ? modal.getByTestId(ACTIVATE_BUTTON_TESTID)
        : modal.getByRole("button", { name: GO_TO_DASHBOARD });
  await shown.waitFor();
  // The click scrolls the row into view and the modal is fixed to the
  // viewport, so a full-page photograph would place it wherever the page
  // happened to be scrolled - which varies run to run for a row below the
  // fold. Anchor it at the top: the page behind it is photographed by the
  // pending stop, and the modal is the picture here.
  await page.evaluate(() => window.scrollTo(0, 0));
  return modal;
}

/**
 * Close the modal. It dismisses on Escape; the modal's controls leaving the
 * DOM is it being gone, so the next row's click cannot land on it.
 */
async function closeDeposit(page: Page, modal: Locator): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(modal.getByRole("button")).toHaveCount(0);
}

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture the deposit progress view at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const backend = await preparePage(page);
    await injectPageWallets(page, recordedPageWallets());

    const shots: StagedShot[] = [];

    await page.goto("/vaults", { waitUntil: "domcontentloaded" });
    await connectInjectedWallets(page);
    await seedDemoDeposits(page);

    // Same testid the real-wallet resume action drives
    // (`e2e/real/actions/resume.ts`). Every seeded deposit must be listed:
    // a gallery that published fewer rows is photographing the wrong state.
    const rows = page.getByTestId("pending-deposit-row");
    await expect(rows).toHaveCount(SEEDED_DEPOSITS.length);
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(DEPOSIT_PROGRESS_STOPS.pending, viewport),
      ),
    );

    const splitStepper = await openDeposit(page, SPLIT_ROW, "stepper");
    await expect(splitStepper.locator(ACTIVE_STEP_MARKER)).toHaveCount(
      SPLIT_LANE_COUNT,
    );
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(DEPOSIT_PROGRESS_STOPS.split, viewport),
      ),
    );
    await closeDeposit(page, splitStepper);

    // Every standalone deposit in turn: the stepper parked on each flow step,
    // the activation gate where the flow opens onto it, and the success view
    // at the terminal.
    for (const [row, deposit] of SEEDED_DEPOSITS.entries()) {
      if (deposit.stop === null) continue;
      const modal = await openDeposit(page, row, deposit.opens);
      shots.push(
        await capture(page, flowScreenshotFileName(deposit.stop, viewport)),
      );
      await closeDeposit(page, modal);
    }

    // Deferred to the end because these accumulate across the walk. Nothing
    // has reached disk yet, so a failure here withholds every stop - which
    // is what makes the capture step's `continue-on-error` safe. The
    // demo deposits are never polled, so the boundaries named are the app
    // shell's own: the chain and the indexer for the summary card, the VP
    // proxy for the provider list, mempool for the balance.
    assertRecordingCovered(backend, `deposit progress at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    await writeCaptures(shots);
  });
}

test.beforeAll(ensureOutputDir);
