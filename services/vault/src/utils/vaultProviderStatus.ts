import type {
  VaultProvider,
  VaultProviderMetadataStatus,
} from "../types/vaultProvider";

/**
 * User-facing tooltip text for a provider whose registered rpcUrl
 * was rejected by the indexer's static validation.
 *
 * The raw `metadataRejectionReason` from the indexer is engineer-oriented
 * (e.g. `host is a private/loopback/link-local IP: 10.0.0.1`); the picker
 * shows the message below to the user instead.
 */
const REASON_BY_STATUS: Record<
  Exclude<VaultProviderMetadataStatus, "ok">,
  string
> = {
  missing: "This provider has no RPC URL configured.",
  invalid_url: "This provider's RPC URL is not a valid URL.",
  unsupported_scheme:
    "This provider's RPC URL uses an unsupported scheme (only http/https are accepted).",
  private_host:
    "This provider's RPC URL points to a private or internal address that the proxy will reject.",
  ipv6_literal_unsupported:
    "This provider's RPC URL uses an IPv6 literal host that the proxy does not support.",
};

/**
 * Returns a user-facing tooltip when the provider should be shown as
 * unavailable in the picker, or `undefined` when the provider is fine.
 */
export function vaultProviderUnavailableReason(
  provider: Pick<VaultProvider, "metadataStatus">,
): string | undefined {
  if (provider.metadataStatus === "ok") return undefined;
  return REASON_BY_STATUS[provider.metadataStatus];
}
