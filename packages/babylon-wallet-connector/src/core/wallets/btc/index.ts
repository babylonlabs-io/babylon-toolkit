import type { BTCConfig, ChainMetadata, IBTCProvider } from "@/core/types";

import appkit from "./appkit";
import icon from "./icon.svg";
import injectable from "./injectable";
import keystone from "./keystone";
import ledger from "./ledger";
import ledgerV2 from "./ledger-v2";
import okx from "./okx";
import onekey from "./onekey";
import unisat from "./unisat";

// Export both ledger versions for consumers to choose via feature flags
export { ledger as ledgerV1, ledgerV2 };

const metadata: ChainMetadata<"BTC", IBTCProvider, BTCConfig> = {
  chain: "BTC",
  name: "Bitcoin",
  icon,
  wallets: [okx, injectable, appkit, onekey, unisat, ledger, ledgerV2, keystone],
};

export default metadata;
