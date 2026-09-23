/**
 * Wallet acquisition for the harness: the wallet-connector providers,
 * instantiated the way their adapters do it, outside the React
 * `WalletProvider`. No hand-rolled `window.unisat` shim: the provider owns
 * the version gate, the chain switch and the sign-option mapping.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  LedgerVaultProvider,
  UnisatProvider,
} from "@babylonlabs-io/wallet-connector";

import { getBTCNetwork, getNetworkConfigBTC } from "@/config";

export type HarnessWalletKind = "unisat" | "ledger";

export interface ConnectedWallet {
  kind: HarnessWalletKind;
  wallet: BitcoinWallet;
  address: string;
  publicKeyHex: string;
}

/** The subset of the injected object the adapter's probe reads. */
interface InjectedUnisatProbe {
  isOneKey?: boolean;
}

/**
 * Mirrors the adapter's probe (wallet-connector `unisat/index.ts:18-19`):
 * prefer UniSat's own `unisat_wallet` namespace, then `window.unisat`, and
 * skip a OneKey impersonation flagged `isOneKey`.
 */
function injectedUnisat(): unknown {
  const injected = window as unknown as {
    unisat_wallet?: InjectedUnisatProbe;
    unisat?: InjectedUnisatProbe;
  };
  const provider = injected.unisat_wallet ?? injected.unisat;
  if (!provider || provider.isOneKey) {
    throw new Error(
      "UniSat extension not found (or the injected provider is OneKey). Install UniSat >= 1.7.14 and reload.",
    );
  }
  return provider;
}

/**
 * Connects from a click handler: UniSat opens its approval popup, the Ledger
 * provider opens the WebHID picker (Chromium, secure context, user gesture).
 */
export async function connectHarnessWallet(
  kind: HarnessWalletKind,
): Promise<ConnectedWallet> {
  const provider =
    kind === "unisat"
      ? new UnisatProvider(injectedUnisat(), getNetworkConfigBTC())
      : new LedgerVaultProvider(getBTCNetwork());
  await provider.connectWallet();
  // IBTCProvider carries every BitcoinWallet method (see the plan's interface
  // table); the assignment is structural.
  const wallet: BitcoinWallet = provider;
  return {
    kind,
    wallet,
    address: await wallet.getAddress(),
    publicKeyHex: await wallet.getPublicKeyHex(),
  };
}
