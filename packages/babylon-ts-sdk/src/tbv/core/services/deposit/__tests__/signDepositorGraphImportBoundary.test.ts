/**
 * `signDepositorGraph` must not read contract state.
 *
 * It derives `LocalChallengers` and asserts the VP-returned
 * `challenger_presign_data` set equals `local ∪ universal`. Under RFC-006 that
 * is only correct because every key it works with arrives already resolved at
 * the vault's frozen epochs, through the context object `prepareSigningContext`
 * builds. The module itself resolves nothing.
 *
 * Nothing in the type system says so. If someone needing "the VP's key" reached
 * for a registry read here — the natural move, and the reason #2206 renamed the
 * genesis getter — epoch resolution would silently revert for the challenger
 * set, and every other test in the suite would still pass. The failure would
 * surface as a payout signed against a challenger key the protocol does not
 * recognise, which `CLAUDE.md` lists as the asymmetric-failure case on this
 * path.
 *
 * So the invariant is asserted the only way it can be: over the import list.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const MODULE_PATH = path.resolve(__dirname, "../signDepositorGraph.ts");

/**
 * Import specifiers that would give this module contract access.
 *
 * `clients/` as a whole is deliberately not banned: the module legitimately
 * imports `clients/vault-provider/types`, which is the VP's wire format, not
 * chain state.
 */
const FORBIDDEN_SEGMENTS = ["clients/eth", "contracts/"];

/** Every `from "…"` specifier in the file, `import type` included. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("signDepositorGraph import boundary", () => {
  it("imports nothing that reads contract state", () => {
    const specifiers = importSpecifiers(readFileSync(MODULE_PATH, "utf-8"));

    const violations = specifiers.filter((specifier) =>
      FORBIDDEN_SEGMENTS.some((segment) => specifier.includes(segment)),
    );

    expect(violations).toEqual([]);
  });

  it("reads a non-empty import list, so the check above cannot pass vacuously", () => {
    const specifiers = importSpecifiers(readFileSync(MODULE_PATH, "utf-8"));

    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers).toContain("../../clients/vault-provider/types");
  });
});
