/**
 * `signDepositorGraph` must not read contract state: its challenger-set
 * assertion is only correct under RFC-006 because every key arrives already
 * resolved at the vault's frozen epochs. A registry read added here would
 * silently revert that, with the rest of the suite still green.
 *
 * Structural rather than behavioural, deliberately — the absence of a read has
 * no observable output to assert on. The behavioural half is the rotated-VP
 * fixture in vault's `vaultPayoutSignatureService.payoutScripts.test.ts`.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const MODULE_PATH = path.resolve(__dirname, "../signDepositorGraph.ts");

/**
 * Not all of `clients/`: the module legitimately imports
 * `clients/vault-provider/types`, which is wire format, not chain state.
 */
const CONTRACT_STATE_SEGMENTS = ["clients/eth", "contracts/"];

/**
 * Static, type-only, bare, dynamic and `require` forms. Matching only
 * `from "…"` would leave `await import("…")` as an unwatched route in — the
 * obvious one, for dodging a circular dependency.
 */
const MODULE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** The specifiers in `source` that would give the module contract access. */
function contractStateImports(source: string): string[] {
  return [...source.matchAll(MODULE_SPECIFIER)]
    .map((match) => match[1])
    .filter((specifier) =>
      CONTRACT_STATE_SEGMENTS.some((segment) => specifier.includes(segment)),
    );
}

describe("signDepositorGraph import boundary", () => {
  it("imports nothing that reads contract state", () => {
    expect(contractStateImports(readFileSync(MODULE_PATH, "utf-8"))).toEqual(
      [],
    );
  });

  it("detects a contract import written as a static, type-only, dynamic or required form", () => {
    // Guards the test above against passing vacuously: a broken pattern would
    // report a clean file no matter what it contained. Asserted against a
    // sample rather than the real import list, so moving a file the module
    // legitimately imports cannot fail this.
    const sample = [
      `import { ViemVaultRegistryReader } from "../../clients/eth/vault-registry-reader";`,
      `import type { KeyEpochs } from "../../clients/eth/types";`,
      `const { BTCVaultRegistryABI } = await import("../../contracts/abis/BTCVaultRegistry.abi");`,
      `const legacy = require("../../contracts/abis/ApplicationRegistry.abi");`,
      `import { Transaction } from "bitcoinjs-lib";`,
      `import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";`,
    ].join("\n");

    expect(contractStateImports(sample)).toEqual([
      "../../clients/eth/vault-registry-reader",
      "../../clients/eth/types",
      "../../contracts/abis/BTCVaultRegistry.abi",
      "../../contracts/abis/ApplicationRegistry.abi",
    ]);
  });
});
