import type { BTCConfig, ChainMetadata, IBTCProvider } from "@/core/types";

import icon from "./icon.svg";
import injectable from "./injectable";
import keystone from "./keystone";
import ledger from "./ledger";
import okx from "./okx";
import onekey from "./onekey";
import unisat from "./unisat";

const metadata: ChainMetadata<"BTC", IBTCProvider, BTCConfig> = {
  chain: "BTC",
  name: "Bitcoin",
  icon,
  wallets: [okx, injectable, onekey, unisat, ledger, keystone],
};

export default metadata;
