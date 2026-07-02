import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { UnisatProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "unisat",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  iconBackground: "#000000",
  docs: "https://unisat.io/download",
  wallet: (context) => {
    // Prefer real UniSat's own `unisat_wallet` namespace, else `window.unisat`.
    // OneKey injects `window.unisat` (a ProviderBtc with `isOneKey === true`)
    // impersonating UniSat; skip any provider flagged `isOneKey` so the phantom
    // UniSat entry isn't treated as installed (OneKey is reachable via its own
    // `$onekey` entry), otherwise its getVersion() "1.4.10" fails our >= 1.7.14
    // UniSat version gate.
    const provider = context.unisat_wallet ?? context.unisat;
    return provider && !provider.isOneKey ? provider : undefined;
  },
  createProvider: (wallet, config) => new UnisatProvider(wallet, config),
  networks: [Network.MAINNET, Network.SIGNET],
};

export default metadata;
