import { Text } from "@babylonlabs-io/core-ui";
import { Network } from "@babylonlabs-io/wallet-connector";

import { getBTCNetwork } from "@/config";
import { COPY } from "@/copy";

// Mirrors simple-staking's NetworkBadge convention (services/simple-staking/
// src/ui/common/components/NetworkBadge/NetworkBadge.tsx): shown only on
// non-production networks, hidden entirely on mainnet.
const NON_MAINNET_NETWORKS: readonly Network[] = [
  Network.SIGNET,
  Network.TESTNET,
];

/** v3 header network indicator — the Figma "Testnet" chip (node 10084:22952). */
export function NetworkBadge() {
  if (!NON_MAINNET_NETWORKS.includes(getBTCNetwork())) return null;

  return (
    <span className="flex items-center rounded-full bg-secondary-highlight px-2.5 py-1">
      <Text as="span" variant="caption" className="text-warning-main">
        {COPY.header.networkBadge}
      </Text>
    </span>
  );
}
