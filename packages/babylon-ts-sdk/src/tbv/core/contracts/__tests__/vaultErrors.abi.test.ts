import {
  type AbiParameter,
  decodeErrorResult,
  type Hex,
  toFunctionSelector,
} from "viem";
import { describe, expect, it } from "vitest";

import { VAULT_ERROR_ABI } from "../abis/VaultErrors.abi";
import manifest from "../abis/vaultErrors.manifest.json";

const canonicalType = (param: AbiParameter): string =>
  param.type.startsWith("tuple") && "components" in param
    ? `(${param.components.map(canonicalType).join(",")})${param.type.slice("tuple".length)}`
    : param.type;

describe("VAULT_ERROR_ABI", () => {
  it("is exactly the manifest's errors, in manifest order", () => {
    expect(VAULT_ERROR_ABI).toEqual(manifest.errors.map((entry) => entry.abi));
  });

  it("carries every manifest error exactly once", () => {
    const selectors = manifest.errors.map((entry) => entry.selector);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it("records each error's selector as the hash of its own signature", () => {
    for (const entry of manifest.errors) {
      const inputs = entry.abi.inputs as AbiParameter[];
      const signature = `${entry.abi.name}(${inputs.map(canonicalType).join(",")})`;
      expect(signature).toBe(entry.signature);
      expect(toFunctionSelector(signature)).toBe(entry.selector);
    }
  });

  it("decodes every argument-free error back to its own name", () => {
    for (const entry of manifest.errors) {
      if (entry.abi.inputs.length > 0) continue;
      const decoded = decodeErrorResult({
        abi: VAULT_ERROR_ABI,
        data: entry.selector as Hex,
      });
      expect(decoded.errorName).toBe(entry.abi.name);
    }
  });

  it("tags every error with at least one contract revision the manifest lists", () => {
    const revisions = new Set(manifest.revisions.map((r) => r.rev));
    for (const entry of manifest.errors) {
      expect(entry.revisions.length).toBeGreaterThan(0);
      for (const rev of entry.revisions) expect(revisions.has(rev)).toBe(true);
    }
  });
});
