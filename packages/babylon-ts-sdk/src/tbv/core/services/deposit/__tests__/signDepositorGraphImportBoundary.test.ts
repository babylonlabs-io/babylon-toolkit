/**
 * `signDepositorGraph` must not read contract state.
 *
 * It derives `LocalChallengers` and asserts the VP-returned
 * `challenger_presign_data` set equals `local ∪ universal`. Under RFC-006 that
 * is only correct because every key it works with arrives already resolved at
 * the vault's frozen epochs, through the context object `prepareSigningContext`
 * builds. The module itself resolves nothing, and nor does any module it
 * imports directly.
 *
 * Nothing in the type system says so. If someone needing "the VP's key" reached
 * for a registry read here — the natural move, and the reason #2206 renamed the
 * genesis getter — epoch resolution would silently revert for the challenger
 * set, and every other test in the suite would still pass. The failure would
 * surface as a payout signed against a challenger key the protocol does not
 * recognise, which `CLAUDE.md` lists as the asymmetric-failure case on this
 * path.
 *
 * This is a structural assertion rather than a behavioural one, deliberately.
 * The behavioural half of the same guard lives in
 * `services/vault/src/services/vault/__tests__/vaultPayoutSignatureService.payoutScripts.test.ts`,
 * whose fixture rotates the VP so that resolving the registration key instead of
 * the operation key fails a real assertion about a real return value. What that
 * test cannot express is the *absence* of a read in a module that has no
 * observable output tied to it — so this one asserts over the import graph, and
 * is the only test here allowed to do that.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const MODULE_PATH = path.resolve(__dirname, "../signDepositorGraph.ts");

/**
 * Path segments that mean contract access.
 *
 * `clients/` as a whole is deliberately not banned: the module legitimately
 * imports `clients/vault-provider/types`, which is the VP's wire format rather
 * than chain state.
 */
const CONTRACT_STATE_SEGMENTS = ["clients/eth", "contracts/"];

/**
 * Every module specifier the file pulls in, in any form.
 *
 * Matching only `from "…"` would leave `await import("…")` and `require("…")` as
 * unwatched ways to reach the same registries — a plausible route in, since a
 * dynamic import is exactly what someone would reach for to dodge a circular
 * dependency.
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
