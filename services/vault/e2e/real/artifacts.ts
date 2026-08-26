/**
 * Per-run artifacts: a gitignored, timestamped directory holding the run log, the network state we
 * operated against, and — on failure — a screenshot + DOM dump. This is what you inspect when a real
 * run fails (contract/back-end/mempool hiccup, or a vault UI redesign that moved a selector).
 *
 * Layout: services/vault/e2e/artifacts/<YYYY-MM-DD-HHmmss>-<action>/
 *   run.log       every logged step (also echoed to the console)
 *   network.json  resolved run config + network endpoints + derived addresses/balances
 *   error.png     screenshot at the moment of failure (only if the run throws)
 *   error.html    page DOM at the moment of failure (only if the run throws)
 */
import type { Page } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACTS_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
);

/** `2026-07-02-141530` — filesystem-safe local timestamp. */
function stamp(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

export interface Artifacts {
  dir: string;
  /** Append a line to run.log and echo it to the console. */
  log: (message: string) => void;
  /** Write `network.json` (resolved config + network state). */
  writeNetworkState: (state: unknown) => void;
  /** Capture screenshot + DOM into the dir (best-effort). Call on failure. */
  captureFailure: (page: Page | undefined, error: unknown) => Promise<void>;
}

export function createArtifacts(
  action: string,
  now: Date = new Date(),
): Artifacts {
  const dir = join(ARTIFACTS_ROOT, `${stamp(now)}-${action}`);
  mkdirSync(dir, { recursive: true });
  const logFile = join(dir, "run.log");

  const log = (message: string) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    // eslint-disable-next-line no-console
    console.log(line);
    appendFileSync(logFile, line + "\n");
  };

  return {
    dir,
    log,
    writeNetworkState: (state) =>
      writeFileSync(
        join(dir, "network.json"),
        JSON.stringify(state, null, 2) + "\n",
      ),
    captureFailure: async (page, error) => {
      appendFileSync(
        logFile,
        `\nFAILURE: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
      );
      if (!page || page.isClosed()) return;
      await page
        .screenshot({ path: join(dir, "error.png"), fullPage: true })
        .catch(() => {});
      const html = await page.content().catch(() => null);
      if (html) writeFileSync(join(dir, "error.html"), html);
    },
  };
}
