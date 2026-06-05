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
import utila from "./utila";

// Export both ledger versions for consumers to choose via feature flags
export { ledger as ledgerV1, ledgerV2 };

const metadata: ChainMetadata<"BTC", IBTCProvider, BTCConfig> = {
  chain: "BTC",
  name: "Bitcoin",
  icon,
  // UniSat, OneKey, and Utila (the deriveContextHash-capable wallets) lead the
  // list. Utila is feature-flagged off by consumers until verified on devnet.
  wallets: [unisat, onekey, utila, okx, injectable, appkit, ledger, ledgerV2, keystone],
};

export default metadata;
