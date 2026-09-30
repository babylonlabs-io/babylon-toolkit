/**
 * Every custom error the vault contracts declare, across every contract
 * revision still deployed plus `main`, including errors that bubble up from
 * linked libraries, Aave v4 and OpenZeppelin.
 *
 * Generated: `node scripts/generate-vault-error-manifest.mjs <vault-contracts-aave-v4>`
 * writes `vaultErrors.abi.json` (this ABI) and `vaultErrors.manifest.json`
 * (the same errors with selectors and revision tags); never edit either by
 * hand. Use this as a decode fallback, after the call's own ABI.
 *
 * @module contracts/abis/VaultErrors
 */
import type { Abi } from "viem";

import vaultErrorAbi from "./vaultErrors.abi.json";

export const VAULT_ERROR_ABI = vaultErrorAbi as Abi;
