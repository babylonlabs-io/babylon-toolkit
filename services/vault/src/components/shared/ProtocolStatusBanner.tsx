import {
  Container,
  Notification,
  type NotificationVariant,
} from "@babylonlabs-io/core-ui";

import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { NotificationCardV3 } from "@/components/shared/NotificationCardV3";
import {
  type ProtocolStatus,
  resolveBannerStatus,
} from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

// frozen = teal/info-light (you can still act); paused = red/error-light (full
// stop). The core-ui variant names ("paused"/"halted") are visual styles, kept
// as-is — only the protocol-status naming changed.
const STATUS_VARIANT: Record<ProtocolStatus, NotificationVariant> = {
  frozen: "paused",
  paused: "halted",
};

/**
 * Protocol governance-status banner (frozen / paused). Renders nothing unless a
 * status flag is set. DevOps can override the body text per incident via
 * NEXT_PUBLIC_PROTOCOL_STATUS_MESSAGE; otherwise the default per-status copy
 * shows.
 */
export function ProtocolStatusBanner() {
  const gate = useProtocolGateState();
  const status = resolveBannerStatus(gate);
  if (!status) {
    return null;
  }

  const copy = COPY.protocolStatus[status];

  if (featureFlags.isV3UiEnabled) {
    const v3 = COPY.protocolStatus.v3[status];
    const v3Body = featureFlags.protocolStatusMessage ?? v3.body;
    return (
      <Container className={`${PAGE_CONTENT_CLASS} py-6`}>
        <NotificationCardV3
          tone={status === "frozen" ? "soft-paused" : "fully-paused"}
          title={v3.title}
          data-testid="protocol-status-banner"
        >
          {v3Body}
        </NotificationCardV3>
      </Container>
    );
  }
  const body = featureFlags.protocolStatusMessage ?? copy.body;

  // Same Container the page sections use, so the card aligns to the content
  // column width instead of overshooting it.
  return (
    <Container className={`${PAGE_CONTENT_CLASS} py-6`}>
      <Notification
        variant={STATUS_VARIANT[status]}
        title={copy.title}
        data-testid="protocol-status-banner"
      >
        {body}
      </Notification>
    </Container>
  );
}
