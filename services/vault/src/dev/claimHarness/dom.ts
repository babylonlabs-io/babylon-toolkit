/**
 * The few DOM touches the harness page needs. No framework: the page is a
 * column of buttons, status lines and a log.
 */

import type { HarnessStep, StepState } from "./harnessState";

const LOG_ID = "log";
const STEP_ID_PREFIX = "step-";
const STATUS_ID_PREFIX = "status-";

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(
      `claim harness: element #${id} is missing from claim-harness/index.html`,
    );
  }
  return element as T;
}

export function appendLog(text: string, kind?: "ok" | "err"): void {
  const line = document.createElement("div");
  if (kind) line.className = kind;
  line.textContent = `${new Date().toISOString().slice(11, 19)}  ${text}`;
  const log = byId<HTMLDivElement>(LOG_ID);
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

export function renderStep(step: HarnessStep, state: StepState): void {
  byId(`${STEP_ID_PREFIX}${step}`).dataset.status = state.status;
  byId(`${STATUS_ID_PREFIX}${step}`).textContent = state.detail;
}

/** Message plus cause chain, verbatim: the page never rewrites an error. */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [`${error.name}: ${error.message}`];
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    parts.push(`caused by ${cause.name}: ${cause.message}`);
    cause = cause.cause;
  }
  return parts.join("\n");
}
