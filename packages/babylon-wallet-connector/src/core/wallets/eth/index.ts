import type { ChainMetadata, ETHConfig, IETHProvider } from "@/core/types";

import appkit from "./appkit";

/**
 * Ethereum chain metadata
 *
 * Defines the ETH chain configuration with available wallet providers.
 * Currently supports AppKit for connection to 600+ Ethereum wallets.
 */
const metadata: ChainMetadata<"ETH", IETHProvider, ETHConfig> = {
  chain: "ETH",
  name: "Ethereum",
  icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM2MjdhZmYiLz4KPHBhdGggZD0iTTE2LjQ5NyA0djguODdsMTAuMjAzIDQuNTUtMTAuMjAzLTEzLjQyem0wIDBMMTYuNDk3IDRMMTAuNSAxNy40MmwxMC4yMDMtNC41NUwxNi40OTcgNHoiIGZpbGw9IiNmZmYiLz4KPHBhdGggZD0iTTE2LjQ5NyAyMS45NjhMMTYuNDk3IDI4bDEwLjIwNi00LjIzNEwxNi40OTcgMjEuOTY4em0wIDYuMDMybC0xMC4yMDYtNC4yMzRMMTYuNDk3IDI4eiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjYiLz4KPHBhdGggZD0iTTE2LjQ5NyAyMC4yOTNMMjYuNyAxNy40MmwtMTAuMjAzIDIuODczem0tMTAuMjAzLTIuODczbDEwLjIwMyAyLjg3M1YxOS4yMWwtMTAuMjAzLTEuNzkweiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjIiLz4KPC9zdmc+",
  wallets: [appkit],
};

export default metadata;
