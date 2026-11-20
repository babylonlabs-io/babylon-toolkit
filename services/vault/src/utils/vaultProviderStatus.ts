import { COPY } from "@/copy";

import type { VaultProvider } from "../types/vaultProvider";

/**
 * Returns a user-facing tooltip when the provider should be shown as
 * unavailable in the picker, or `undefined` when the provider is fine.
 *
 * Every rejected `metadataStatus` (the indexer's static rpcUrl validation)
 * shows the same tooltip: the raw `metadataRejectionReason` is
 * engineer-oriented (e.g. `host is a private/loopback/link-local IP:
 * 10.0.0.1`), and the depositor's only action is to pick another provider.
 */
export function vaultProviderUnavailableReason(
  provider: Pick<VaultProvider, "metadataStatus">,
): string | undefined {
  if (provider.metadataStatus === "ok") return undefined;
  return COPY.deposit.form.providerUnavailableReason;
}
