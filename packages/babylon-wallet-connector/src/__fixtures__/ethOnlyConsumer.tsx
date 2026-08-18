import {
  ERROR_CODES,
  WalletError,
  WalletProvider,
  createWalletConfig,
  useWalletConnect,
  type ChainId,
  type ETHConfig,
  type IWallet,
  type TermsOfServiceParams,
  type WalletProviderProps,
} from "@/eth";

/**
 * Typecheck fixture, not a runtime module. It stands in for an Ethereum-only
 * consumer of the `./eth` entry point and exists so `tsc -p tsconfig.lib.json`
 * fails if that entry stops covering what such an app needs — a missing export,
 * a renamed symbol, or a type that no longer describes an Ethereum-only host.
 *
 * Excluded from the declaration build and unreachable from either bundle entry,
 * so it is not part of the published package.
 */

const ethConfig: ETHConfig = {
  chainId: 11155111,
  chainName: "Sepolia",
  rpcUrl: "https://rpc.sepolia.org",
  explorerUrl: "https://sepolia.etherscan.io",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

const requiredChains: readonly Extract<ChainId, "ETH">[] = ["ETH"];

async function acceptTerms({ chain, connections }: TermsOfServiceParams): Promise<void> {
  const ethConnection = connections.find((connection) => connection.chain === chain);
  const wallet: IWallet | undefined = ethConnection?.wallet;

  if (!wallet) {
    throw new WalletError({ code: ERROR_CODES.WALLET_NOT_CONNECTED, message: "No Ethereum wallet connected" });
  }
}

function Header() {
  const { connected, open, disconnect } = useWalletConnect();

  return (
    <button onClick={() => (connected ? void disconnect("ETH") : open("ETH"))}>
      {connected ? "Disconnect" : "Connect"}
    </button>
  );
}

const providerProps: Omit<WalletProviderProps, "config"> = {
  persistent: true,
  requiredChains,
  lifecycleHooks: { acceptTermsOfService: acceptTerms },
};

export function EthOnlyApp() {
  return (
    <WalletProvider {...providerProps} config={createWalletConfig({ networkConfigs: { ETH: ethConfig } })}>
      <Header />
    </WalletProvider>
  );
}
