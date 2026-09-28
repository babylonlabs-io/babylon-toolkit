// Reads services/vault/.env, then .env.local over it (Vite's precedence), so
// the dev-claim scripts use the same network config as the dev server.
//
// Dev-only tooling for the delegated-claim devnet run; never shipped.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadVaultEnv() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    let text;
    try {
      text = readFileSync(join(VAULT_DIR, file), "utf8");
    } catch {
      continue; // either file may be absent
    }
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return (name) => {
    const value = env[name];
    if (!value) throw new Error(`${name} missing from services/vault/.env and .env.local`);
    return value;
  };
}
