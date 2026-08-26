import type { ChainMetadata, ETHConfig, IETHProvider } from "@/core/types";

import appkit from "./appkit";
import icon from "./icon.svg";

/**
 * Ethereum chain metadata
 *
 * Defines the ETH chain configuration with available wallet providers.
 * Currently supports AppKit for connection to 600+ Ethereum wallets.
 */
const metadata: ChainMetadata<"ETH", IETHProvider, ETHConfig> = {
  chain: "ETH",
  name: "Ethereum",
  // icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzYyN0VFQSIvPgogIDxwYXRoIGQ9Ik0xNiA0TDcuNSAxNi4yNUwxNiAyMkwyNC41IDE2LjI1TDE2IDR6IiBmaWxsPSJ3aGl0ZSIvPgogIDxwYXRoIGQ9Ik0xNiAyMi43NUw3LjUgMTdMMTYgMjhMMjQuNSAxN0wxNiAyMi43NXoiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNiIvPgo8L3N2Zz4=",
  icon,
  wallets: [appkit],
};

export default metadata;
