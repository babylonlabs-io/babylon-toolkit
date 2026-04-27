import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";
import { unsupportedDeriveContextHash } from "@/core/wallets/btc/unsupportedDeriveContextHash";

/**
 * The injectable adapter is a generic pass-through for arbitrary
 * `window.btcwallet` shapes. Older injected wallets won't have the
 * required `deriveContextHash` method; we add a typed
 * `WALLET_METHOD_NOT_SUPPORTED` stub instead of letting the call site
 * hit a raw `TypeError: deriveContextHash is not a function`.
 *
 * Implementation note: object spread (`{ ...wallet, ... }`) only copies
 * own enumerable properties, which strips methods that live on the
 * wallet's prototype chain — class instances exposing `signPsbt` /
 * `connectWallet` as prototype methods would silently lose them.
 * `Object.create(wallet)` preserves the entire prototype chain, so
 * inherited methods stay reachable on the returned object.
 */
const wrapInjectable = (wallet: IBTCProvider): IBTCProvider => {
  if (typeof wallet.deriveContextHash === "function") return wallet;
  const wrapped = Object.create(wallet) as IBTCProvider;
  wrapped.deriveContextHash = unsupportedDeriveContextHash("Injectable");
  return wrapped;
};

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "injectable",
  name: (wallet) => wallet.getWalletProviderName?.(),
  icon: (wallet) => wallet.getWalletProviderIcon?.(),
  docs: "",
  wallet: "btcwallet",
  createProvider: (wallet) => wrapInjectable(wallet),
  networks: [Network.MAINNET, Network.SIGNET],
  label: "Injectable",
};

export default metadata;
