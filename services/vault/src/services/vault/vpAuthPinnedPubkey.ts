/**
 * The BTC key a vault provider's server identity is pinned to for RPC auth.
 *
 * The VP issues BIP-322-signed tokens from its **operation** key, so once
 * RFC-006 rotation is live the pin has to follow that key rather than the
 * fixed registration key. This is deliberately the *current* key, not any
 * vault's frozen epoch: it is a per-operator server identity, not a per-vault
 * binding (RFC-006 open question 5).
 *
 * Consequence worth knowing: `VpTokenRegistry` binds a `peginTxid` to one
 * pinned pubkey and refuses to rebind. A VP that rotates mid-session
 * invalidates its outstanding tokens, which surfaces as an auth failure the
 * user resolves by retrying — the flow re-reads the key on the next cold path.
 * That is the intended behaviour: accepting either key would hollow out the
 * pin, which exists precisely so a substituted server key cannot be used.
 *
 * The pin alone does not stop a wrong provider. The key is read for the
 * address the caller gives, and the auth anchor goes to the endpoint named by
 * that same address. So the address must first match the vault's on-chain
 * provider, or the anchor goes to a party that can mint depositor tokens.
 *
 * Centralised here because all three auth-priming call sites must agree; a
 * site left on the registration key would break auth for every vault of a
 * rotated provider, including already-active ones.
 */

import type { OnChainBtcPubkey } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type Address, type Hex, isAddressEqual } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { COPY } from "@/copy";

/**
 * Resolve the pubkey to pin a VP's auth session to.
 *
 * Throws when `vpAddress` is not the on-chain provider of `vaultId`. Call it
 * before the auth anchor can leave the browser.
 *
 * Before the first rotation on a network the two key reads return the same
 * bytes, so the key choice is a no-op until an operator rotates.
 */
export async function resolveVpAuthPinnedPubkey(
  vaultId: Hex,
  vpAddress: Address,
): Promise<OnChainBtcPubkey> {
  const reader = getVaultRegistryReader();
  const { vaultProvider } = await reader.getVaultBasicInfo(vaultId);
  if (!isAddressEqual(vaultProvider, vpAddress)) {
    throw new Error(
      COPY.deposit.errors.vaultProviderMismatch(
        vaultId,
        vpAddress,
        vaultProvider,
      ),
    );
  }
  return reader.getCurrentVaultProviderOperationBtcKey(vpAddress);
}
