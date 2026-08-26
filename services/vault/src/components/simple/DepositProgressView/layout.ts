/**
 * Shared layout constants for the deposit progress surfaces. Kept separate from
 * steps.ts (which evaluates buildStepItems at module load and needs the full
 * COPY tree) so a component can pin its width without pulling that in.
 */

/**
 * Shared max-width for the deposit progress surfaces. The live stepper
 * (DepositProgressView) and the activated success screen use this so the card
 * stays the same width across the flow. 612px card = 564px content + 24px
 * padding either side, so the stepper content lines up with the deposit form.
 */
export const DEPOSIT_VIEW_MAX_WIDTH_CLASS = "max-w-[612px]";
