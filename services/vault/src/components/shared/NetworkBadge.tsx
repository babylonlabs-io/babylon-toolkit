import { Text } from "@babylonlabs-io/core-ui";

import { getDeploymentKind } from "@/config";
import { COPY } from "@/copy";

function badgeLabel(): string | null {
  switch (getDeploymentKind()) {
    case "test":
      return COPY.header.networkBadge;
    case "internal":
      return COPY.header.internalNetworkBadge;
    case "production":
      return null;
  }
}

/** v3 header network indicator — the Figma "Testnet" chip (node 10084:22952). */
export function NetworkBadge() {
  const label = badgeLabel();
  if (label === null) return null;

  return (
    <span className="flex items-center rounded-full bg-secondary-highlight px-2.5 py-1">
      <Text
        as="span"
        variant="caption"
        className="text-primary-main dark:text-risk-amber"
      >
        {label}
      </Text>
    </span>
  );
}
