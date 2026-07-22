import {
  Container,
  Notification,
  type NotificationVariant,
} from "@babylonlabs-io/core-ui";

import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import {
  NotificationCard,
  type NotificationCardTone,
} from "@/components/shared/NotificationCard";
import {
  type ProtocolStatus,
  resolveBannerStatus,
} from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import { useDebugProtocolStatusOverride } from "@/dev/debugPositionStore";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

// frozen = teal/info-light (you can still act); paused = red/error-light (full
// stop). The core-ui variant names ("paused"/"halted") are visual styles, kept
// as-is — only the protocol-status naming changed.
const STATUS_VARIANT: Record<ProtocolStatus, NotificationVariant> = {
  frozen: "paused",
  paused: "halted",
};

// v3 tone per status — exhaustive over ProtocolStatus, mirroring STATUS_VARIANT
// so a new ScopeStatus fails the typecheck instead of silently falling through.
const STATUS_TONE: Record<ProtocolStatus, NotificationCardTone> = {
  frozen: "soft-paused",
  paused: "fully-paused",
};

/**
 * Protocol governance-status banner (frozen / paused). Renders nothing unless a
 * status flag is set. DevOps can override the body text per incident via
 * NEXT_PUBLIC_PROTOCOL_STATUS_MESSAGE; otherwise the default per-status copy
 * shows.
 */
export function ProtocolStatusBanner() {
  const gate = useProtocolGateState();
  // Dev-only god-mode override (compile-time null in production, see
  // debugPositionStore) — forcing "healthy" is not a scenario, so releasing the
  // override (null) is how you go back to the live gate state.
  const statusOverride = useDebugProtocolStatusOverride();
  const status = statusOverride ?? resolveBannerStatus(gate);
  if (!status) {
    return null;
  }

  if (featureFlags.isV3UiEnabled) {
    const v3 = COPY.protocolStatusV3[status];
    const body = featureFlags.protocolStatusMessage ?? v3.body;
    return (
      <Container className={`${PAGE_CONTENT_CLASS} py-6`}>
        <NotificationCard
          tone={STATUS_TONE[status]}
          title={v3.title}
          data-testid="protocol-status-banner"
        >
          {body}
        </NotificationCard>
      </Container>
    );
  }

  const copy = COPY.protocolStatus[status];
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
