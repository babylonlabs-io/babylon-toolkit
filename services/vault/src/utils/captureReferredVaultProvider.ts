import { parseVaultProviderParam, VAULT_PROVIDER_QUERY_KEY } from "@/routes";
import { setReferredVaultProvider } from "@/storage/referredVaultProviderStorage";

/**
 * Read a vault provider link's `?vp=` and store the provider it names.
 *
 * Call once at startup, before the first render: a redirect in the router
 * would drop the query. The parameter is then removed from the address bar,
 * other parameters kept, so storage holds the only copy: a reload must not
 * bring back a referral that a deposit with another provider has since
 * cleared. A value that is not an address is removed too, and leaves any
 * stored referral as it was.
 */
export function captureReferredVaultProvider(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(VAULT_PROVIDER_QUERY_KEY)) return;

  const address = parseVaultProviderParam(
    url.searchParams.get(VAULT_PROVIDER_QUERY_KEY),
  );
  if (address !== null) setReferredVaultProvider(address);

  url.searchParams.delete(VAULT_PROVIDER_QUERY_KEY);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
