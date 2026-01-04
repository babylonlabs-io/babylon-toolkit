// Asset exports for vault application
import { getNetworkConfigBTC } from "../config";

const btcConfig = getNetworkConfigBTC();

export const bitcoinIcon = btcConfig.icon;
export const usdcIcon = "/images/usdc.png";
