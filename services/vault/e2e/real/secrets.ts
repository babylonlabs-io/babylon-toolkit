/**
 * Load the wallet mnemonic/password from the wallet-connector package's gitignored `.env.local`
 * (E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD). The secret lives with the wallet harness, not the vault
 * app. Parsed with a tiny KEY=VALUE reader so we add no dotenv dependency. Never logged.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONNECTOR_ENV_LOCAL = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "packages",
  "babylon-wallet-connector",
  ".env.local",
);

function parseEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Strip a trailing inline comment on unquoted values (standard .env convention). Requires a
      // space before the `#` so a `#` inside a value (e.g. a password) isn't treated as a comment.
      const commentIdx = value.indexOf(" #");
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }
    out[key] = value;
  }
  return out;
}

export interface WalletSecrets {
  mnemonic: string;
  password: string;
}

export function loadWalletSecrets(): WalletSecrets {
  // Env vars win if already set (CI); otherwise read the connector's .env.local.
  let mnemonic = process.env.E2E_WALLET_MNEMONIC ?? "";
  let password = process.env.E2E_WALLET_PASSWORD ?? "";
  if ((!mnemonic || !password) && existsSync(CONNECTOR_ENV_LOCAL)) {
    const env = parseEnv(readFileSync(CONNECTOR_ENV_LOCAL, "utf8"));
    mnemonic ||= env.E2E_WALLET_MNEMONIC ?? "";
    password ||= env.E2E_WALLET_PASSWORD ?? "";
  }
  if (!mnemonic || !password) {
    throw new Error(
      `Missing E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD. Set them in the environment or in ${CONNECTOR_ENV_LOCAL}.`,
    );
  }
  return { mnemonic, password };
}
