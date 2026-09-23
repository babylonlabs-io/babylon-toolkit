/**
 * Step state for the delegated-claim harness page.
 *
 * Pure: the page's button handlers dispatch here and render from the result.
 * Order is the protocol's: nothing signs before the graph is bound, nothing
 * broadcasts before the file verifies. Kept out of browser storage on purpose
 * — a new tab starts from the vault id again.
 */

export const HARNESS_STEPS = [
  "connect",
  "context",
  "artifacts",
  "wots",
  "plan",
  "sign",
  "assemble",
  "claim",
  "proof",
  "assert",
  "payout",
] as const;

export type HarnessStep = (typeof HARNESS_STEPS)[number];
export type StepStatus = "idle" | "running" | "done" | "error";

export interface StepState {
  readonly status: StepStatus;
  readonly detail: string;
}

export type HarnessState = Readonly<Record<HarnessStep, StepState>>;

export type HarnessAction =
  | { type: "start"; step: HarnessStep }
  | { type: "done"; step: HarnessStep; detail: string }
  | { type: "fail"; step: HarnessStep; detail: string }
  /** Marks every step after `step` idle again; `step` itself is kept. */
  | { type: "invalidateAfter"; step: HarnessStep };

const IDLE: StepState = { status: "idle", detail: "" };

export function initialHarnessState(): HarnessState {
  return Object.fromEntries(
    HARNESS_STEPS.map((step) => [step, IDLE]),
  ) as Record<HarnessStep, StepState>;
}

export function reduceHarness(
  state: HarnessState,
  action: HarnessAction,
): HarnessState {
  switch (action.type) {
    case "start":
      return { ...state, [action.step]: { status: "running", detail: "" } };
    case "done":
      return {
        ...state,
        [action.step]: { status: "done", detail: action.detail },
      };
    case "fail":
      return {
        ...state,
        [action.step]: { status: "error", detail: action.detail },
      };
    case "invalidateAfter": {
      const from = HARNESS_STEPS.indexOf(action.step) + 1;
      const reset = Object.fromEntries(
        HARNESS_STEPS.slice(from).map((step) => [step, IDLE]),
      );
      return { ...state, ...reset };
    }
  }
}

/** A step may run when every step before it is done; a step never blocks on itself. */
export function canRun(state: HarnessState, step: HarnessStep): boolean {
  const index = HARNESS_STEPS.indexOf(step);
  return HARNESS_STEPS.slice(0, index).every(
    (earlier) => state[earlier].status === "done",
  );
}

/**
 * Which in-memory session values each step produces. A step that re-runs
 * drops its own values and every later step's, so nothing from a previous
 * wallet or vault stays saveable or broadcastable. The device terms are
 * filed under `context`: a wallet or vault change clears them, a plan
 * rebuild does not.
 */
export const SESSION_FIELDS_BY_STEP = {
  connect: ["wallet"],
  context: ["chain", "depositTerms"],
  artifacts: ["source"],
  wots: ["wotsKeypairJson"],
  plan: ["plan", "partialSignatures"],
  sign: ["signatures"],
  assemble: ["artifactsJson"],
  claim: ["claimTxHex"],
  proof: ["pinnedArtifactsJson"],
  assert: [
    "assertedArtifactsJson",
    "assertTxHex",
    "assertedArtifactsSaved",
    "wronglyChallengedTxHex",
  ],
  payout: ["payoutTxHex"],
} as const satisfies Record<HarnessStep, readonly string[]>;

/** Deletes the values of `step` and of every step after it; the caller then stores the step's new result. */
export function clearSessionFrom(session: object, step: HarnessStep): void {
  for (const later of HARNESS_STEPS.slice(HARNESS_STEPS.indexOf(step))) {
    for (const key of SESSION_FIELDS_BY_STEP[later])
      Reflect.deleteProperty(session, key);
  }
}
