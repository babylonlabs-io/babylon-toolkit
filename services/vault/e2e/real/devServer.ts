/**
 * Localhost dev-server handling (auto: reuse or spawn).
 *
 * If the vault dev server is already serving on its port, reuse it. Otherwise spawn `pnpm dev`
 * (devnet) / `pnpm dev:testnet` (testnet) from the vault dir, wait until it answers HTTP, and return a
 * disposer that tears down the spawned process group. Used only for the `localhost` target — the
 * `website` target skips this entirely.
 */
import { spawn, type ChildProcess } from "node:child_process";
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
  /** True when we reused a server already listening on the port — its network is NOT verified. */
  reused: boolean;
  dispose: () => Promise<void>;
}

async function isUp(baseUrl: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl, { signal: ctrl.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Terminate the spawned dev server's whole process group (falls back to the child alone). */
function killGroup(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export async function ensureDevServer(
  network: NetworkName,
  log: (m: string) => void,
): Promise<DevServerHandle> {
  const baseUrl = `http://localhost:${DEV_PORT}`;

  if (await isUp(baseUrl)) {
    // We can only tell that *something* is serving on the port, not which network it is — so warn
    // loudly and record `reused` (run.ts writes it to network.json) rather than reporting a network
    // we never actually exercised.
    log(
      `⚠️  Reusing dev server already on ${baseUrl} — cannot confirm it is serving "${network}". ` +
        `Ensure it matches, or kill port ${DEV_PORT} and re-run.`,
    );
    return { baseUrl, reused: true, dispose: async () => {} };
  }

  const script = NETWORKS[network].devScript ?? "dev";
  log(`Starting vault dev server: pnpm run ${script} (cwd ${VAULT_DIR})`);
  const child = spawn("pnpm", ["run", script], {
    cwd: VAULT_DIR,
    detached: true,
    stdio: "ignore",
  });
  // `spawn pnpm ENOENT` (bad PATH / minimal shell) surfaces as an async 'error' event; without a
  // listener it would crash the process and bypass runE2E's catch/finally (no artifacts, no cleanup).
  let spawnError: Error | undefined;
  child.on("error", (e) => {
    spawnError = e instanceof Error ? e : new Error(String(e));
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (spawnError)
      throw new Error(
        `Failed to start vault dev server: ${spawnError.message}`,
      );
    if (await isUp(baseUrl)) {
      log(`Dev server ready at ${baseUrl}`);
      return { baseUrl, reused: false, dispose: async () => killGroup(child) };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  killGroup(child);
  throw new Error(
    `Vault dev server did not become ready at ${baseUrl} within ${READY_TIMEOUT_MS}ms`,
  );
}
