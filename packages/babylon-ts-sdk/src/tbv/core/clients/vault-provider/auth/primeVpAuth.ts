/**
 * Pre-populate {@link vpTokenRegistry} when the caller already
 * derived `authAnchorHex`. No wallet popup; only an on-chain read.
 *
 * @module tbv/core/clients/vault-provider/auth/primeVpAuth
 */

import type { OnChainBtcPubkey, VaultRegistryReader } from "../../eth/types";
import { JsonRpcClient } from "../json-rpc-client";

import { vpTokenRegistry } from "./tokenRegistry";

const TOKEN_RPC_TIMEOUT_MS = 60_000;

interface PrimeVpAuthInputBase {
  baseUrl: string;
  peginTxid: string;
  authAnchorHex: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
  retryableFor?: (method: string) => boolean;
}

/** Reader-mode: SDK fetches the on-chain pubkey itself. */
interface PrimeVpAuthInputWithReader extends PrimeVpAuthInputBase {
  vpAddress: `0x${string}`;
  vaultRegistryReader: VaultRegistryReader;
  pinnedServerPubkey?: never;
}

/**
 * Pre-fetched mode: caller already read the pubkey via the reader
 * (e.g. batch deposits sharing one VP can hoist the read out of a
 * `Promise.all`). The brand ensures the value still came from a
 * legitimate on-chain source.
 */
interface PrimeVpAuthInputWithPubkey extends PrimeVpAuthInputBase {
  pinnedServerPubkey: OnChainBtcPubkey;
  vpAddress?: never;
  vaultRegistryReader?: never;
}

export type PrimeVpAuthInput =
  | PrimeVpAuthInputWithReader
  | PrimeVpAuthInputWithPubkey;

/**
 * Pre-populate the registry with a `VpTokenProvider` for `peginTxid`
 * using an already-derived `authAnchorHex`. Use this when the caller
 * has just run `deriveVaultRoot` for another reason (e.g. WOTS) so
 * the lazy provider's first gated call doesn't trigger a second
 * wallet popup. Performs only an on-chain pubkey read (or none, if
 * `pinnedServerPubkey` is supplied); no popup.
 */
export async function primeVpTokenRegistry(
  input: PrimeVpAuthInput,
): Promise<void> {
  const pinnedServerPubkey =
    input.pinnedServerPubkey ??
    (await input.vaultRegistryReader.getVaultProviderBtcPubKey(
      input.vpAddress,
    ));
  const innerClient = new JsonRpcClient({
    baseUrl: input.baseUrl,
    timeout: input.timeoutMs ?? TOKEN_RPC_TIMEOUT_MS,
    headers: input.headers,
    retries: input.retries,
    retryDelay: input.retryDelay,
    retryableFor: input.retryableFor,
  });
  vpTokenRegistry.getOrCreate({
    client: innerClient,
    peginTxid: input.peginTxid,
    authAnchorHex: input.authAnchorHex,
    pinnedServerPubkey,
  });
}
