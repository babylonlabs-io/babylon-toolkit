import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { runtimeClosure, SOURCE_ROOT } from "@/test/importGraph";

const BANNED_RUNTIME_IMPORTS = new Set([
  "@babylonlabs-io/ts-sdk/tbv/core",
  "@babylonlabs-io/ts-sdk/tbv/core/clients",
  "@babylonlabs-io/ts-sdk/tbv/core/utils",
  "@babylonlabs-io/babylon-tbv-rust-wasm",
  "bitcoinjs-lib",
  "@bitcoin-js/tiny-secp256k1-asmjs",
]);

describe("ETH-session import boundaries", () => {
  const entries = [
    resolve(SOURCE_ROOT, "main.tsx"),
    resolve(SOURCE_ROOT, "context/deposit/PeginPollingContext.tsx"),
    resolve(SOURCE_ROOT, "hooks/usePegoutPolling.ts"),
    resolve(SOURCE_ROOT, "services/activity/claimTxResolver.ts"),
    resolve(SOURCE_ROOT, "applications/aave/hooks/useAaveVaults.ts"),
    resolve(SOURCE_ROOT, "applications/aave/utils/payoutAddresses.ts"),
    // Between them these two cover the display-only hex helpers that used to
    // reach for the SDK barrel: `utils/explorer.ts` (both), `ActivityHashLink`
    // (Activity) and `CopyableHash` (VaultsLifecycleSections).
    resolve(SOURCE_ROOT, "components/pages/Activity.tsx"),
    resolve(SOURCE_ROOT, "components/vaults/VaultsLifecycleSections.tsx"),
  ];

  for (const entry of entries) {
    it(`${relative(SOURCE_ROOT, entry)} avoids broad BTC/auth runtime barrels`, () => {
      const violations = Array.from(
        runtimeClosure(entry),
        ([file, specifiers]) =>
          Array.from(specifiers)
            .filter((specifier) => BANNED_RUNTIME_IMPORTS.has(specifier))
            .map(
              (specifier) => `${relative(SOURCE_ROOT, file)} -> ${specifier}`,
            ),
      ).flat();

      expect(violations).toEqual([]);
    });
  }
});
