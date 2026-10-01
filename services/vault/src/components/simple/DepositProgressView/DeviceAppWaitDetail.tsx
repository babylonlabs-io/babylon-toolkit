import { Loader, Text } from "@babylonlabs-io/core-ui";

import { DETAIL_PANEL_CLASS } from "@/components/shared/layoutClasses";
import { COPY } from "@/copy";

interface DeviceAppWaitDetailProps {
  /** The device app the held operation needs, as the provider names it. */
  appName: string;
  /** True where the switch also cleared the device's deposit approval. */
  showReapproveNotice?: boolean;
}

/**
 * Shown while a device operation is held for the user to open the vault app
 * on their Ledger. The operation continues by itself once the app
 * opens, so this is a status, not an error.
 */
export function DeviceAppWaitDetail({
  appName,
  showReapproveNotice = false,
}: DeviceAppWaitDetailProps) {
  const copy = COPY.deposit.ledger;
  return (
    <div className={`mt-3 ${DETAIL_PANEL_CLASS}`} role="status">
      <span className="flex items-center gap-2">
        <Loader size={14} className="text-accent-primary" />
        <Text as="span" variant="body2" className="text-accent-primary">
          {copy.waitingForApp.title(appName)}
        </Text>
      </span>
      <Text as="p" variant="body2" className="text-accent-secondary">
        {copy.waitingForApp.body}
      </Text>
      {showReapproveNotice && (
        <Text as="p" variant="body2" className="text-accent-secondary">
          {copy.reapproveNotice}
        </Text>
      )}
    </div>
  );
}
