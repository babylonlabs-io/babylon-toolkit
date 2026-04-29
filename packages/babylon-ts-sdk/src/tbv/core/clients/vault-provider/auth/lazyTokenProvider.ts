/**
 * {@link BearerTokenProvider} that defers wallet popup + on-chain
 * read until the first auth-gated method needs a token.
 *
 * @module tbv/core/clients/vault-provider/auth/lazyTokenProvider
 */

import type { BitcoinWallet } from "../../../../../shared/wallets";
import type { VaultRegistryReader } from "../../eth/types";
import {
  hexToUint8Array,
  uint8ArrayToHex,
} from "../../../primitives/utils/bitcoin";
import {
  deriveVaultRoot,
  expandAuthAnchor,
  parseFundingOutpointsFromTx,
} from "../../../vault-secrets";
import type { BearerTokenProvider, JsonRpcClient } from "../json-rpc-client";

import { AUTH_GATED_METHODS } from "./gatedMethods";
import { VpTokenProvider } from "./tokenProvider";
import { vpTokenRegistry } from "./tokenRegistry";

export interface LazyVpTokenProviderConfig {
  client: JsonRpcClient;
  peginTxid: string;
  unsignedPrePeginTxHex: string;
  depositorBtcPubkey: string;
  btcWallet: BitcoinWallet;
  vaultRegistryReader: VaultRegistryReader;
  vpAddress: `0x${string}`;
}

/**
 * On the first auth-gated call, derives the auth anchor (wallet
 * popup), reads the on-chain VP pubkey, registers a `VpTokenProvider`,
 * and delegates token acquisition to it. Subsequent calls hit the
 * resolved provider directly. Concurrent first-callers across sibling
 * lazy providers for the same `peginTxid` share a single popup via
 * the registry's in-flight slot.
 */
export class LazyVpTokenProvider implements BearerTokenProvider {
  private readonly config: LazyVpTokenProviderConfig;
  private resolvedPromise: Promise<VpTokenProvider> | null = null;

  constructor(config: LazyVpTokenProviderConfig) {
    this.config = config;
  }

  async getToken(method: string): Promise<string | null> {
    if (!AUTH_GATED_METHODS.has(method)) {
      return null;
    }
    const provider = await this.resolve();
    return provider.getToken(method);
  }

  invalidate(): void {
    if (this.resolvedPromise) {
      void this.resolvedPromise.then((p) => p.invalidate());
    }
  }

  private resolve(): Promise<VpTokenProvider> {
    if (this.resolvedPromise) return this.resolvedPromise;

    const cachedOrPending = vpTokenRegistry.peekOrPending(
      this.config.peginTxid,
    );
    if (cachedOrPending) {
      // Wrap in the same retry-on-rejection cleanup as the derive
      // branch. Without this, a sibling provider that joined an
      // in-flight derivation would permanently cache the rejected
      // promise and never retry — even after the registry's in-flight
      // slot has cleared.
      this.resolvedPromise = Promise.resolve(cachedOrPending).catch((err) => {
        this.resolvedPromise = null;
        throw err;
      });
      return this.resolvedPromise;
    }

    const derivePromise = this.deriveAndRegister();
    vpTokenRegistry.registerInFlight(this.config.peginTxid, derivePromise);
    this.resolvedPromise = derivePromise.catch((err) => {
      this.resolvedPromise = null;
      throw err;
    });
    return this.resolvedPromise;
  }

  private async deriveAndRegister(): Promise<VpTokenProvider> {
    const fundingOutpoints = parseFundingOutpointsFromTx(
      this.config.unsignedPrePeginTxHex,
    );

    let root: Uint8Array | null = null;
    let authAnchorHex: string;
    try {
      root = await deriveVaultRoot(this.config.btcWallet, {
        depositorBtcPubkey: hexToUint8Array(this.config.depositorBtcPubkey),
        fundingOutpoints,
      });
      const authAnchorBytes = expandAuthAnchor(root);
      try {
        authAnchorHex = uint8ArrayToHex(authAnchorBytes);
      } finally {
        authAnchorBytes.fill(0);
      }
    } finally {
      root?.fill(0);
    }

    const pinnedServerPubkey =
      await this.config.vaultRegistryReader.getVaultProviderBtcPubKey(
        this.config.vpAddress,
      );

    return vpTokenRegistry.getOrCreate({
      client: this.config.client,
      peginTxid: this.config.peginTxid,
      authAnchorHex,
      pinnedServerPubkey,
    });
  }
}
