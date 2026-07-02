/**
 * Localhost dev-server handling (auto: reuse or spawn).
 *
 * If the vault dev server is already serving on its port, reuse it. Otherwise spawn `pnpm dev`
 * (devnet) / `pnpm dev:testnet` (testnet) from the vault dir, wait until it answers HTTP, and return a
 * disposer that tears down the spawned process group. Used only for the `localhost` target — the
 * `website` target skips this entirely.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NETWORKS, type NetworkName } from "./config";

const VAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEV_PORT = Number(process.env.VAULT_DEV_PORT ?? 5173);
const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1000;
const PROBE_TIMEOUT_MS = 2000; // per-attempt abort when probing whether the dev server is already up

export interface DevServerHandle {
  baseUrl: string;
  dispose: () => Promise<void>;
}

async function isUp(baseUrl: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl, { signal: ctrl.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function ensureDevServer(network: NetworkName, log: (m: string) => void): Promise<DevServerHandle> {
  const baseUrl = `http://localhost:${DEV_PORT}`;

  if (await isUp(baseUrl)) {
    log(`Reusing dev server already running at ${baseUrl}`);
    return { baseUrl, dispose: async () => {} };
  }

  const script = NETWORKS[network].viteMode ? "dev:testnet" : "dev";
  log(`Starting vault dev server: pnpm run ${script} (cwd ${VAULT_DIR})`);
  const child = spawn("pnpm", ["run", script], { cwd: VAULT_DIR, detached: true, stdio: "ignore" });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(baseUrl)) {
      log(`Dev server ready at ${baseUrl}`);
      return {
        baseUrl,
        dispose: async () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGTERM"); // kill the whole process group
            } catch {
              child.kill("SIGTERM");
            }
          }
        },
      };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  throw new Error(`Vault dev server did not become ready at ${baseUrl} within ${READY_TIMEOUT_MS}ms`);
}
