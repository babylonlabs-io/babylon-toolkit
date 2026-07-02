/**
 * Load the wallet mnemonic/password from the wallet-connector package's gitignored `.env.local`
 * (E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD). The secret lives with the wallet harness, not the vault
 * app. Parsed with Node's built-in `util.parseEnv` (no new dependency), which matches the dotenv
 * semantics the connector specs use on the SAME file — so both harnesses import identical values even
 * for edge cases (`export KEY=…`, inline `#`). Never logged.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

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
    mnemonic ||=
      typeof env.E2E_WALLET_MNEMONIC === "string"
        ? env.E2E_WALLET_MNEMONIC
        : "";
    password ||=
      typeof env.E2E_WALLET_PASSWORD === "string"
        ? env.E2E_WALLET_PASSWORD
        : "";
  }
  if (!mnemonic || !password) {
    throw new Error(
      `Missing E2E_WALLET_MNEMONIC / E2E_WALLET_PASSWORD. Set them in the environment or in ${CONNECTOR_ENV_LOCAL}.`,
    );
  }
  return { mnemonic, password };
}
