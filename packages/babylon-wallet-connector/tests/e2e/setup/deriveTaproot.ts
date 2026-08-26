/**
 * CLI: print the BIP86 taproot SIGNET address for the mnemonic in env (INSPECT_MNEMONIC, else
 * E2E_WALLET_MNEMONIC). Computed dynamically — no address is hardcoded. Prints only public data.
 *
 * Usage:  node --env-file=.env.local --import tsx tests/e2e/setup/deriveTaproot.ts
 */
import { deriveSignetTaproot, DEFAULT_TAPROOT_PATH } from "./taproot";

const MNEMONIC = (process.env.INSPECT_MNEMONIC || process.env.E2E_WALLET_MNEMONIC || "").trim();
if (!MNEMONIC) {
  console.error("No mnemonic set (INSPECT_MNEMONIC or E2E_WALLET_MNEMONIC).");
  process.exit(1);
}

console.log(`\nBIP86 signet taproot (${DEFAULT_TAPROOT_PATH}):`);
console.log(`  ${deriveSignetTaproot(MNEMONIC)}`);
