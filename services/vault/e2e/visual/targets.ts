/**
 * The capture manifest: which screens get photographed, at which sizes.
 *
 * Kept as data (not inline in the spec) because the CI job reports on
 * target names, and because adding a screen should be a one-line change
 * that needs no Playwright knowledge.
 *
 * Every target here must render without a connected wallet. The e2e
 * harness installs a wallet *sentinel* only (see `fixtures/test.ts`);
 * page-side provider construction is #1592, so connected-state screens
 * are not reachable yet and are deliberately absent.
 *
 * Paths are written out rather than imported from `src/routes.ts` for
 * two reasons. Importing app source pulls `tokenService` -> the network
 * config singleton into the Playwright runner, which throws before any
 * test is collected. And a literal path is the behaviour we want: if a
 * route is renamed, this manifest should report the old screen as
 * removed and the new one as added, not silently follow the rename and
 * claim nothing changed.
 */

import type { RecordedBackend } from "../fixtures/replay/recording";

export interface VisualViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface VisualTarget {
  /** Stable slug - it becomes the screenshot filename, so renaming one
   *  reads as "screen deleted + screen added" in the diff report. */
  readonly name: string;
  readonly path: string;
  /**
   * Boundaries this screen's content actually comes from.
   *
   * Asserted non-silent by `capture.ts`, and the only gate that can see a
   * boundary the app never reached at all - a stale URL, a moved port, an env
   * override. Nothing arrives, so no miss is logged and no error state
   * renders; the screen simply falls back to its "nothing to show" variant,
   * which is stable and diffs clean against itself forever.
   *
   * Kept per target rather than as one list because a total cannot see it:
   * with only the chain moved, the other boundaries still answer and the
   * overall count looks healthy while every contract read has gone nowhere.
   */
  readonly requires: readonly RecordedBackend[];
}

/** Desktop is the primary review size; mobile catches responsive-only
 *  regressions that a single width would hide. */
export const VISUAL_VIEWPORTS: readonly VisualViewport[] = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

/**
 * What every route screen reads before it has painted.
 *
 * Measured, not assumed: a capture run instrumented to print `backend.served`
 * per screen reports all four non-zero on all six routes at both viewports -
 * the app shell fetches the Aave config and the provider list (`graphql`),
 * polls protocol status (`vp-health`), reads the chain through Multicall3
 * (`eth-rpc`) and asks mempool for fees. `vp-rpc` is the one boundary no
 * route touches, so requiring it would fail every screen.
 *
 * Written per target below rather than shared, even though the six agree
 * today: a route that stops needing one of these should say so at its own
 * entry, and the gate that catches a boundary going silent is only as good
 * as the screen-level claim behind it.
 */
const APP_SHELL_BOUNDARIES: readonly RecordedBackend[] = [
  "eth-rpc",
  "graphql",
  "vp-health",
  "mempool",
];

export const VISUAL_TARGETS: readonly VisualTarget[] = [
  { name: "overview", path: "/", requires: APP_SHELL_BOUNDARIES },
  { name: "vaults", path: "/vaults", requires: APP_SHELL_BOUNDARIES },
  { name: "loans", path: "/loans", requires: APP_SHELL_BOUNDARIES },
  { name: "activity", path: "/activity", requires: APP_SHELL_BOUNDARIES },
  { name: "explore", path: "/explore", requires: APP_SHELL_BOUNDARIES },
  {
    name: "liquidations",
    path: "/liquidations",
    requires: APP_SHELL_BOUNDARIES,
  },
];

/**
 * The deposit flow's captured stops.
 *
 * Routes alone cannot reach these. The deposit form is a dialog opened from a
 * button, behind a connected wallet, and its split panel starts collapsed - so
 * every component under `components/simple/` was invisible to this check no
 * matter how many routes were added to the manifest above. They are listed as
 * data for the same reason the routes are: the report names them, and adding
 * a stop should not need Playwright knowledge.
 *
 * Ordered: one test walks them in sequence, because a connect and a modal
 * open cost far more than a screenshot and re-doing them per stop would
 * quadruple the capture for nothing.
 */
export const DEPOSIT_FLOW_STOPS = {
  /** Dashboard with a wallet connected - the empty state a new depositor sees. */
  connected: "deposit-connected",
  /** The deposit dialog as it opens, before anything is typed. */
  form: "deposit-form",
  /** An amount entered: borrow power, fee rows and the split minimum resolve. */
  amountEntered: "deposit-amount-entered",
  /** The split selector expanded, showing both options. */
  splitOptions: "deposit-split-options",
  /**
   * The form submitted: the progress view's pre-sign entry, fee-rate selector
   * open, nothing signed. The last stop the injected wallets can reach - the
   * next click asks them to sign, and they never do.
   */
  signEntry: "deposit-sign-entry",
} as const;

/**
 * The deposit progress view's captured stops.
 *
 * Everything past the pre-sign entry sits behind a signature or a wait the
 * capture cannot supply: the injected wallets never sign, and the recorded
 * depositor has no pending deposit to resume. So the stepper's mid-flow
 * states - and `SplitGroupedProgress`, the per-vault lanes of a two-vault
 * deposit - had no coverage at all, and a change that restacked those lanes
 * reported "no visual changes".
 *
 * These are reached through the god-mode demo gallery instead
 * (`src/dev/demoDeposit.ts`). Its deposits are built by the real state
 * machine, listed by the real pending rows and opened in the real stepper;
 * only the polling result behind each one is simulated. See
 * `depositProgress.visual.spec.ts` for the walk.
 */
export const DEPOSIT_PROGRESS_STOPS = {
  /** /vaults with pending deposits: the rows, their badges, bars and CTAs. */
  pending: "vaults-pending",
  /** The stepper for a two-vault batch whose lanes sit on different steps. */
  split: "deposit-progress-split",
} as const;

/**
 * The liquidations chart, charted from the god-mode cascade simulator over
 * the recorded price candles. The route capture above photographs
 * /liquidations disconnected - its "connect your wallet" state - and the
 * recorded depositor holds no position, so no wallet reaches the chart. See
 * `liquidationChart.visual.spec.ts`.
 */
export const LIQUIDATION_CHART_STOP = "liquidations-chart";

/**
 * How many steps the deposit flow has, in the stepper's own 1-based visual
 * numbering (`TOTAL_VISUAL_STEPS` in
 * `src/components/simple/DepositProgressView/steps.ts`). Written out for the
 * same reason the routes above are: importing app source pulls the network
 * config singleton into the runner. The gallery walk pins each seeded step
 * against the panel's own readout, so a flow that grows or shrinks fails the
 * walk loudly at the mismatch rather than photographing the wrong step.
 */
export const DEPOSIT_FLOW_STEP_COUNT = 15;

/** Every flow step, so the manifest and the walk enumerate the same set. */
export const DEPOSIT_FLOW_STEPS: readonly number[] = Array.from(
  { length: DEPOSIT_FLOW_STEP_COUNT },
  (_, index) => index + 1,
);

/**
 * The stop for one flow step of a single-vault deposit. Zero-padded so the
 * report lists the steps in order. Two steps photograph what the flow puts in
 * front of the stepper there rather than the stepper itself: step 13 opens
 * onto the activation gate (the stand-in that would render the stepper behind
 * it advances the demo on a timer, so it is not a stable frame), and step 15
 * - the activation submitted - already counts as activated, so the success
 * view replaces the stepper.
 */
export function depositProgressStepStop(step: number): string {
  return `deposit-progress-step-${String(step).padStart(2, "0")}`;
}

export function screenshotFileName(
  target: VisualTarget,
  viewport: VisualViewport,
): string {
  return `${target.name}--${viewport.name}.png`;
}

/** Same naming rule as {@link screenshotFileName}, for a flow stop. */
export function flowScreenshotFileName(
  stop: string,
  viewport: VisualViewport,
): string {
  return `${stop}--${viewport.name}.png`;
}
